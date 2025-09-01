"""
Enhanced Nmap GUI Tool - Configuration Management
File-based configuration for network scanning tool
"""

import os
import json
from pathlib import Path
from typing import Dict, Any, List

class Config:
    """Central configuration management"""
    
    def __init__(self):
        self.base_dir = Path(__file__).parent
        self.config_file = self.base_dir / 'config.json'
        self.load_config()
    
    def load_config(self):
        """Load configuration from file or create defaults"""
        default_config = {
            'application': {
                'name': 'Auriseg Map - Enhanced Nmap GUI',
                'version': '2.0.0',
                'debug': False,
                'host': '0.0.0.0',
                'port': 5000
            },
            'directories': {
                'data_dir': 'data',
                'projects_dir': 'data/projects',
                'templates_dir': 'data/templates',
                'exports_dir': 'data/exports',
                'plugins_dir': 'plugins'
            },
            'scanning': {
                'max_concurrent_scans': 5,
                'default_timeout': 300,
                'max_targets_per_scan': 1000,
                'default_timing': '-T3',
                'output_formats': ['xml', 'nmap', 'gnmap']
            },
            'nmap': {
                'binary_path': 'nmap',
                'verify_installation': True,
                'default_options': ['-v'],
                'max_cidr_size': 10000,
                'max_range_size': 1000
            },
            'security': {
                'allowed_scan_types': ['fast', 'top1000', 'allports', 'stealth', 'comprehensive', 'vuln', 'discovery'],
                'blocked_options': ['--script-help', '--script-trace', '--iflist'],
                'validate_targets': True,
                'allow_localhost': False,
                'allow_private_networks': True
            },
            'ui': {
                'theme': 'light',
                'auto_refresh_interval': 2000,
                'max_log_entries': 1000,
                'enable_notifications': True,
                'panel_sizes': {
                    'left_panel_width': 400,
                    'min_panel_width': 300,
                    'max_panel_width': 600
                }
            },
            'export': {
                'formats': ['json', 'csv', 'xml', 'html'],
                'include_raw_files': True,
                'compress_exports': True
            },
            'plugins': {
                'enabled': True,
                'auto_load': True,
                'allowed_plugins': ['tls_analyzer', 'vuln_scanner', 'compliance_checker']
            }
        }
        
        if self.config_file.exists():
            try:
                with open(self.config_file, 'r') as f:
                    loaded_config = json.load(f)
                # Merge with defaults (preserve existing settings)
                self.config = self._merge_configs(default_config, loaded_config)
            except Exception as e:
                print(f"Error loading config: {e}, using defaults")
                self.config = default_config
        else:
            self.config = default_config
            self.save_config()
    
    def _merge_configs(self, default: Dict, loaded: Dict) -> Dict:
        """Recursively merge configurations"""
        result = default.copy()
        for key, value in loaded.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self._merge_configs(result[key], value)
            else:
                result[key] = value
        return result
    
    def save_config(self):
        """Save current configuration to file"""
        try:
            with open(self.config_file, 'w') as f:
                json.dump(self.config, f, indent=2)
        except Exception as e:
            print(f"Error saving config: {e}")
    
    def get(self, key_path: str, default=None):
        """Get configuration value using dot notation (e.g., 'scanning.max_concurrent_scans')"""
        keys = key_path.split('.')
        value = self.config
        
        for key in keys:
            if isinstance(value, dict) and key in value:
                value = value[key]
            else:
                return default
        
        return value
    
    def set(self, key_path: str, value: Any):
        """Set configuration value using dot notation"""
        keys = key_path.split('.')
        config_ref = self.config
        
        for key in keys[:-1]:
            if key not in config_ref:
                config_ref[key] = {}
            config_ref = config_ref[key]
        
        config_ref[keys[-1]] = value
        self.save_config()
    
    def get_nmap_presets(self) -> Dict[str, List[str]]:
        """Get predefined nmap scan presets"""
        return {
            'fast': ['-F'],
            'top1000': ['--top-ports', '1000'],
            'allports': ['-p-'],
            'udp': ['-sU', '--top-ports', '100'],
            'stealth': ['-sS'],
            'comprehensive': ['-A'],
            'vuln': ['--script=vuln'],
            'discovery': ['-sn'],
            'ping_only': ['-sn'],
            'custom': []
        }
    
    def get_timing_templates(self) -> Dict[str, str]:
        """Get nmap timing templates"""
        return {
            'paranoid': '-T0',
            'sneaky': '-T1', 
            'polite': '-T2',
            'normal': '-T3',
            'aggressive': '-T4',
            'insane': '-T5'
        }
    
    def validate_target(self, target: str) -> bool:
        """Validate if target is allowed to be scanned"""
        if not self.get('security.validate_targets', True):
            return True
        
        try:
            ip = ipaddress.ip_address(target)
            
            # Check localhost
            if not self.get('security.allow_localhost', False):
                if ip.is_loopback:
                    return False
            
            # Check private networks
            if not self.get('security.allow_private_networks', True):
                if ip.is_private:
                    return False
            
            return True
            
        except ValueError:
            # Invalid IP format
            return False
    
    def get_max_targets(self) -> int:
        """Get maximum allowed targets per scan"""
        return self.get('scanning.max_targets_per_scan', 1000)
    
    def get_max_cidr_size(self) -> int:
        """Get maximum CIDR expansion size"""
        return self.get('nmap.max_cidr_size', 10000)

