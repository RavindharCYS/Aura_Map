/**
 * Enhanced Nmap GUI Tool - Utility Functions
 * Common utility functions with vulnerability analysis capabilities
 */

// Global utility object
const Utils = {
    /**
     * Format bytes to human readable size
     */
    formatBytes: function(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    },

    /**
     * Format duration from seconds to readable format
     */
    formatDuration: function(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    },

    /**
     * Format timestamp to readable format
     */
    formatTimestamp: function(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString();
    },

    /**
     * Validate IP address
     */
    isValidIP: function(ip) {
        const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipRegex.test(ip);
    },

    /**
     * Validate CIDR notation
     */
    isValidCIDR: function(cidr) {
        const cidrRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([0-9]|[1-2][0-9]|3[0-2])$/;
        return cidrRegex.test(cidr);
    },

    /**
     * Parse IP range
     */
    parseIPRange: function(startIP, endIP) {
        if (!this.isValidIP(startIP) || !this.isValidIP(endIP)) {
            return [];
        }

        const start = startIP.split('.').map(Number);
        const end = endIP.split('.').map(Number);
        const ips = [];

        // Convert to number for easier comparison
        const startNum = (start[0] << 24) + (start[1] << 16) + (start[2] << 8) + start[3];
        const endNum = (end[0] << 24) + (end[1] << 16) + (end[2] << 8) + end[3];

        if (startNum > endNum) {
            return [];
        }

        // Limit range size
        if (endNum - startNum > 1000) {
            throw new Error('IP range too large (max 1000 IPs)');
        }

        for (let i = startNum; i <= endNum; i++) {
            const ip = [
                (i >> 24) & 255,
                (i >> 16) & 255,
                (i >> 8) & 255,
                i & 255
            ].join('.');
            ips.push(ip);
        }

        return ips;
    },

    /**
     * Debounce function
     */
    debounce: function(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Show notification
     */
    showNotification: function(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Trigger animation
        setTimeout(() => notification.classList.add('show'), 10);
        
        // Remove after duration
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, duration);
    },

    /**
     * Copy text to clipboard
     */
    copyToClipboard: async function(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showNotification('Copied to clipboard', 'success');
        } catch (err) {
            console.error('Failed to copy:', err);
            this.showNotification('Failed to copy', 'error');
        }
    },

    /**
     * Download data as file
     */
    downloadFile: function(content, filename, type = 'text/plain') {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * Parse scan options from UI
     */
    parseScanOptions: function() {
        const options = {
            preset: document.getElementById('scanPreset').value,
            timing: document.getElementById('timingTemplate').value,
            scripts: document.getElementById('enableScripts').checked,
            version_detection: document.getElementById('versionDetection').checked,
            os_detection: document.getElementById('osDetection').checked,
            skip_ping: document.getElementById('skipPing').checked,
            ping_only: document.getElementById('pingOnly').checked,
            aggressive: document.getElementById('aggressive').checked,
            verbose: document.getElementById('verbose').checked
        };

        const customPorts = document.getElementById('customPorts').value.trim();
        if (customPorts) {
            options.custom_ports = customPorts;
        }

        const customOptions = document.getElementById('customOptions')?.value?.trim();
        if (customOptions) {
            options.custom_flags = customOptions;
        }

        return options;
    },

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml: function(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    },

    /**
     * Get service icon based on service name
     */
    getServiceIcon: function(service) {
        const serviceIcons = {
            'http': '🌐',
            'https': '🔒',
            'ssh': '🔑',
            'ftp': '📁',
            'telnet': '💻',
            'smtp': '✉️',
            'dns': '🌐',
            'mysql': '🗄️',
            'postgresql': '🐘',
            'rdp': '🖥️',
            'vnc': '🖼️',
            'smb': '🗂️',
            'ldap': '📖',
            'snmp': '📊',
            'pop3': '📬',
            'imap': '📫',
            'ntp': '🕐',
            'tftp': '📋',
            'netbios': '🌐'
        };
        
        return serviceIcons[service.toLowerCase()] || '🔌';
    },

    /**
     * Get port state color
     */
    getPortStateColor: function(state) {
        const stateColors = {
            'open': '#27ae60',
            'closed': '#e74c3c',
            'filtered': '#f39c12',
            'open|filtered': '#e67e22',
            'closed|filtered': '#c0392b'
        };
        
        return stateColors[state] || '#95a5a6';
    },

    /**
     * Sort hosts by IP address (using target_ip)
     */
    sortHostsByIP: function(hosts) {
        return hosts.sort((a, b) => {
            const aOctets = a.target_ip.split('.').map(Number);
            const bOctets = b.target_ip.split('.').map(Number);
            
            for (let i = 0; i < 4; i++) {
                if (aOctets[i] !== bOctets[i]) {
                    return aOctets[i] - bOctets[i];
                }
            }
            return 0;
        });
    },

    /**
     * Group hosts by subnet (using target_ip)
     */
    groupHostsBySubnet: function(hosts) {
        const groups = {};
        
        hosts.forEach(host => {
            // Check if host has target_ip property
            if (!host || !host.target_ip) {
                console.warn('Host object missing target_ip:', host);
                return;
            }
            
            const subnet = host.target_ip.split('.').slice(0, 3).join('.');
            if (!groups[subnet]) {
                groups[subnet] = [];
            }
            groups[subnet].push(host);
        });
        
        return groups;
    },

    /**
     * Calculate scan statistics
     */
    calculateScanStats: function(results) {
        const stats = {
            totalHosts: results.length,
            hostsUp: 0,
            hostsDown: 0,
            totalOpenPorts: 0,
            uniqueServices: new Set(),
            osTypes: {}
        };
        
        results.forEach(result => {
            if (result.host_status === 'up') {
                stats.hostsUp++;
                stats.totalOpenPorts += result.open_ports || 0;
                
                // Collect unique services
                if (result.services) {
                    result.services.forEach(service => {
                        if (service.service) {
                            stats.uniqueServices.add(service.service);
                        }
                    });
                }
                
                // Count OS types
                if (result.os_info) {
                    stats.osTypes[result.os_info] = (stats.osTypes[result.os_info] || 0) + 1;
                }
            } else {
                stats.hostsDown++;
            }
        });
        
        stats.uniqueServices = Array.from(stats.uniqueServices);
        return stats;
    },

    /**
     * Enhanced vulnerability analysis using web search
     */
    async analyzeServiceVulnerabilities(service, version, product = '') {
        try {
            // Create comprehensive search query
            const searchTerms = [service, version, product, 'vulnerabilities', 'CVE', 'security'].filter(Boolean);
            const searchQuery = searchTerms.join(' ');
            
            // Search for vulnerability information
            const vulnerabilityData = await this.searchVulnerabilities(searchQuery);
            
            // Search for end-of-life information
            const eolData = await this.searchEndOfLife(service, version);
            
            // Combine results
            return {
                service: service,
                version: version,
                product: product,
                vulnerabilities: vulnerabilityData.vulnerabilities || [],
                eolStatus: eolData.eolStatus || 'Unknown',
                recommendations: this.generateRecommendations(service, version, vulnerabilityData, eolData),
                searchSources: vulnerabilityData.sources || []
            };
            
        } catch (error) {
            console.error('Vulnerability analysis error:', error);
            return {
                service: service,
                version: version,
                error: 'Failed to analyze vulnerabilities',
                recommendations: ['Manual security review recommended']
            };
        }
    },

    /**
     * Search for vulnerabilities using backend API
     */
    async searchVulnerabilities(query) {
        try {
            const response = await fetch('/api/analysis/vulnerabilities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query })
            });
            
            if (!response.ok) {
                throw new Error('Vulnerability search failed');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Vulnerability search error:', error);
            return { vulnerabilities: [], sources: [] };
        }
    },

    /**
     * Search for end-of-life information
     */
    async searchEndOfLife(service, version) {
        try {
            const response = await fetch('/api/analysis/eol', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ service: service, version: version })
            });
            
            if (!response.ok) {
                throw new Error('EOL search failed');
            }
            
            return await response.json();
        } catch (error) {
            console.error('EOL search error:', error);
            return { eolStatus: 'Unknown' };
        }
    },

    /**
     * Generate security recommendations
     */
    generateRecommendations: function(service, version, vulnData, eolData) {
        const recommendations = [];
        
        // Check for end-of-life
        if (eolData.eolStatus === 'End of Life') {
            recommendations.push('🚨 Immediate upgrade required - this version is end-of-life');
        } else if (eolData.eolStatus === 'Near EOL') {
            recommendations.push('⚠️ Plan upgrade - approaching end-of-life');
        }
        
        // Check vulnerability count
        if (vulnData.vulnerabilities && vulnData.vulnerabilities.length > 0) {
            const criticalVulns = vulnData.vulnerabilities.filter(v => v.severity === 'Critical').length;
            const highVulns = vulnData.vulnerabilities.filter(v => v.severity === 'High').length;
            
            if (criticalVulns > 0) {
                recommendations.push(`🔥 ${criticalVulns} critical vulnerabilities found - immediate patching required`);
            }
            if (highVulns > 0) {
                recommendations.push(`⚠️ ${highVulns} high-severity vulnerabilities found - prioritize patching`);
            }
        }
        
        // Service-specific recommendations
        const serviceRecommendations = this.getServiceSpecificRecommendations(service);
        recommendations.push(...serviceRecommendations);
        
        return recommendations.length > 0 ? recommendations : ['Review service configuration and apply latest security patches'];
    },

    /**
     * Get service-specific security recommendations
     */
    getServiceSpecificRecommendations: function(service) {
        const serviceRecommendations = {
            'ssh': [
                'Disable password authentication if possible',
                'Use key-based authentication',
                'Change default port if feasible',
                'Implement fail2ban or similar protection'
            ],
            'http': [
                'Migrate to HTTPS',
                'Implement security headers',
                'Review web application security',
                'Consider reverse proxy protection'
            ],
            'https': [
                'Verify SSL/TLS configuration',
                'Check certificate validity',
                'Review cipher suites',
                'Implement HSTS headers'
            ],
            'ftp': [
                'Consider migrating to SFTP/FTPS',
                'Disable anonymous access',
                'Use strong authentication',
                'Monitor file access logs'
            ],
            'telnet': [
                '🚨 Replace with SSH immediately',
                'Telnet transmits data in plaintext',
                'High security risk'
            ],
            'smb': [
                'Disable SMBv1 if enabled',
                'Use SMBv3 or later',
                'Implement proper access controls',
                'Monitor for lateral movement'
            ],
            'rdp': [
                'Enable Network Level Authentication',
                'Use strong passwords or certificates',
                'Consider VPN access',
                'Monitor for brute force attacks'
            ]
        };
        
        return serviceRecommendations[service.toLowerCase()] || ['Review service documentation for security best practices'];
    },

    /**
     * Create vulnerability analysis modal
     */
    createVulnerabilityModal: function(ip, port, service, version, analysisData) {
        const modal = document.createElement('div');
        modal.className = 'modal vulnerability-modal';
        modal.style.display = 'flex';
        
        const severityClass = this.getSeverityClass(analysisData.vulnerabilities);
        const severityText = this.getSeverityText(analysisData.vulnerabilities);
        
        modal.innerHTML = `
            <div class="modal-content modal-large">
                <div class="modal-header">
                    <h3>Vulnerability Analysis: ${ip}:${port}</h3>
                    <button class="modal-close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="vulnerability-analysis">
                        <div class="service-header">
                            <h4>${service} ${version}</h4>
                            <div class="severity-badge ${severityClass}">${severityText}</div>
                        </div>
                        
                        ${analysisData.eolStatus !== 'Unknown' ? `
                        <div class="analysis-section">
                            <h5>End of Life Status</h5>
                            <p class="${analysisData.eolStatus === 'End of Life' ? 'eol-warning' : 'eol-info'}">
                                ${this.getEOLIcon(analysisData.eolStatus)} ${analysisData.eolStatus}
                            </p>
                        </div>
                        ` : ''}
                        
                        ${analysisData.vulnerabilities && analysisData.vulnerabilities.length > 0 ? `
                        <div class="analysis-section">
                            <h5>Known Vulnerabilities (${analysisData.vulnerabilities.length})</h5>
                            <div class="vulnerability-list">
                                ${analysisData.vulnerabilities.map(vuln => `
                                    <div class="vuln-item">
                                        <span class="cve-id">${vuln.cve || 'N/A'}</span>
                                        <span class="vuln-severity ${vuln.severity?.toLowerCase() || 'unknown'}">${vuln.severity || 'Unknown'}</span>
                                        <p>${vuln.description || 'No description available'}</p>
                                        ${vuln.cvss ? `<small>CVSS Score: ${vuln.cvss}</small>` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        ` : '<div class="analysis-section"><p>No known vulnerabilities found in database.</p></div>'}
                        
                        <div class="analysis-section">
                            <h5>Security Recommendations</h5>
                            <ul>
                                ${analysisData.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                            </ul>
                        </div>
                        
                        <div class="analysis-actions">
                            <button onclick="window.open('https://nvd.nist.gov/vuln/search/results?query=${encodeURIComponent(service + ' ' + version)}', '_blank')" class="btn-secondary">
                                🔍 Search NVD
                            </button>
                            <button onclick="window.open('https://www.exploit-db.com/search?q=${encodeURIComponent(service + ' ' + version)}', '_blank')" class="btn-secondary">
                                💥 Search ExploitDB
                            </button>
                            <button onclick="window.open('https://cve.mitre.org/cgi-bin/cvekey.cgi?keyword=${encodeURIComponent(service + ' ' + version)}', '_blank')" class="btn-secondary">
                                📋 Search CVE
                            </button>
                            <button onclick="Utils.copyVulnerabilityReport('${ip}', '${port}', '${service}', '${version}')" class="btn-primary">
                                📄 Copy Report
                            </button>
                        </div>
                        
                        ${analysisData.searchSources && analysisData.searchSources.length > 0 ? `
                        <div class="analysis-section">
                            <h5>Information Sources</h5>
                            <div class="source-list">
                                ${analysisData.searchSources.map(source => `
                                    <div class="source-item">
                                        <a href="${source.url}" target="_blank">${source.title}</a>
                                        <small>${source.description || ''}</small>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        
        return modal;
    },

    /**
     * Get severity class for styling
     */
    getSeverityClass: function(vulnerabilities) {
        if (!vulnerabilities || vulnerabilities.length === 0) return 'low';
        
        const hasCritical = vulnerabilities.some(v => v.severity === 'Critical');
        const hasHigh = vulnerabilities.some(v => v.severity === 'High');
        
        if (hasCritical) return 'critical';
        if (hasHigh) return 'high';
        return 'medium';
    },

    /**
     * Get severity text
     */
    getSeverityText: function(vulnerabilities) {
        if (!vulnerabilities || vulnerabilities.length === 0) return 'Low Risk';
        
        const criticalCount = vulnerabilities.filter(v => v.severity === 'Critical').length;
        const highCount = vulnerabilities.filter(v => v.severity === 'High').length;
        
        if (criticalCount > 0) return `Critical Risk (${criticalCount} critical)`;
        if (highCount > 0) return `High Risk (${highCount} high)`;
        return 'Medium Risk';
    },

    /**
     * Get EOL status icon
     */
    getEOLIcon: function(status) {
        const icons = {
            'End of Life': '🚨',
            'Near EOL': '⚠️',
            'Supported': '✅',
            'Unknown': '❓'
        };
        return icons[status] || '❓';
    },

    /**
     * Copy vulnerability report to clipboard
     */
    copyVulnerabilityReport: function(ip, port, service, version) {
        // This would generate a comprehensive report
        const report = `
VULNERABILITY ANALYSIS REPORT
=============================
Target: ${ip}:${port}
Service: ${service} ${version}
Analysis Date: ${new Date().toLocaleString()}

[Report would include detailed vulnerability information]
        `.trim();
        
        this.copyToClipboard(report);
    }
};

// Modal helper functions
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Close modal on outside click
document.addEventListener('click', function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
});

// Enhanced vulnerability analysis function for global access
window.analyzeVulnerabilities = async function(ip, port, service, version) {
    Utils.showNotification(`Analyzing ${service} ${version} for vulnerabilities...`, 'info');
    
    try {
        const analysisData = await Utils.analyzeServiceVulnerabilities(service, version);
        const modal = Utils.createVulnerabilityModal(ip, port, service, version, analysisData);
        document.body.appendChild(modal);
    } catch (error) {
        Utils.showNotification('Failed to analyze vulnerabilities', 'error');
        console.error('Vulnerability analysis error:', error);
    }
};