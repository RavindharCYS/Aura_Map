/**
 * Enhanced Nmap GUI Tool - Results Module
 * Handles result display, filtering, and analysis with advanced features
 */

class ResultsManager {
    constructor() {
        this.results = [];
        this.filteredResults = [];
        this.filters = {
            ip: '',
            service: '',
            status: '',
            portState: ''
        };
        this.viewMode = 'live';
        this.scanStatus = 'complete'; // complete, incomplete, cancelled
        this.lastScannedTarget = null;
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // View mode selector
        document.getElementById('viewMode').addEventListener('change', (e) => {
            this.viewMode = e.target.value;
            this.renderResults();
        });

        // Filters
        document.getElementById('ipFilter').addEventListener('input', Utils.debounce(() => {
            this.filters.ip = document.getElementById('ipFilter').value.toLowerCase();
            this.applyFilters();
        }, 300));

        document.getElementById('serviceFilter').addEventListener('change', () => {
            this.filters.service = document.getElementById('serviceFilter').value;
            this.applyFilters();
        });

        document.getElementById('statusFilter').addEventListener('change', () => {
            this.filters.status = document.getElementById('statusFilter').value;
            this.applyFilters();
        });

        document.getElementById('portStateFilter').addEventListener('change', () => {
            this.filters.portState = document.getElementById('portStateFilter').value;
            this.applyFilters();
        });

        document.getElementById('clearFilters').addEventListener('click', () => {
            this.clearFilters();
        });

        // Export button
        document.getElementById('exportResults').addEventListener('click', () => {
            this.exportResults();
        });

        // Open folder button
        document.getElementById('openProjectFolder').addEventListener('click', () => {
            this.openProjectFolder();
        });
    }

    loadAndDisplayResults(resultsData, scanStatus = 'complete') {
        // Extract the scan_result object from each item and filter out invalid results
        const processedResults = resultsData
            .map(item => item.scan_result)
            .filter(result => result && result.host_status && result.target_ip); 

        this.results = processedResults;
        this.filteredResults = processedResults;
        this.scanStatus = scanStatus;
        
        const container = document.getElementById('resultsContainer');
        container.innerHTML = ''; // Clear any "loading..." message

        if (this.filteredResults.length === 0) {
            this.showEmptyState('No valid scan results found for this project.');
            return;
        }

        // Use the detailed view to render all results
        this.renderDetailedView();

        // Enable the action buttons
        document.getElementById('openProjectFolder').disabled = false;
        document.getElementById('exportResults').disabled = false;
        document.getElementById('viewResults').style.display = 'none';
    }

    showEmptyState(message = 'No Scan Results Yet') {
        const container = document.getElementById('resultsContainer');
        const emptyState = document.getElementById('emptyState');
        
        container.innerHTML = ''; // Clear everything
        if (emptyState) {
            emptyState.querySelector('h3').textContent = message;
            emptyState.style.display = 'block';
        }

        // Disable action buttons
        document.getElementById('openProjectFolder').disabled = true;
        document.getElementById('exportResults').disabled = true;
    }

    createHostResultElement(result) {
        const hostDiv = document.createElement('div');
        hostDiv.className = 'host-result';
        
        if (!result || !result.target_ip) {
            console.error("Invalid result object passed to createHostResultElement:", result);
            return null; 
        }
        hostDiv.setAttribute('data-ip', result.target_ip);
        hostDiv.setAttribute('data-status', result.host_status);
        
        const statusClass = result.host_status === 'up' ? 'status-up' : 'status-down';
        const statusIcon = result.host_status === 'up' ? '🟢' : '🔴';
        
        let serviceSummary = '';
        if (result.services && result.services.length > 0) {
            const openServices = result.services
                .filter(s => s.state === 'open')
                .slice(0, 3)
                .map(s => `${s.port}/${s.service || 'unknown'}`)
                .join(', ');
            
            if (openServices) {
                serviceSummary = `<span class="service-summary">${openServices}</span>`;
            }
        }

        let hostnameDisplay = '';
        if (Array.isArray(result.hostnames) && result.hostnames.length > 0 && result.hostnames[0].name) {
            hostnameDisplay = `<span class="hostname">${result.hostnames[0].name}</span>`;
        }

        hostDiv.innerHTML = `
            <div class="host-header" onclick="resultsManager.toggleHostDetails('${result.target_ip}')">
                <div class="host-info">
                    <span class="status-icon">${statusIcon}</span>
                    <span class="ip">${result.target_ip}</span>
                    ${hostnameDisplay}
                    <span class="host-status ${statusClass}">${result.host_status || 'unknown'}</span>
                </div>
                <div class="host-summary">
                    ${result.open_ports ? `<span class="open-ports">${result.open_ports} open ports</span>` : ''}
                    ${serviceSummary}
                    ${result.os_info ? `<span class="os-info">${result.os_info}</span>` : ''}
                </div>
                <div class="host-actions">
                    <button class="btn-icon" onclick="event.stopPropagation(); resultsManager.copyHostInfo('${result.target_ip}')" title="Copy IP">📋</button>
                    <button class="btn-icon" onclick="event.stopPropagation(); resultsManager.rescanHost('${result.target_ip}')" title="Rescan">🔄</button>
                    <span class="expand-icon">▶</span>
                </div>
            </div>
            
            <div class="host-details" id="details-${result.target_ip.replace(/\./g, '_')}" style="display: none;">
                ${this.renderHostDetails(result)}
            </div>
        `;
        
        return hostDiv;
    }

