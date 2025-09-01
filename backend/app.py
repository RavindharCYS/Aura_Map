import os
import json
import asyncio
import threading
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from pathlib import Path
import xml.etree.ElementTree as ET
from typing import List, Dict, Any
import ipaddress
import subprocess
import time
import uuid
import shutil

app = Flask(__name__)
app.config['SECRET_KEY'] = 'nmap-gui-secret-key'
CORS(app, origins="*")
socketio = SocketIO(app, cors_allowed_origins="*")

# Configuration
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / 'data'
PROJECTS_DIR = DATA_DIR / 'projects'
TEMPLATES_DIR = DATA_DIR / 'templates'
EXPORTS_DIR = DATA_DIR / 'exports'

# Ensure directories exist
for directory in [DATA_DIR, PROJECTS_DIR, TEMPLATES_DIR, EXPORTS_DIR]:
    directory.mkdir(exist_ok=True)

class ProjectManager:
    """File-based project management"""
    
    @staticmethod
    def create_project(name: str, pmo: str = '', description: str = '', assessment_type: str = 'network_pt') -> str:
        """Create new project folder and metadata file"""
        # Generate project ID
        project_id = str(uuid.uuid4())[:8]
        project_folder_name = f"{project_id}_{name.replace(' ', '_').replace('/', '_')}"
        project_folder = PROJECTS_DIR / project_folder_name
        
        # Check if project with same name exists
        if ProjectManager.get_project_by_name(name):
            raise ValueError(f"Project '{name}' already exists")
        
        # Create project folder structure
        project_folder.mkdir(exist_ok=True)
        (project_folder / 'scans').mkdir(exist_ok=True)
        (project_folder / 'reports').mkdir(exist_ok=True)
        (project_folder / 'exports').mkdir(exist_ok=True)
        
        # Create project metadata
        metadata = {
            'id': project_id,
            'name': name,
            'pmo': pmo,
            'description': description,
            'assessment_type': assessment_type,
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat(),
            'folder_path': str(project_folder),
            'scan_sessions': []
        }
        
        metadata_file = project_folder / 'project_metadata.json'
        with open(metadata_file, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        return project_id
    
    @staticmethod
    def get_all_projects() -> List[Dict]:
        """Get all projects with metadata"""
        projects = []
        
        for project_folder in PROJECTS_DIR.iterdir():
            if project_folder.is_dir():
                metadata_file = project_folder / 'project_metadata.json'
                if metadata_file.exists():
                    try:
                        with open(metadata_file, 'r') as f:
                            metadata = json.load(f)
                        
                        # Count scan files
                        scan_count = len(list((project_folder / 'scans').glob('*.xml')))
                        metadata['scan_count'] = scan_count
                        
                        # Get last scan time
                        scan_files = list((project_folder / 'scans').glob('*.xml'))
                        if scan_files:
                            last_scan = max(scan_files, key=lambda x: x.stat().st_mtime)
                            metadata['last_scan'] = datetime.fromtimestamp(last_scan.stat().st_mtime).isoformat()
                        else:
                            metadata['last_scan'] = None
                        
                        projects.append(metadata)
                    except Exception as e:
                        print(f"Error reading project metadata: {e}")
        
        return sorted(projects, key=lambda x: x['updated_at'], reverse=True)
    
    @staticmethod
    def get_project_by_name(name: str) -> Dict:
        """Get project by name"""
        for project in ProjectManager.get_all_projects():
            if project['name'] == name:
                return project
        return None
    
    @staticmethod
    def get_project_by_id(project_id: str) -> Dict:
        """Get project by ID"""
        for project in ProjectManager.get_all_projects():
            if project['id'] == project_id:
                return project
        return None
    
    @staticmethod
    def get_project_folder(project_id: str) -> Path:
        """Get project folder path"""
        project = ProjectManager.get_project_by_id(project_id)
        if project:
            return Path(project['folder_path'])
        return None
    
    @staticmethod
    def update_project_metadata(project_id: str, updates: Dict):
        """Update project metadata"""
        project_folder = ProjectManager.get_project_folder(project_id)
        if not project_folder:
            return False
        
        metadata_file = project_folder / 'project_metadata.json'
        if metadata_file.exists():
            with open(metadata_file, 'r') as f:
                metadata = json.load(f)
            
            metadata.update(updates)
            metadata['updated_at'] = datetime.now().isoformat()
            
            with open(metadata_file, 'w') as f:
                json.dump(metadata, f, indent=2)
            return True
        return False

class IPProcessor:
    """Enhanced IP processing engine for various input formats"""
    
    @staticmethod
    def expand_cidr(cidr: str) -> List[str]:
        """Expand CIDR notation to individual IPs"""
        try:
            network = ipaddress.ip_network(cidr, strict=False)
            # Limit to reasonable size to prevent memory issues
            if network.num_addresses > 10000:
                raise ValueError(f"CIDR range too large: {network.num_addresses} addresses")
            return [str(ip) for ip in network.hosts()]
        except Exception as e:
            print(f"CIDR expansion error: {e}")
            return []
    
    @staticmethod
    def expand_range(ip_range: str) -> List[str]:
        """Expand IP range (192.168.1.1-50) to individual IPs"""
        try:
            if '-' not in ip_range:
                return [ip_range]
            
            start_ip, end_part = ip_range.split('-', 1)
            start_ip = start_ip.strip()
            end_part = end_part.strip()
            
            # Handle different range formats
            if '.' in end_part:
                # Full IP range (192.168.1.1-192.168.1.50)
                start = ipaddress.ip_address(start_ip)
                end = ipaddress.ip_address(end_part)
            else:
                # Partial range (192.168.1.1-50)
                ip_parts = start_ip.split('.')
                ip_parts[-1] = end_part
                end_ip = '.'.join(ip_parts)
                start = ipaddress.ip_address(start_ip)
                end = ipaddress.ip_address(end_ip)
            
            ips = []
            current = start
            while current <= end:
                ips.append(str(current))
                current += 1
                if len(ips) > 1000:  # Safety limit
                    break
            
            return ips
        except Exception as e:
            print(f"Range expansion error: {e}")
            return [ip_range]
    
    @staticmethod
    def parse_ip_with_ports(ip_port: str) -> Dict[str, Any]:
        """Parse IP:PORT,PORT format"""
        try:
            if ':' not in ip_port:
                return {'ip': ip_port.strip(), 'ports': []}
            
            ip, ports_str = ip_port.split(':', 1)
            ports = [p.strip() for p in ports_str.split(',') if p.strip()]
            return {'ip': ip.strip(), 'ports': ports}
        except Exception:
            return {'ip': ip_port.strip(), 'ports': []}
    
    @classmethod
    def process_input(cls, input_text: str) -> List[Dict[str, Any]]:
        """Process various input formats into standardized IP list"""
        lines = [line.strip() for line in input_text.split('\n') if line.strip()]
        ip_list = []
        
        for line in lines:
            if '/' in line:
                # CIDR notation
                ips = cls.expand_cidr(line)
                ip_list.extend([{'ip': ip, 'ports': []} for ip in ips])
            elif '-' in line and not line.startswith('-'):
                # IP range
                ips = cls.expand_range(line)
                ip_list.extend([{'ip': ip, 'ports': []} for ip in ips])
            elif ':' in line:
                # IP with ports
                ip_data = cls.parse_ip_with_ports(line)
                ip_list.append(ip_data)
            else:
                # Single IP
                ip_list.append({'ip': line, 'ports': []})
        
        return ip_list

class NmapScanner:
    """Enhanced Nmap scanner with real-time capabilities"""
    
    def __init__(self):
        self.active_scans = {}
        self.scan_presets = {
            'fast': ['-F'],
            'top1000': ['--top-ports', '1000'],
            'allports': ['-p-'],
            'udp': ['-sU'],
            'stealth': ['-sS'],
            'comprehensive': ['-A'],
            'vuln': ['--script=vuln'],
            'discovery': ['-sn'],
            'ping_only': ['-sn']
        }
    
    def build_nmap_command(self, target_data: Dict[str, Any], options: Dict[str, Any]) -> tuple:
        """Build nmap command from options"""
        cmd = ['nmap']
        
        # Add preset options
        if options.get('preset') in self.scan_presets:
            cmd.extend(self.scan_presets[options['preset']])
        
        # Add custom options
        if options.get('scripts'):
            cmd.append('-sC')
        if options.get('version_detection'):
            cmd.append('-sV')
        if options.get('os_detection'):
            cmd.append('-O')
        if options.get('skip_ping'):
            cmd.append('-Pn')
        if options.get('ping_only'):
            cmd.append('-sn')
        if options.get('aggressive'):
            cmd.append('-A')
        if options.get('verbose'):
            cmd.append('-v')
        
        # Add timing template
        timing = options.get('timing', '-T3')
        if timing:
            cmd.append(timing)
        
        # Add custom ports
        if options.get('custom_ports'):
            cmd.extend(['-p', options['custom_ports']])
        elif target_data.get('ports'):
            cmd.extend(['-p', ','.join(target_data['ports'])])
        
        # Generate output filename
        timestamp = int(time.time())
        target_ip = target_data['ip']
        safe_ip = target_ip.replace('.', '_').replace(':', '_')
        output_file = f"scan_{safe_ip}_{timestamp}"
        
        # Output formats
        cmd.extend(['-oX', f"{output_file}.xml"])
        cmd.extend(['-oN', f"{output_file}.nmap"])
        cmd.extend(['-oG', f"{output_file}.gnmap"])
        
        # Target IP
        cmd.append(target_ip)
        
        return cmd, output_file
    
    def scan_single_ip(self, target_data: Dict[str, Any], options: Dict[str, Any], 
                      project_folder: Path, scan_session_id: str) -> Dict[str, Any]:
        """Scan a single IP with real-time updates"""
        target_ip = target_data['ip']
        scan_folder = project_folder / 'scans'
        
        try:
            # Build command
            cmd, output_file = self.build_nmap_command(target_data, options)
            
            # Start scan process
            start_time = datetime.now()
            process = subprocess.Popen(
                cmd, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE,
                text=True,
                cwd=scan_folder
            )
            
            # Store active scan
            self.active_scans[scan_session_id] = {
                'process': process,
                'target_ip': target_ip,
                'start_time': start_time,
                'output_file': output_file
            }
            
            # Wait for completion
            stdout, stderr = process.communicate()
            end_time = datetime.now()
            
            # Parse results
            xml_file = scan_folder / f"{output_file}.xml"
            nmap_file = scan_folder / f"{output_file}.nmap"
            gnmap_file = scan_folder / f"{output_file}.gnmap"
            
            result = {
                'target_ip': target_ip,
                'status': 'completed' if process.returncode == 0 else 'failed',
                'start_time': start_time.isoformat(),
                'end_time': end_time.isoformat(),
                'duration': str(end_time - start_time),
                'xml_file': f"{output_file}.xml" if xml_file.exists() else None,
                'nmap_file': f"{output_file}.nmap" if nmap_file.exists() else None,
                'gnmap_file': f"{output_file}.gnmap" if gnmap_file.exists() else None,
                'stdout': stdout,
                'stderr': stderr,
                'return_code': process.returncode,
                'nmap_command': ' '.join(cmd)
            }
            
            # Parse XML for structured data
            if xml_file.exists():
                parsed_data = self.parse_nmap_xml(xml_file)
                result.update(parsed_data)
            
            # Save scan metadata
            self.save_scan_metadata(project_folder, target_ip, result, options)
            
            # Cleanup active scan
            if scan_session_id in self.active_scans:
                del self.active_scans[scan_session_id]
            
            return result
            
        except Exception as e:
            return {
                'target_ip': target_ip,
                'status': 'error',
                'error': str(e),
                'start_time': datetime.now().isoformat()
            }
    
    def save_scan_metadata(self, project_folder: Path, target_ip: str, result: Dict, options: Dict):
        """Save scan metadata to JSON file"""
        metadata_file = project_folder / 'scans' / f"scan_{target_ip.replace('.', '_')}_{int(time.time())}_metadata.json"
        
        scan_metadata = {
            'target_ip': target_ip,
            'scan_result': result,
            'scan_options': options,
            'timestamp': datetime.now().isoformat()
        }
        
        with open(metadata_file, 'w') as f:
            json.dump(scan_metadata, f, indent=2)
    
    def parse_nmap_xml(self, xml_file: Path) -> Dict[str, Any]:
        """Parse nmap XML output into structured data"""
        try:
            tree = ET.parse(xml_file)
            root = tree.getroot()
            
            result = {
                'host_status': 'down',
                'open_ports': 0,
                'services': [],
                'os_info': '',
                'hostnames': [],
                'scan_summary': {}
            }
            
            # Find host element
            host = root.find('host')
            if host is None:
                return result
            
            # Host status
            status = host.find('status')
            if status is not None:
                result['host_status'] = status.get('state', 'unknown')
            
            # Hostnames
            hostnames = host.find('hostnames')
            if hostnames is not None:
                for hostname in hostnames.findall('hostname'):
                    result['hostnames'].append({
                        'name': hostname.get('name'),
                        'type': hostname.get('type')
                    })
            
            # Ports
            ports = host.find('ports')
            if ports is not None:
                for port in ports.findall('port'):
                    port_data = {
                        'port': port.get('portid'),
                        'protocol': port.get('protocol'),
                        'state': port.find('state').get('state') if port.find('state') is not None else 'unknown'
                    }
                    
                    # Service information
                    service = port.find('service')
                    if service is not None:
                        port_data.update({
                            'service': service.get('name', ''),
                            'version': service.get('version', ''),
                            'product': service.get('product', ''),
                            'extrainfo': service.get('extrainfo', '')
                        })
                    
                    # Script results
                    scripts = port.findall('script')
                    if scripts:
                        port_data['scripts'] = []
                        for script in scripts:
                            port_data['scripts'].append({
                                'id': script.get('id'),
                                'output': script.get('output', '')
                            })
                    
                    result['services'].append(port_data)
                    
                    if port_data['state'] == 'open':
                        result['open_ports'] += 1
            
            # OS Detection
            os_elem = host.find('os')
            if os_elem is not None:
                osmatch = os_elem.find('osmatch')
                if osmatch is not None:
                    result['os_info'] = osmatch.get('name', '')
            
            # Scan summary
            runstats = root.find('runstats')
            if runstats is not None:
                finished = runstats.find('finished')
                if finished is not None:
                    result['scan_summary'] = {
                        'elapsed': finished.get('elapsed'),
                        'timestr': finished.get('timestr'),
                        'exit': finished.get('exit')
                    }
            
            return result
            
        except Exception as e:
            return {'parse_error': str(e)}

class TemplateManager:
    """Manage scan templates"""
    
    @staticmethod
    def load_templates() -> List[Dict]:
        """Load all scan templates"""
        templates = []
        
        # Built-in templates
        built_in_templates = [
            {
                'id': 'fast',
                'name': 'Fast Scan',
                'description': 'Quick scan of most common ports (-F)',
                'options': {'preset': 'fast', 'timing': '-T4'},
                'built_in': True
            },
            {
                'id': 'top1000',
                'name': 'Top 1000 Ports',
                'description': 'Scan top 1000 most common ports',
                'options': {'preset': 'top1000', 'timing': '-T4'},
                'built_in': True
            },
            {
                'id': 'comprehensive',
                'name': 'Comprehensive Scan',
                'description': 'Full scan with OS detection and scripts (-A)',
                'options': {'preset': 'comprehensive', 'timing': '-T4'},
                'built_in': True
            },
            {
                'id': 'stealth',
                'name': 'Stealth SYN Scan',
                'description': 'SYN stealth scan (-sS)',
                'options': {'preset': 'stealth', 'timing': '-T3'},
                'built_in': True
            },
            {
                'id': 'vuln',
                'name': 'Vulnerability Scan',
                'description': 'Scan with vulnerability detection scripts',
                'options': {'preset': 'vuln', 'scripts': True, 'timing': '-T4'},
                'built_in': True
            },
            {
                'id': 'discovery',
                'name': 'Network Discovery',
                'description': 'Host discovery scan (-sn)',
                'options': {'preset': 'discovery', 'timing': '-T4'},
                'built_in': True
            }
        ]
        
        templates.extend(built_in_templates)
        
        # Custom templates from files
        if TEMPLATES_DIR.exists():
            for template_file in TEMPLATES_DIR.glob('*.json'):
                try:
                    with open(template_file, 'r') as f:
                        template = json.load(f)
                        template['id'] = template_file.stem
                        template['built_in'] = False
                        templates.append(template)
                except Exception as e:
                    print(f"Error loading template {template_file}: {e}")
        
        return templates
    
    @staticmethod
    def save_template(name: str, description: str, options: Dict) -> bool:
        """Save custom template"""
        try:
            template = {
                'name': name,
                'description': description,
                'options': options,
                'created_at': datetime.now().isoformat()
            }
            
            template_file = TEMPLATES_DIR / f"{name.replace(' ', '_').lower()}.json"
            with open(template_file, 'w') as f:
                json.dump(template, f, indent=2)
            
            return True
        except Exception as e:
            print(f"Error saving template: {e}")
            return False

# Initialize components
scanner = NmapScanner()
project_manager = ProjectManager()
template_manager = TemplateManager()

# API Routes

@app.route('/api/projects', methods=['GET'])
def get_projects():
    """Get all projects with metadata"""
    try:
        projects = project_manager.get_all_projects()
        return jsonify(projects)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/projects', methods=['POST'])
def create_new_project():
    """Create new project"""
    data = request.json
    
    try:
        project_id = project_manager.create_project(
            name=data['name'],
            pmo=data.get('pmo', ''),
            description=data.get('description', ''),
            assessment_type=data.get('assessment_type', 'network_pt')
        )
        
        return jsonify({
            'success': True,
            'project_id': project_id,
            'message': f"Project '{data['name']}' created successfully"
        })
    
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': f"Failed to create project: {str(e)}"}), 500

@app.route('/api/projects/<project_id>/scans', methods=['GET'])
def get_project_scans(project_id):
    """Get scan history for a project"""
    try:
        project_folder = project_manager.get_project_folder(project_id)
        if not project_folder:
            return jsonify({'error': 'Project not found'}), 404
        
        scans = []
        scan_folder = project_folder / 'scans'
        
        # Get all scan metadata files
        for metadata_file in scan_folder.glob('*_metadata.json'):
            try:
                with open(metadata_file, 'r') as f:
                    scan_data = json.load(f)
                scans.append(scan_data)
            except Exception as e:
                print(f"Error reading scan metadata: {e}")
        
        # Sort by timestamp
        scans.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        
        return jsonify(scans)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/scan/process-input', methods=['POST'])
def process_scan_input():
    """Process and validate input targets"""
    data = request.json
    input_text = data.get('input', '')
    
    try:
        ip_list = IPProcessor.process_input(input_text)
        
        return jsonify({
            'success': True,
            'targets': ip_list,
            'total_targets': len(ip_list),
            'estimated_time': len(ip_list) * 30  # Rough estimate in seconds
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f"Input processing failed: {str(e)}"
        }), 400

@app.route('/api/scan/start', methods=['POST'])
def start_scan():
    """Start scanning process"""
    data = request.json
    
    project_id = data.get('project_id')
    targets = data.get('targets', [])
    options = data.get('options', {})
    
    if not project_id or not targets:
        return jsonify({'success': False, 'error': 'Project ID and targets required'}), 400
    
    # Verify project exists
    project_folder = project_manager.get_project_folder(project_id)
    if not project_folder:
        return jsonify({'success': False, 'error': 'Project not found'}), 404
    
    # Generate scan session ID
    scan_session_id = str(uuid.uuid4())
    
    # Create scan session metadata
    session_metadata = {
        'scan_session_id': scan_session_id,
        'project_id': project_id,
        'targets': targets,
        'options': options,
        'start_time': datetime.now().isoformat(),
        'status': 'running',
        'completed_targets': 0,
        'total_targets': len(targets)
    }
    
    session_file = project_folder / f"scan_session_{scan_session_id}.json"
    with open(session_file, 'w') as f:
        json.dump(session_metadata, f, indent=2)
    
    # Start scanning in background thread
    def scan_worker():
        asyncio.run(scan_ip_list(targets, options, project_id, project_folder, scan_session_id))
    
    thread = threading.Thread(target=scan_worker)
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'success': True,
        'scan_session_id': scan_session_id,
        'message': f'Started scanning {len(targets)} targets'
    })

