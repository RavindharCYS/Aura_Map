"""
Enhanced Nmap GUI Tool - Nmap Scanner Module
Core scanning functionality with enhanced features
"""

import os
import json
import time
import subprocess
import threading
from pathlib import Path
from datetime import datetime
import xml.etree.ElementTree as ET
from typing import Dict, List, Any, Optional, Tuple
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class NmapScanner:
    """Enhanced Nmap scanner with real-time capabilities"""
    
    def __init__(self):
        self.active_scans = {}
        self.scan_presets = {
            'fast': ['-F'],
            'top1000': ['--top-ports', '1000'],
            'allports': ['-p-'],
            'udp': ['-sU', '--top-ports', '100'],
            'stealth': ['-sS'],
            'comprehensive': ['-A'],
            'vuln': ['--script=vuln'],
            'discovery': ['-sn'],
            'ping_only': ['-sn']
        }
        self.verify_nmap_installation()
    
    def verify_nmap_installation(self) -> bool:
        """Verify nmap is installed and accessible"""
        try:
            result = subprocess.run(['nmap', '--version'], 
                                  capture_output=True, 
                                  text=True, 
                                  timeout=5)
            if result.returncode == 0:
                version_line = result.stdout.split('\n')[0]
                logger.info(f"Nmap detected: {version_line}")
                return True
            else:
                logger.error("Nmap not found or not accessible")
                return False
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            logger.error(f"Failed to verify nmap installation: {e}")
            return False
    
    def build_nmap_command(self, target_data: Dict[str, Any], 
                          options: Dict[str, Any]) -> Tuple[List[str], str]:
        """Build nmap command from options"""
        cmd = ['nmap']
        
        # Add preset options
        preset = options.get('preset', 'fast')
        if preset in self.scan_presets:
            cmd.extend(self.scan_presets[preset])
        
        # Add custom options based on checkboxes
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
    
    def scan_single_ip(self, target_data: Dict[str, Any], 
                      options: Dict[str, Any], 
                      project_folder: Path, 
                      scan_session_id: str,
                      progress_callback=None) -> Dict[str, Any]:
        """Scan a single IP with real-time updates"""
        target_ip = target_data['ip']
        scan_folder = project_folder / 'scans'
        
        try:
            # Build command
            cmd, output_file = self.build_nmap_command(target_data, options)
            
            logger.info(f"Starting scan for {target_ip}: {' '.join(cmd)}")
            
            # Start scan process
            start_time = datetime.now()
            process = subprocess.Popen(
                cmd, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE,
                text=True,
                cwd=str(scan_folder),
                bufsize=1,
                universal_newlines=True
            )
            
            # Store active scan
            self.active_scans[scan_session_id] = {
                'process': process,
                'target_ip': target_ip,
                'start_time': start_time,
                'output_file': output_file
            }
            
            # Monitor process output for progress
            if progress_callback:
                thread = threading.Thread(
                    target=self._monitor_scan_progress,
                    args=(process, target_ip, progress_callback)
                )
                thread.daemon = True
                thread.start()
            
            # Wait for completion
            stdout, stderr = process.communicate()
            end_time = datetime.now()
            
            # Check if scan was cancelled
            if scan_session_id not in self.active_scans:
                return {
                    'target_ip': target_ip,
                    'status': 'cancelled',
                    'start_time': start_time.isoformat(),
                    'end_time': end_time.isoformat()
                }
            
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
                'command': ' '.join(cmd)
            }
            
            # Parse XML for structured data
            if xml_file.exists():
                parsed_data = self.parse_nmap_xml(xml_file)
                result.update(parsed_data)
            else:
                logger.warning(f"XML file not found for {target_ip}")
            
            # Save scan metadata
            self.save_scan_metadata(project_folder, target_ip, result, options)
            
            # Cleanup active scan
            if scan_session_id in self.active_scans:
                del self.active_scans[scan_session_id]
            
            logger.info(f"Scan completed for {target_ip}: {result['status']}")
            return result
            
        except Exception as e:
            logger.error(f"Error scanning {target_ip}: {e}")
            return {
                'target_ip': target_ip,
                'status': 'error',
                'error': str(e),
                'start_time': datetime.now().isoformat()
            }
    
    def _monitor_scan_progress(self, process, target_ip, callback):
        """Monitor scan progress from stdout"""
        try:
            for line in process.stdout:
                if line.strip():
                    # Extract progress information from verbose output
                    if 'Completed' in line and '%' in line:
                        try:
                            # Parse progress percentage
                            parts = line.split()
                            for part in parts:
                                if '%' in part:
                                    progress = float(part.replace('%', ''))
                                    callback(target_ip, progress, line.strip())
                                    break
                        except:
                            pass
                    else:
                        # Send raw output
                        callback(target_ip, None, line.strip())
        except Exception as e:
            logger.error(f"Error monitoring scan progress: {e}")
    
    def cancel_scan(self, scan_session_id: str) -> bool:
        """Cancel an active scan"""
        if scan_session_id in self.active_scans:
            try:
                scan_info = self.active_scans[scan_session_id]
                process = scan_info['process']
                
                # Terminate the process
                process.terminate()
                
                # Wait a moment for graceful termination
                time.sleep(1)
                
                # Force kill if still running
                if process.poll() is None:
                    process.kill()
                
                # Remove from active scans
                del self.active_scans[scan_session_id]
                
                logger.info(f"Scan {scan_session_id} cancelled successfully")
                return True
                
            except Exception as e:
                logger.error(f"Error cancelling scan {scan_session_id}: {e}")
                return False
        
        return False
    
    def save_scan_metadata(self, project_folder: Path, target_ip: str, 
                          result: Dict, options: Dict):
        """Save scan metadata to JSON file"""
        timestamp = int(time.time())
        safe_ip = target_ip.replace('.', '_').replace(':', '_')
        metadata_file = project_folder / 'scans' / f"scan_{safe_ip}_{timestamp}_metadata.json"
        
        scan_metadata = {
            'target_ip': target_ip,
            'scan_result': result,
            'scan_options': options,
            'timestamp': datetime.now().isoformat()
        }
        
        try:
            with open(metadata_file, 'w') as f:
                json.dump(scan_metadata, f, indent=2)
            logger.info(f"Saved scan metadata for {target_ip}")
        except Exception as e:
            logger.error(f"Failed to save scan metadata: {e}")
    
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
                'scan_info': {},
                'scripts': {}
            }
            
            # Parse scan info
            scaninfo = root.find('scaninfo')
            if scaninfo is not None:
                result['scan_info'] = {
                    'type': scaninfo.get('type'),
                    'protocol': scaninfo.get('protocol'),
                    'numservices': scaninfo.get('numservices'),
                    'services': scaninfo.get('services')
                }
            
            # Find host element
            host = root.find('host')
            if host is None:
                return result
            
            # Host status
            status = host.find('status')
            if status is not None:
                result['host_status'] = status.get('state', 'unknown')
                result['host_status_reason'] = status.get('reason', '')
            
            # Hostnames
            hostnames = host.find('hostnames')
            if hostnames is not None:
                for hostname in hostnames.findall('hostname'):
                    result['hostnames'].append({
                        'name': hostname.get('name'),
                        'type': hostname.get('type')
                    })
            
            # Address info
            addresses = host.findall('address')
            for address in addresses:
                addr_type = address.get('addrtype')
                if addr_type == 'mac':
                    result['mac_address'] = address.get('addr')
                    result['mac_vendor'] = address.get('vendor', '')
            
            # Ports
            ports = host.find('ports')
            if ports is not None:
                # Parse extraports
                extraports = ports.find('extraports')
                if extraports is not None:
                    result['extraports'] = {
                        'state': extraports.get('state'),
                        'count': int(extraports.get('count', 0))
                    }
                
                # Parse individual ports
                for port in ports.findall('port'):
                    port_data = {
                        'port': port.get('portid'),
                        'protocol': port.get('protocol'),
                        'state': 'unknown'
                    }
                    
                    # Port state
                    state = port.find('state')
                    if state is not None:
                        port_data['state'] = state.get('state')
                        port_data['reason'] = state.get('reason', '')
                        port_data['reason_ttl'] = state.get('reason_ttl', '')
                    
                    # Service information
                    service = port.find('service')
                    if service is not None:
                        port_data.update({
                            'service': service.get('name', ''),
                            'product': service.get('product', ''),
                            'version': service.get('version', ''),
                            'extrainfo': service.get('extrainfo', ''),
                            'ostype': service.get('ostype', ''),
                            'method': service.get('method', ''),
                            'conf': service.get('conf', '')
                        })
                        
                        # CPE information
                        cpes = service.findall('cpe')
                        if cpes:
                            port_data['cpe'] = [cpe.text for cpe in cpes]
                    
                    # Script results
                    scripts = port.findall('script')
                    if scripts:
                        port_data['scripts'] = []
                        for script in scripts:
                            script_data = {
                                'id': script.get('id'),
                                'output': script.get('output', '')
                            }
                            
                            # Parse script elements
                            elements = script.findall('elem')
                            if elements:
                                script_data['elements'] = {}
                                for elem in elements:
                                    key = elem.get('key')
                                    if key:
                                        script_data['elements'][key] = elem.text
                            
                            port_data['scripts'].append(script_data)
                    
                    result['services'].append(port_data)
                    
                    if port_data['state'] == 'open':
                        result['open_ports'] += 1
            
            # OS Detection
            os_elem = host.find('os')
            if os_elem is not None:
                # OS matches
                osmatches = os_elem.findall('osmatch')
                if osmatches:
                    best_match = osmatches[0]  # First match is usually best
                    result['os_info'] = best_match.get('name', '')
                    result['os_accuracy'] = best_match.get('accuracy', '')
                    
                    # OS classes
                    osclasses = best_match.findall('osclass')
                    if osclasses:
                        result['os_classes'] = []
                        for osclass in osclasses:
                            result['os_classes'].append({
                                'type': osclass.get('type'),
                                'vendor': osclass.get('vendor'),
                                'osfamily': osclass.get('osfamily'),
                                'osgen': osclass.get('osgen'),
                                'accuracy': osclass.get('accuracy')
                            })
                
                # Port used for OS detection
                portused = os_elem.find('portused')
                if portused is not None:
                    result['os_portused'] = {
                        'state': portused.get('state'),
                        'proto': portused.get('proto'),
                        'portid': portused.get('portid')
                    }
            
            # Host scripts
            hostscripts = host.findall('hostscript/script')
            if hostscripts:
                result['host_scripts'] = []
                for script in hostscripts:
                    result['host_scripts'].append({
                        'id': script.get('id'),
                        'output': script.get('output', '')
                    })
            
            # Trace information
            trace = host.find('trace')
            if trace is not None:
                result['traceroute'] = []
                for hop in trace.findall('hop'):
                    result['traceroute'].append({
                        'ttl': hop.get('ttl'),
                        'ipaddr': hop.get('ipaddr'),
                        'rtt': hop.get('rtt'),
                        'host': hop.get('host', '')
                    })
            
            # Scan times
            times = host.find('times')
            if times is not None:
                result['scan_times'] = {
                    'srtt': times.get('srtt'),
                    'rttvar': times.get('rttvar'),
                    'to': times.get('to')
                }
            
            # Run statistics
            runstats = root.find('runstats')
            if runstats is not None:
                finished = runstats.find('finished')
                if finished is not None:
                    result['scan_summary'] = {
                        'elapsed': finished.get('elapsed'),
                        'time': finished.get('time'),
                        'timestr': finished.get('timestr'),
                        'exit': finished.get('exit')
                    }
                
                hosts = runstats.find('hosts')
                if hosts is not None:
                    result['hosts_summary'] = {
                        'up': int(hosts.get('up', 0)),
                        'down': int(hosts.get('down', 0)),
                        'total': int(hosts.get('total', 0))
                    }
            
            return result
            
        except Exception as e:
            logger.error(f"Error parsing XML file {xml_file}: {e}")
            return {'parse_error': str(e)}
    
    def get_active_scans(self) -> List[Dict[str, Any]]:
        """Get list of currently active scans"""
        active = []
        for session_id, scan_info in self.active_scans.items():
            active.append({
                'session_id': session_id,
                'target_ip': scan_info['target_ip'],
                'start_time': scan_info['start_time'].isoformat(),
                'duration': str(datetime.now() - scan_info['start_time'])
            })
        return active
    
    def cleanup_abandoned_scans(self, max_age_hours: int = 24):
        """Clean up scans that have been running too long"""
        current_time = datetime.now()
        sessions_to_remove = []
        
        for session_id, scan_info in self.active_scans.items():
            age = current_time - scan_info['start_time']
            if age.total_seconds() > (max_age_hours * 3600):
                logger.warning(f"Cleaning up abandoned scan {session_id}")
                self.cancel_scan(session_id)
                sessions_to_remove.append(session_id)
        
        for session_id in sessions_to_remove:
            if session_id in self.active_scans:
                del self.active_scans[session_id]


# Singleton instance
scanner = NmapScanner()