    renderHostDetails(result) {
        let detailsHTML = '';
        
        if (Array.isArray(result.services) && result.services.length > 0) {
            detailsHTML += `
                <div class="ports-section">
                    <h4>Port Scan Results</h4>
                    <table class="ports-table">
                        <thead>
                            <tr>
                                <th>Port</th>
                                <th>Protocol</th>
                                <th>State</th>
                                <th>Service</th>
                                <th>Version</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            result.services.forEach(service => {
                const stateClass = `state-${service.state || 'unknown'}`;
                const serviceIcon = Utils.getServiceIcon(service.service || '');
                
                detailsHTML += `
                    <tr>
                        <td><strong>${service.port || '?'}</strong></td>
                        <td>${service.protocol || 'tcp'}</td>
                        <td><span class="port-state ${stateClass}">${service.state || 'unknown'}</span></td>
                        <td>${serviceIcon} ${service.service || 'unknown'}</td>
                        <td>${service.version || ''} ${service.product || ''}</td>
                        <td>
                            <button class="btn-sm" onclick="resultsManager.analyzeServiceVulnerabilities('${result.target_ip}', '${service.port}', '${service.service || 'unknown'}', '${service.version || 'unknown'}')">Analyze</button>
                        </td>
                    </tr>
                `;
            });
            
            detailsHTML += `
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        if (Array.isArray(result.services)) {
            const scriptsAvailable = result.services.some(s => Array.isArray(s.scripts) && s.scripts.length > 0);
            if (scriptsAvailable) {
                detailsHTML += '<div class="scripts-section"><h4>Script Results</h4>';
                
                result.services.forEach(service => {
                    if (Array.isArray(service.scripts) && service.scripts.length > 0) {
                        detailsHTML += `<div class="script-port"><h5>Port ${service.port}</h5>`;
                        
                        service.scripts.forEach(script => {
                            detailsHTML += `
                                <div class="script-result">
                                    <div class="script-header">${script.id || 'Unknown Script'}</div>
                                    <pre class="script-output">${Utils.escapeHtml(script.output || 'No output')}</pre>
                                </div>
                            `;
                        });
                        
                        detailsHTML += '</div>';
                    }
                });
                
                detailsHTML += '</div>';
            }
        }
        
        if (result.os_info) {
            detailsHTML += `
                <div class="os-section">
                    <h4>Operating System Detection</h4>
                    <p>${result.os_info}</p>
                </div>
            `;
        }
        
        if (result.scan_summary) {
            detailsHTML += `
                <div class="scan-info">
                    <h4>Scan Information</h4>
                    <p>Duration: ${result.scan_summary.elapsed || '?'}s</p>
                    <p>Completed: ${result.scan_summary.timestr || '?'}</p>
                </div>
            `;
        }
        
        return detailsHTML;
    }

    toggleHostDetails(ip) {
        const detailsId = `details-${ip.replace(/\./g, '_')}`;
        const detailsElement = document.getElementById(detailsId);
        const hostElement = detailsElement.parentElement;
        const expandIcon = hostElement.querySelector('.expand-icon');
        
        if (detailsElement.style.display === 'none') {
            detailsElement.style.display = 'block';
            expandIcon.textContent = '▼';
            hostElement.classList.add('expanded');
        } else {
            detailsElement.style.display = 'none';
            expandIcon.textContent = '▶';
            hostElement.classList.remove('expanded');
        }
    }

    copyHostInfo(ip) {
        const result = this.results.find(r => r.target_ip === ip);
        if (result) {
            let copyText = `IP: ${ip}\n`;
            copyText += `Status: ${result.host_status}\n`;
            if (Array.isArray(result.hostnames) && result.hostnames.length > 0) {
                copyText += `Hostname: ${result.hostnames[0].name}\n`;
            }
            if (result.open_ports) {
                copyText += `Open Ports: ${result.open_ports}\n`;
            }
            if (result.os_info) {
                copyText += `OS: ${result.os_info}\n`;
            }
            
            Utils.copyToClipboard(copyText);
        }
    }

    rescanHost(ip) {
        Utils.showNotification('Rescan feature coming soon', 'info');
    }

    // Enhanced analyze service with vulnerability research
    async analyzeServiceVulnerabilities(ip, port, service, version) {
        const analysisModal = this.createAnalysisModal(ip, port, service, version);
        document.body.appendChild(analysisModal);
        
        // Show loading state
        const contentDiv = analysisModal.querySelector('.analysis-content');
        contentDiv.innerHTML = '<div class="loading">Analyzing service vulnerabilities...</div>';
        
        try {
            // Search for vulnerabilities and service information
            const searchQuery = `${service} ${version} vulnerabilities CVE end of life`;
            const analysis = await this.performVulnerabilityAnalysis(searchQuery, service, version);
            
            contentDiv.innerHTML = analysis;
        } catch (error) {
            contentDiv.innerHTML = '<div class="error-message">Failed to analyze service vulnerabilities</div>';
            console.error('Analysis error:', error);
        }
    }

    async performVulnerabilityAnalysis(searchQuery, service, version) {
        // This would integrate with your backend API to search for vulnerabilities
        // For now, returning a mock analysis structure
        return `
            <div class="vulnerability-analysis">
                <div class="service-header">
                    <h4>${service} ${version}</h4>
                    <div class="severity-badge high">High Risk</div>
                </div>
                
                <div class="analysis-section">
                    <h5>End of Life Status</h5>
                    <p class="eol-warning">⚠️ This version reached end-of-life. Consider upgrading.</p>
                </div>
                
                <div class="analysis-section">
                    <h5>Known Vulnerabilities</h5>
                    <div class="vulnerability-list">
                        <div class="vuln-item">
                            <span class="cve-id">CVE-2023-XXXX</span>
                            <span class="vuln-severity critical">Critical</span>
                            <p>Remote code execution vulnerability</p>
                        </div>
                    </div>
                </div>
                
                <div class="analysis-section">
                    <h5>Recommendations</h5>
                    <ul>
                        <li>Upgrade to latest stable version</li>
                        <li>Apply security patches</li>
                        <li>Review configuration settings</li>
                    </ul>
                </div>
                
                <div class="analysis-actions">
                    <button onclick="window.open('https://nvd.nist.gov/vuln/search/results?query=${encodeURIComponent(service + ' ' + version)}', '_blank')" class="btn-secondary">
                        Search NVD
                    </button>
                    <button onclick="this.searchExploitDB('${service}', '${version}')" class="btn-secondary">
                        Search ExploitDB
                    </button>
                </div>
            </div>
        `;
    }

    createAnalysisModal(ip, port, service, version) {
        const modal = document.createElement('div');
        modal.className = 'modal analysis-modal';
        modal.innerHTML = `
            <div class="modal-content modal-large">
                <div class="modal-header">
                    <h3>Service Analysis: ${ip}:${port}</h3>
                    <button class="modal-close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="analysis-content"></div>
                </div>
            </div>
        `;
        modal.style.display = 'flex';
        return modal;
    }

    applyFilters() {
        this.filteredResults = this.results.filter(result => {
            if (!result || !result.target_ip) return false;

            if (this.filters.ip && !result.target_ip.toLowerCase().includes(this.filters.ip)) {
                return false;
            }
            
            if (this.filters.status) {
                if (this.filters.status === 'up' && result.host_status !== 'up') return false;
                if (this.filters.status === 'down' && result.host_status !== 'down') return false;
            }
            
            if (this.filters.service) {
                const hasService = result.services && result.services.some(s => 
                    s.service && s.service.toLowerCase() === this.filters.service.toLowerCase()
                );
                if (!hasService) return false;
            }
            
            if (this.filters.portState) {
                const hasPortState = result.services && result.services.some(s => 
                    s.state === this.filters.portState
                );
                if (!hasPortState) return false;
            }
            
            return true;
        });
        
        this.renderFilteredResults();
    }

    clearFilters() {
        this.filters = { ip: '', service: '', status: '', portState: '' };
        document.getElementById('ipFilter').value = '';
        document.getElementById('serviceFilter').value = '';
        document.getElementById('statusFilter').value = '';
        document.getElementById('portStateFilter').value = '';
        this.filteredResults = this.results;
        this.renderFilteredResults();
    }

    renderFilteredResults() {
        const container = document.getElementById('resultsContainer');
        container.innerHTML = '';
        
        if (this.filteredResults.length === 0) {
            container.innerHTML = '<div class="no-results">No results match the current filters</div>';
            return;
        }
        
        this.filteredResults.forEach(result => {
            const element = this.createHostResultElement(result);
            if (element) {
               container.appendChild(element);
            }
        });
        
        const countText = this.filteredResults.length !== this.results.length ? 
            ` (showing ${this.filteredResults.length} of ${this.results.length})` : '';
        const summaryElement = document.getElementById('scanSummary');
        if (summaryElement) {
            summaryElement.textContent += countText;
        }
    }

    renderResults() {
        switch (this.viewMode) {
            case 'live': break;
            case 'summary': this.renderSummaryView(); break;
            case 'detailed': this.renderDetailedView(); break;
        }
    }

    renderSummaryView() {
        const container = document.getElementById('resultsContainer');
        const stats = Utils.calculateScanStats(this.results);
        
        // Get lists of IPs by status
        const hostsUp = this.results.filter(r => r.host_status === 'up').map(r => r.target_ip);
        const hostsDown = this.results.filter(r => r.host_status === 'down').map(r => r.target_ip);
        
        // Group services by type with their IP:PORT combinations
        const serviceGroups = this.groupServicesByType();
        
        // Scan status indicator
        const statusIndicator = this.scanStatus === 'incomplete' ? 
            `<div class="scan-status-indicator incomplete">
                <span class="status-icon">⚠️</span>
                <span class="status-text">Scan Incomplete</span>
                <button class="btn-sm resume-scan" onclick="resultsManager.resumeScan()">Resume Scan</button>
            </div>` : '';

        container.innerHTML = `
            <div class="summary-view">
                ${statusIndicator}
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${stats.totalHosts}</div>
                        <div class="stat-label">Total Hosts</div>
                    </div>
                    <div class="stat-card success expandable" onclick="resultsManager.toggleHostList('up')">
                        <div class="stat-value">
                            ${stats.hostsUp}
                            <span class="expand-arrow" id="arrow-up">▼</span>
                            <button class="copy-btn" onclick="event.stopPropagation(); resultsManager.copyHostList('up')" title="Copy IPs">📋</button>
                        </div>
                        <div class="stat-label">Hosts Up</div>
                        <div class="host-list" id="hosts-up" style="display: none;">
                            ${hostsUp.map(ip => `<div class="host-item">${ip}</div>`).join('')}
                        </div>
                    </div>
                    <div class="stat-card danger expandable" onclick="resultsManager.toggleHostList('down')">
                        <div class="stat-value">
                            ${stats.hostsDown}
                            <span class="expand-arrow" id="arrow-down">▼</span>
                            <button class="copy-btn" onclick="event.stopPropagation(); resultsManager.copyHostList('down')" title="Copy IPs">📋</button>
                        </div>
                        <div class="stat-label">Hosts Down</div>
                        <div class="host-list" id="hosts-down" style="display: none;">
                            ${hostsDown.map(ip => `<div class="host-item">${ip}</div>`).join('')}
                        </div>
                    </div>
                    <div class="stat-card info">
                        <div class="stat-value">${stats.totalOpenPorts}</div>
                        <div class="stat-label">Open Ports</div>
                    </div>
                </div>
                
                <div class="services-summary">
                    <h3>Discovered Services</h3>
                    <div class="service-tags">
                        ${stats.uniqueServices.map(service => `
                            <div class="service-tag expandable" onclick="resultsManager.toggleServiceDetails('${service}')">
                                ${Utils.getServiceIcon(service)} ${service}
                                <span class="expand-arrow" id="service-arrow-${service}">▼</span>
                                <button class="copy-btn" onclick="event.stopPropagation(); resultsManager.copyServiceList('${service}')" title="Copy IP:Port list">📋</button>
                                <div class="service-details" id="service-details-${service}" style="display: none;">
                                    ${serviceGroups[service] ? serviceGroups[service].map(item => 
                                        `<div class="service-item">${item.ip}:${item.port}</div>`
                                    ).join('') : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="os-summary">
                    <h3>Operating Systems</h3>
                    <div class="os-list">
                        ${Object.entries(stats.osTypes).map(([os, count]) => 
                            `<div class="os-item">${os}: ${count} host(s)</div>`
                        ).join('')}
                    </div>
                </div>
                
                <div class="command-preview">
                    <h3>Scan Command Preview</h3>
                    <div class="command-container">
                        <code id="commandPreview">${this.generateCommandPreview()}</code>
                        <button class="copy-btn" onclick="resultsManager.copyCommand()" title="Copy Command">📋</button>
                    </div>
                </div>
            </div>`;
    }

    groupServicesByType() {
        const serviceGroups = {};
        
        this.results.forEach(result => {
            if (result.services) {
                result.services.forEach(service => {
                    if (service.service && service.state === 'open') {
                        if (!serviceGroups[service.service]) {
                            serviceGroups[service.service] = [];
                        }
                        serviceGroups[service.service].push({
                            ip: result.target_ip,
                            port: service.port
                        });
                    }
                });
            }
        });
        
        return serviceGroups;
    }

    toggleHostList(status) {
        const hostListElement = document.getElementById(`hosts-${status}`);
        const arrowElement = document.getElementById(`arrow-${status}`);
        
        if (hostListElement.style.display === 'none') {
            hostListElement.style.display = 'block';
            arrowElement.textContent = '▲';
        } else {
            hostListElement.style.display = 'none';
            arrowElement.textContent = '▼';
        }
    }

    copyHostList(status) {
        const hosts = this.results
            .filter(r => r.host_status === status)
            .map(r => r.target_ip)
            .join('\n');
        
        Utils.copyToClipboard(hosts);
        Utils.showNotification(`Copied ${status} hosts to clipboard`, 'success');
    }

    toggleServiceDetails(service) {
        const detailsElement = document.getElementById(`service-details-${service}`);
        const arrowElement = document.getElementById(`service-arrow-${service}`);
        
        if (detailsElement.style.display === 'none') {
            detailsElement.style.display = 'block';
            arrowElement.textContent = '▲';
        } else {
            detailsElement.style.display = 'none';
            arrowElement.textContent = '▼';
        }
    }

    copyServiceList(service) {
        const serviceList = [];
        this.results.forEach(result => {
            if (result.services) {
                result.services.forEach(s => {
                    if (s.service === service && s.state === 'open') {
                        serviceList.push(`${result.target_ip}:${s.port}`);
                    }
                });
            }
        });
        
        Utils.copyToClipboard(serviceList.join('\n'));
        Utils.showNotification(`Copied ${service} endpoints to clipboard`, 'success');
    }

    generateCommandPreview() {
        const options = Utils.parseScanOptions();
        let command = 'nmap';
        
        // Add options based on current configuration
        if (options.preset) {
            switch (options.preset) {
                case 'fast': command += ' -F'; break;
                case 'top1000': command += ' --top-ports 1000'; break;
                case 'allports': command += ' -p-'; break;
                case 'udp': command += ' -sU'; break;
                case 'stealth': command += ' -sS'; break;
                case 'comprehensive': command += ' -A'; break;
                case 'vuln': command += ' --script vuln'; break;
                case 'discovery': command += ' -sn'; break;
            }
        }
        
        if (options.scripts) command += ' -sC';
        if (options.version_detection) command += ' -sV';
        if (options.os_detection) command += ' -O';
        if (options.skip_ping) command += ' -Pn';
        if (options.ping_only) command += ' -sn';
        if (options.aggressive) command += ' -A';
        if (options.verbose) command += ' -v';
        if (options.timing) command += ' ' + options.timing;
        if (options.custom_ports) command += ` -p ${options.custom_ports}`;
        
        // Add custom options if any
        const customOptions = document.getElementById('customOptions')?.value?.trim();
        if (customOptions) {
            command += ' ' + customOptions;
        }
        
        command += ' [TARGET]';
        return command;
    }

    copyCommand() {
        const command = this.generateCommandPreview();
        Utils.copyToClipboard(command);
        Utils.showNotification('Command copied to clipboard', 'success');
    }

    resumeScan() {
        if (confirm('Resume scan from the last completed target?')) {
            // This would trigger a resume scan from the backend
            Utils.showNotification('Resume scan feature - integrating with backend...', 'info');
            // Implementation would depend on your backend API
        }
    }

    renderDetailedView() {
        const grouped = Utils.groupHostsBySubnet(this.filteredResults);
        const container = document.getElementById('resultsContainer');
        container.innerHTML = '';
        
        // Add scan status if incomplete
        if (this.scanStatus === 'incomplete') {
            const statusDiv = document.createElement('div');
            statusDiv.className = 'scan-status-banner incomplete';
            statusDiv.innerHTML = `
                <span class="status-icon">⚠️</span>
                <span class="status-text">Scan Incomplete - Some targets may not have been scanned</span>
                <button class="btn-sm resume-scan" onclick="resultsManager.resumeScan()">Resume Scan</button>
            `;
            container.appendChild(statusDiv);
        }
        
        Object.entries(grouped).forEach(([subnet, hosts]) => {
            const subnetSection = document.createElement('div');
            subnetSection.className = 'subnet-section';
            subnetSection.innerHTML = `<h3>Subnet ${subnet}.0/24</h3>`;
            
            hosts.forEach(result => {
                const element = this.createHostResultElement(result);
                if (element) {
                   subnetSection.appendChild(element);
                }
            });
            container.appendChild(subnetSection);
        });
    }

    async exportResults() {
        if (!window.currentProjectId) {
            Utils.showNotification('No project selected', 'error');
            return;
        }
        try {
            const response = await fetch(`/api/projects/${window.currentProjectId}/export?format=json`);
            if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `nmap_results_${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                Utils.showNotification('Results exported successfully', 'success');
            } else { throw new Error('Export failed'); }
        } catch (error) {
            Utils.showNotification('Failed to export results', 'error');
            console.error('Export error:', error);
        }
    }

    async openProjectFolder() {
        if (!window.currentProjectId) {
            Utils.showNotification('No project selected', 'error');
            return;
        }
        try {
            const response = await fetch(`/api/projects/${window.currentProjectId}/open-folder`, { method: 'POST' });
            const result = await response.json();
            if (result.success) {
                Utils.showNotification('Project folder opened', 'success');
            } else {
                Utils.showNotification(result.error || 'Failed to open folder', 'error');
            }
        } catch (error) {
            Utils.showNotification('Failed to open project folder', 'error');
            console.error('Open folder error:', error);
        }
    }

    updateResults(newResults) {
        this.results = newResults;
        this.filteredResults = newResults;
        this.applyFilters();
    }

    addResult(result) {
        this.results.push(result);
        const passesFilters = this.checkFilters(result);
        if (passesFilters) {
            this.filteredResults.push(result);
        }
    }

    checkFilters(result) {
        if (!result || !result.target_ip) return false;
        if (this.filters.ip && !result.target_ip.toLowerCase().includes(this.filters.ip)) return false;
        if (this.filters.status) {
            if (this.filters.status === 'up' && result.host_status !== 'up') return false;
            if (this.filters.status === 'down' && result.host_status !== 'down') return false;
        }
        if (this.filters.service) {
            if (!result.services || !result.services.some(s => s.service && s.service.toLowerCase() === this.filters.service.toLowerCase())) return false;
        }
        if (this.filters.portState) {
            if (!result.services || !result.services.some(s => s.state === this.filters.portState)) return false;
        }
        return true;
    }
}

const resultsManager = new ResultsManager();

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('viewResults').addEventListener('click', async () => {
        if (!window.currentProjectId) return;
        try {
            const response = await fetch(`/api/projects/${window.currentProjectId}/aggregate`);
            const data = await response.json();
            if (data.detailed_results) {
                const results = data.detailed_results.map(d => d.scan_result);
                resultsManager.updateResults(results);
                document.getElementById('viewMode').value = 'summary';
                resultsManager.renderSummaryView();
                Utils.showNotification('Results loaded', 'success');
            }
        } catch (error) {
            Utils.showNotification('Failed to load results', 'error');
            console.error('Load results error:', error);
        }
    });
});