async def scan_ip_list(targets: List[Dict], options: Dict, project_id: str, 
                      project_folder: Path, scan_session_id: str):
    """Scan list of IPs with real-time updates"""
    total_targets = len(targets)
    completed = 0
    start_time = time.time()
    
    # Emit scan start
    socketio.emit('scan_started', {
        'scan_session_id': scan_session_id,
        'total_targets': total_targets,
        'project_id': project_id
    })
    
    for target_data in targets:
        target_ip = target_data['ip']
        
        # Calculate ETA
        if completed > 0:
            elapsed = time.time() - start_time
            avg_time_per_target = elapsed / completed
            remaining_targets = total_targets - completed
            eta_seconds = remaining_targets * avg_time_per_target
            eta = str(int(eta_seconds // 60)) + ":" + str(int(eta_seconds % 60)).zfill(2)
        else:
            eta = "Calculating..."
        
        # Emit current target update
        socketio.emit('scan_progress', {
            'scan_session_id': scan_session_id,
            'current_target': target_ip,
            'completed': completed,
            'total': total_targets,
            'progress': (completed / total_targets) * 100,
            'eta': eta,
            'elapsed': str(int((time.time() - start_time) // 60)) + ":" + str(int((time.time() - start_time) % 60)).zfill(2)
        })
        
        # Perform scan
        try:
            result = scanner.scan_single_ip(target_data, options, project_folder, scan_session_id)
            
            # Emit result
            socketio.emit('host_result', {
                'scan_session_id': scan_session_id,
                'target_ip': target_ip,
                'result': result
            })
            
        except Exception as e:
            # Emit error
            socketio.emit('host_error', {
                'scan_session_id': scan_session_id,
                'target_ip': target_ip,
                'error': str(e)
            })
        
        completed += 1
        
        # Update session metadata
        session_file = project_folder / f"scan_session_{scan_session_id}.json"
        if session_file.exists():
            with open(session_file, 'r') as f:
                session_data = json.load(f)
            
            session_data['completed_targets'] = completed
            session_data['progress'] = (completed / total_targets) * 100
            
            with open(session_file, 'w') as f:
                json.dump(session_data, f, indent=2)
    
    # Update session as completed
    session_file = project_folder / f"scan_session_{scan_session_id}.json"
    if session_file.exists():
        with open(session_file, 'r') as f:
            session_data = json.load(f)
        
        session_data['status'] = 'completed'
        session_data['end_time'] = datetime.now().isoformat()
        
        with open(session_file, 'w') as f:
            json.dump(session_data, f, indent=2)
    
    # Emit scan completion
    socketio.emit('scan_completed', {
        'scan_session_id': scan_session_id,
        'total_completed': completed,
        'total_targets': total_targets
    })

@app.route('/api/scan/cancel', methods=['POST'])
def cancel_scan():
    """Cancel active scan"""
    data = request.json
    scan_session_id = data.get('scan_session_id')
    
    if scan_session_id in scanner.active_scans:
        scan_info = scanner.active_scans[scan_session_id]
        try:
            scan_info['process'].terminate()
            del scanner.active_scans[scan_session_id]
            
            socketio.emit('scan_cancelled', {
                'scan_session_id': scan_session_id
            })
            
            return jsonify({'success': True, 'message': 'Scan cancelled'})
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
    
    return jsonify({'success': False, 'error': 'Scan not found'}), 404

@app.route('/api/templates', methods=['GET'])
def get_scan_templates():
    """Get available scan templates"""
    try:
        templates = template_manager.load_templates()
        return jsonify(templates)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/templates', methods=['POST'])
def save_scan_template():
    """Save custom scan template"""
    data = request.json
    
    try:
        success = template_manager.save_template(
            name=data['name'],
            description=data.get('description', ''),
            options=data['options']
        )
        
        if success:
            return jsonify({
                'success': True,
                'message': f"Template '{data['name']}' saved"
            })
        else:
            return jsonify({'success': False, 'error': 'Failed to save template'}), 500
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/projects/<project_id>/files', methods=['GET'])
def get_project_files(project_id):
    """Get all files in project directory"""
    try:
        project_folder = project_manager.get_project_folder(project_id)
        if not project_folder:
            return jsonify({'error': 'Project not found'}), 404
        
        files = {
            'scans': [],
            'reports': [],
            'exports': []
        }
        
        # Scan files
        scan_folder = project_folder / 'scans'
        if scan_folder.exists():
            for file_path in scan_folder.iterdir():
                if file_path.is_file():
                    files['scans'].append({
                        'name': file_path.name,
                        'size': file_path.stat().st_size,
                        'modified': datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(),
                        'type': file_path.suffix[1:] if file_path.suffix else 'unknown'
                    })
        
        # Report files
        report_folder = project_folder / 'reports'
        if report_folder.exists():
            for file_path in report_folder.iterdir():
                if file_path.is_file():
                    files['reports'].append({
                        'name': file_path.name,
                        'size': file_path.stat().st_size,
                        'modified': datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(),
                        'type': file_path.suffix[1:] if file_path.suffix else 'unknown'
                    })
        
        return jsonify(files)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/projects/<project_id>/open-folder', methods=['POST'])
def open_project_folder(project_id):
    """Open project folder in system file manager"""
    try:
        project_folder = project_manager.get_project_folder(project_id)
        if not project_folder:
            return jsonify({'error': 'Project not found'}), 404
        
        import platform
        system = platform.system()
        
        if system == 'Windows':
            os.startfile(str(project_folder))
        elif system == 'Darwin':  # macOS
            subprocess.run(['open', str(project_folder)])
        else:  # Linux
            subprocess.run(['xdg-open', str(project_folder)])
        
        return jsonify({'success': True, 'message': 'Project folder opened'})
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/projects/<project_id>/export', methods=['GET'])
def export_project_results(project_id):
    """Export project results in various formats"""
    try:
        format_type = request.args.get('format', 'json')
        project = project_manager.get_project_by_id(project_id)
        
        if not project:
            return jsonify({'error': 'Project not found'}), 404
        
        project_folder = Path(project['folder_path'])
        scan_folder = project_folder / 'scans'
        
        # Aggregate all scan results
        all_results = []
        
        for metadata_file in scan_folder.glob('*_metadata.json'):
            try:
                with open(metadata_file, 'r') as f:
                    scan_data = json.load(f)
                all_results.append(scan_data)
            except Exception as e:
                print(f"Error reading scan metadata: {e}")
        
        # Create export data
        export_data = {
            'project': project,
            'export_timestamp': datetime.now().isoformat(),
            'total_scans': len(all_results),
            'results': all_results
        }
        
        # Create export file
        timestamp = int(time.time())
        export_filename = f"export_{project['name'].replace(' ', '_')}_{timestamp}.json"
        export_path = EXPORTS_DIR / export_filename
        
        with open(export_path, 'w') as f:
            json.dump(export_data, f, indent=2)
        
        return send_from_directory(EXPORTS_DIR, export_filename, as_attachment=True)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/projects/<project_id>/aggregate', methods=['GET'])
def aggregate_project_results(project_id):
    """Aggregate all scan results for a project"""
    try:
        project_folder = project_manager.get_project_folder(project_id)
        if not project_folder:
            return jsonify({'error': 'Project not found'}), 404
        
        scan_folder = project_folder / 'scans'
        
        # Aggregate statistics
        stats = {
            'total_hosts_scanned': 0,
            'hosts_up': 0,
            'hosts_down': 0,
            'total_open_ports': 0,
            'unique_services': set(),
            'os_detected': [],
            'scan_timeline': []
        }
        
        detailed_results = []
        
        # Process all scan metadata files
        for metadata_file in scan_folder.glob('*_metadata.json'):
            try:
                with open(metadata_file, 'r') as f:
                    scan_data = json.load(f)
                
                result = scan_data.get('scan_result', {})
                stats['total_hosts_scanned'] += 1
                
                if result.get('host_status') == 'up':
                    stats['hosts_up'] += 1
                else:
                    stats['hosts_down'] += 1
                
                stats['total_open_ports'] += result.get('open_ports', 0)
                
                # Collect unique services
                for service in result.get('services', []):
                    if service.get('service'):
                        stats['unique_services'].add(service['service'])
                
                # OS information
                if result.get('os_info'):
                    stats['os_detected'].append({
                        'ip': result['target_ip'],
                        'os': result['os_info']
                    })
                
                # Timeline data
                stats['scan_timeline'].append({
                    'ip': result['target_ip'],
                    'timestamp': scan_data.get('timestamp'),
                    'status': result.get('host_status', 'unknown')
                })
                
                detailed_results.append(scan_data)
                
            except Exception as e:
                print(f"Error processing scan metadata: {e}")
        
        # Convert set to list for JSON serialization
        stats['unique_services'] = list(stats['unique_services'])
        
        return jsonify({
            'statistics': stats,
            'detailed_results': detailed_results
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/system/info', methods=['GET'])
def get_system_info():
    """Get system information and nmap availability"""
    try:
        # Check if nmap is available
        nmap_version = None
        try:
            result = subprocess.run(['nmap', '--version'], capture_output=True, text=True)
            if result.returncode == 0:
                nmap_version = result.stdout.split('\n')[0]
        except Exception:
            nmap_version = "Not installed or not in PATH"
        
        # System info
        import platform
        system_info = {
            'platform': platform.system(),
            'platform_version': platform.version(),
            'python_version': platform.python_version(),
            'nmap_version': nmap_version,
            'data_directory': str(DATA_DIR),
            'projects_directory': str(PROJECTS_DIR)
        }
        
        return jsonify(system_info)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# WebSocket Events
@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    emit('connected', {'message': 'Connected to Nmap GUI backend'})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    print('Client disconnected')

@socketio.on('join_scan_session')
def handle_join_scan_session(data):
    """Join a scan session for real-time updates"""
    scan_session_id = data.get('scan_session_id')
    if scan_session_id:
        emit('joined_scan_session', {'scan_session_id': scan_session_id})

# Static file serving
@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('../frontend', filename)

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    print(f"Starting Nmap GUI Tool...")
    print(f"Data directory: {DATA_DIR}")
    print(f"Projects directory: {PROJECTS_DIR}")
    print(f"Templates directory: {TEMPLATES_DIR}")
    print(f"Exports directory: {EXPORTS_DIR}")
    
    # Check nmap installation
    try:
        result = subprocess.run(['nmap', '--version'], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"Nmap detected: {result.stdout.splitlines()[0]}")
        else:
            print("WARNING: Nmap not detected. Please install nmap and ensure it's in your PATH.")
    except Exception:
        print("WARNING: Nmap not detected. Please install nmap and ensure it's in your PATH.")
    
    # Initialize default templates
    default_templates = [
        {
            'name': 'Fast Discovery',
            'description': 'Quick ping sweep and fast port scan',
            'options': {'preset': 'fast', 'timing': '-T4'}
        },
        {
            'name': 'Stealth Comprehensive',
            'description': 'SYN stealth scan with OS detection',
            'options': {'preset': 'stealth', 'os_detection': True, 'version_detection': True}
        },
        {
            'name': 'Vulnerability Assessment',
            'description': 'Comprehensive scan with vulnerability scripts',
            'options': {'preset': 'vuln', 'scripts': True, 'timing': '-T4'}
        }
    ]
    
    for template in default_templates:
        template_file = TEMPLATES_DIR / f"{template['name'].replace(' ', '_').lower()}.json"
        if not template_file.exists():
            template_manager.save_template(
                template['name'],
                template['description'],
                template['options']
            )
    
    print("Starting Flask-SocketIO server...")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)