class DirectoryManager:
    """Manage application directories"""
    
    def __init__(self, config: Config):
        self.config = config
        self.base_dir = Path(__file__).parent
        self.ensure_directories()
    
    def ensure_directories(self):
        """Create all required directories"""
        directories = [
            self.get_data_dir(),
            self.get_projects_dir(),
            self.get_templates_dir(),
            self.get_exports_dir(),
            self.get_plugins_dir()
        ]
        
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
    
    def get_data_dir(self) -> Path:
        """Get data directory path"""
        return self.base_dir / self.config.get('directories.data_dir', 'data')
    
    def get_projects_dir(self) -> Path:
        """Get projects directory path"""
        return self.base_dir / self.config.get('directories.projects_dir', 'data/projects')
    
    def get_templates_dir(self) -> Path:
        """Get templates directory path"""
        return self.base_dir / self.config.get('directories.templates_dir', 'data/templates')
    
    def get_exports_dir(self) -> Path:
        """Get exports directory path"""
        return self.base_dir / self.config.get('directories.exports_dir', 'data/exports')
    
    def get_plugins_dir(self) -> Path:
        """Get plugins directory path"""
        return self.base_dir / self.config.get('directories.plugins_dir', 'plugins')

class SecurityValidator:
    """Security validation for scan targets and options"""
    
    def __init__(self, config: Config):
        self.config = config
    
    def validate_scan_options(self, options: Dict[str, Any]) -> tuple[bool, str]:
        """Validate scan options for security"""
        blocked_options = self.config.get('security.blocked_options', [])
        
        # Check for blocked options in custom command
        if 'custom_command' in options:
            command = options['custom_command']
            for blocked in blocked_options:
                if blocked in command:
                    return False, f"Blocked option detected: {blocked}"
        
        # Validate scan types
        allowed_types = self.config.get('security.allowed_scan_types', [])
        scan_type = options.get('preset', 'fast')
        
        if scan_type not in allowed_types:
            return False, f"Scan type '{scan_type}' not allowed"
        
        return True, "Valid"
    
    def validate_target_list(self, targets: List[str]) -> tuple[bool, str, List[str]]:
        """Validate list of targets"""
        max_targets = self.config.get_max_targets()
        
        if len(targets) > max_targets:
            return False, f"Too many targets. Maximum allowed: {max_targets}", []
        
        valid_targets = []
        invalid_targets = []
        
        for target in targets:
            if self.config.validate_target(target):
                valid_targets.append(target)
            else:
                invalid_targets.append(target)
        
        if invalid_targets:
            return False, f"Invalid targets detected: {', '.join(invalid_targets)}", valid_targets
        
        return True, "All targets valid", valid_targets

# Global configuration instance
config = Config()
directory_manager = DirectoryManager(config)
security_validator = SecurityValidator(config)