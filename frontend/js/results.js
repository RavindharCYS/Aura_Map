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
        const processedResults = resultsData
            .map(item => item.scan_result)
            .filter(result => result && result.host_status && result.target_ip); 

        this.results = processedResults;
        this.filteredResults = processedResults;
        this.scanStatus = scanStatus;
        
        const container = document.getElementById('resultsContainer');
        container.innerHTML = '';

        if (this.filteredResults.length === 0) {
            this.showEmptyState('No valid scan results found for this project.');
            return;
        }

        this.renderDetailedView();

        document.getElementById('openProjectFolder').disabled = false;
        document.getElementById('exportResults').disabled = false;
        document.getElementById('viewResults').style.display = 'none';
    }

    showEmptyState(message = 'No Scan Results Yet') {
        const container = document.getElementById('resultsContainer');
        const emptyState = document.getElementById('emptyState');
        
        container.innerHTML = '';
        if (emptyState) {
            emptyState.querySelector('h3').textContent = message;
            emptyState.style.display = 'block';
        }

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
                
                // Enhanced version info parsing
                const versionInfo = this.parseVersionInfo(service);
                
                detailsHTML += `
                    <tr>
                        <td><strong>${service.port || '?'}</strong></td>
                        <td>${service.protocol || 'tcp'}</td>
                        <td><span class="port-state ${stateClass}">${service.state || 'unknown'}</span></td>
                        <td>${serviceIcon} ${service.service || 'unknown'}</td>
                        <td class="version-info">${versionInfo.display}</td>
                        <td>
                            <button class="btn-sm analyze-btn" onclick="resultsManager.analyzeServiceVulnerabilities('${result.target_ip}', '${service.port}', '${service.service || 'unknown'}', '${Utils.escapeHtml(versionInfo.full)}', '${Utils.escapeHtml(service.product || '')}', '${Utils.escapeHtml(service.extrainfo || '')}')">
                                <span class="analyze-icon">🔍</span> Analyze
                            </button>
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

    parseVersionInfo(service) {
        const parts = [];
        const fullParts = [];
        
        if (service.product && service.product.trim()) {
            parts.push(service.product.trim());
            fullParts.push(service.product.trim());
        }
        
        if (service.version && service.version.trim()) {
            parts.push(service.version.trim());
            fullParts.push(service.version.trim());
        }
        
        if (service.extrainfo && service.extrainfo.trim()) {
            fullParts.push(service.extrainfo.trim());
        }
        
        const display = parts.length > 0 ? parts.join(' ') : '';
        const full = fullParts.length > 0 ? fullParts.join(' ') : '';
        
        return { display, full };
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

    async analyzeServiceVulnerabilities(ip, port, service, version, product, extrainfo) {
        const analysisModal = this.createAnalysisModal(ip, port, service, version, product, extrainfo);
        document.body.appendChild(analysisModal);
        
        const contentDiv = analysisModal.querySelector('.analysis-content');
        contentDiv.innerHTML = '<div class="analysis-loading"><div class="spinner"></div><p>Loading analysis options...</p></div>';
        
        try {
            const analysis = await this.performVulnerabilityAnalysis(service, version, product, extrainfo);
            contentDiv.innerHTML = analysis;
        } catch (error) {
            contentDiv.innerHTML = '<div class="analysis-error"><span class="error-icon">❌</span><p>Failed to load analysis options</p></div>';
            console.error('Analysis error:', error);
        }
    }

    async performVulnerabilityAnalysis(service, version, product, extrainfo) {
        const baseUrl = "https://www.perplexity.ai/search?q=";
        
        // Build comprehensive service context
        const serviceParts = [];
        
        // Primary service name
        if (service && service !== 'unknown') {
            serviceParts.push(service);
        }
        
        // Product information
        if (product && product !== 'unknown' && product.trim()) {
            serviceParts.push(product.trim());
        }
        
        // Version information
        if (version && version !== 'unknown' && version.trim()) {
            serviceParts.push(version.trim());
        }
        
        // Extra information (if relevant)
        if (extrainfo && extrainfo.trim() && extrainfo !== 'unknown') {
            const cleanExtraInfo = extrainfo.trim();
            // Only include if it looks like useful version/product info
            if (cleanExtraInfo.length < 50 && !cleanExtraInfo.includes('(')) {
                serviceParts.push(cleanExtraInfo);
            }
        }
        
        const serviceContext = serviceParts.join(' ').trim();
        const displayContext = serviceContext || service || 'unknown service';
        
        // Clean up display context for better presentation
        const cleanDisplayContext = this.cleanServiceContext(displayContext);

        return `
            <div class="analysis-options">
                <div class="service-header">
                    <div class="service-icon">${Utils.getServiceIcon(service)}</div>
                    <div class="service-details">
                        <h4>Choose Analysis Type for <span class="service-highlight">${cleanDisplayContext}</span></h4>
                        <div class="service-meta">
                            <span class="service-badge">${service || 'unknown'}</span>
                            ${version && version !== 'unknown' ? `<span class="version-badge">${version}</span>` : ''}
                            ${product && product !== 'unknown' ? `<span class="product-badge">${product}</span>` : ''}
                        </div>
                    </div>
                </div>
                
                <div class="analysis-grid">
                    <a href="${baseUrl + encodeURIComponent(serviceContext + ' End of Life status EOL')}" target="_blank" class="analysis-option eol">
                        <div class="option-icon">📅</div>
                        <div class="option-content">
                            <div class="option-title">End Of Life Status</div>
                            <div class="option-desc">Check if this version is still supported</div>
                        </div>
                    </a>
                    
                    <a href="${baseUrl + encodeURIComponent('What is ' + serviceContext + ' service overview')}" target="_blank" class="analysis-option info">
                        <div class="option-icon">ℹ️</div>
                        <div class="option-content">
                            <div class="option-title">Service Information</div>
                            <div class="option-desc">Learn about this service and version</div>
                        </div>
                    </a>
                    
                    <a href="${baseUrl + encodeURIComponent(serviceContext + ' vulnerabilities CVE security flaws')}" target="_blank" class="analysis-option vulnerabilities">
                        <div class="option-icon">⚠️</div>
                        <div class="option-content">
                            <div class="option-title">Vulnerabilities</div>
                            <div class="option-desc">Search for known security vulnerabilities</div>
                        </div>
                    </a>
                    
                    <a href="${baseUrl + encodeURIComponent(serviceContext + ' exploits metasploit payload')}" target="_blank" class="analysis-option exploits">
                        <div class="option-icon">💣</div>
                        <div class="option-content">
                            <div class="option-title">Exploits</div>
                            <div class="option-desc">Find available exploits and payloads</div>
                        </div>
                    </a>
                    
                    <a href="${baseUrl + encodeURIComponent(serviceContext + ' hardening security configuration best practices')}" target="_blank" class="analysis-option hardening">
                        <div class="option-icon">🔧</div>
                        <div class="option-content">
                            <div class="option-title">Hardening Guides</div>
                            <div class="option-desc">Security configuration recommendations</div>
                        </div>
                    </a>
                    
                    <a href="${baseUrl + encodeURIComponent(serviceContext + ' red team attack techniques')}" target="_blank" class="analysis-option redteam">
                        <div class="option-icon">🛡️</div>
                        <div class="option-content">
                            <div class="option-title">Red Team Use Cases</div>
                            <div class="option-desc">Attack techniques and methodologies</div>
                        </div>
                    </a>
                    
                    <a href="${baseUrl + encodeURIComponent(serviceContext + ' penetration testing VAPT methodology')}" target="_blank" class="analysis-option vapt">
                        <div class="option-icon">🔍</div>
                        <div class="option-content">
                            <div class="option-title">VAPT Testing Strategies</div>
                            <div class="option-desc">Penetration testing approaches</div>
                        </div>
                    </a>
                </div>
                
                <div class="analysis-footer">
                    <div class="search-alternatives">
                        <h5>Additional Search Options:</h5>
                        <div class="search-links">
                            <a href="${baseUrl + encodeURIComponent(serviceContext + ' configuration files')}" target="_blank" class="search-link">
                                📄 Configuration Files
                            </a>
                            <a href="${baseUrl + encodeURIComponent(serviceContext + ' default credentials')}" target="_blank" class="search-link">
                                🔑 Default Credentials
                            </a>
                            <a href="${baseUrl + encodeURIComponent(serviceContext + ' port scanning techniques')}" target="_blank" class="search-link">
                                🎯 Scanning Techniques
                            </a>
                            <a href="${baseUrl + encodeURIComponent(serviceContext + ' OSINT reconnaissance')}" target="_blank" class="search-link">
                                🕵️ OSINT Methods
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    cleanServiceContext(context) {
        // Remove common unnecessary words and clean up the context
        return context
            .replace(/\b(unknown|tcp|udp)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    createAnalysisModal(ip, port, service, version, product, extrainfo) {
        const modal = document.createElement('div');
        modal.className = 'modal analysis-modal';
        
        // Build service info for header
        const serviceInfo = [];
        if (service && service !== 'unknown') serviceInfo.push(service);
        if (product && product !== 'unknown') serviceInfo.push(product);
        if (version && version !== 'unknown') serviceInfo.push(version);
        
        const serviceTitle = serviceInfo.length > 0 ? serviceInfo.join(' ') : 'Unknown Service';
        
        modal.innerHTML = `
            <div class="modal-content modal-analysis">
                <div class="modal-header analysis-header">
                    <div class="analysis-title">
                        <h3>Service Analysis: <span class="target-info">${ip}:${port}</span></h3>
                        <div class="service-subtitle">${serviceTitle}</div>
                    </div>
                    <button class="modal-close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</button>
                </div>
                <div class="modal-body analysis-body">
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

// Enhanced CSS styles for the analysis modal
const analysisStyles = `
<style>
/* Analysis Modal Styles */
.modal-analysis {
    max-width: 900px;
    width: 90vw;
    max-height: 85vh;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.analysis-header {
    background: linear-gradient(135deg, #0f3460 0%, #16537e 100%);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding: 20px 30px;
    border-radius: 12px 12px 0 0;
}

.analysis-title h3 {
    color: #ffffff;
    font-size: 1.4em;
    margin: 0 0 8px 0;
    font-weight: 600;
}

.target-info {
    color: #4fc3f7;
    font-family: 'Courier New', monospace;
    font-weight: 700;
}

.service-subtitle {
    color: #b3e5fc;
    font-size: 0.95em;
    font-weight: 500;
    opacity: 0.9;
}

.analysis-body {
    padding: 0;
    background: #1a1a2e;
}

.analysis-loading, .analysis-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 30px;
    color: #b3e5fc;
}

.spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(79, 195, 247, 0.3);
    border-top: 3px solid #4fc3f7;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 20px;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.analysis-error .error-icon {
    font-size: 2em;
    margin-bottom: 15px;
}

.analysis-options {
    padding: 30px;
}

.service-header {
    display: flex;
    align-items: center;
    margin-bottom: 30px;
    padding: 20px;
    background: linear-gradient(135deg, rgba(79, 195, 247, 0.1) 0%, rgba(33, 150, 243, 0.1) 100%);
    border-radius: 10px;
    border: 1px solid rgba(79, 195, 247, 0.2);
}

.service-icon {
    font-size: 2.5em;
    margin-right: 20px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

.service-details h4 {
    color: #ffffff;
    margin: 0 0 10px 0;
    font-size: 1.3em;
    font-weight: 600;
}

.service-highlight {
    color: #4fc3f7;
    font-weight: 700;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.service-meta {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 10px;
}

.service-badge, .version-badge, .product-badge {
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 0.85em;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.service-badge {
    background: linear-gradient(135deg, #2196f3, #1976d2);
    color: white;
}

.version-badge {
    background: linear-gradient(135deg, #4caf50, #388e3c);
    color: white;
}

.product-badge {
    background: linear-gradient(135deg, #ff9800, #f57c00);
    color: white;
}

.analysis-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
}

.analysis-option {
    display: flex;
    align-items: center;
    padding: 20px;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    text-decoration: none;
    color: #ffffff;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
}

.analysis-option::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
    transition: left 0.6s;
}

.analysis-option:hover::before {
    left: 100%;
}

.analysis-option:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    border-color: rgba(79, 195, 247, 0.4);
}

.analysis-option.eol:hover { border-color: rgba(255, 193, 7, 0.6); }
.analysis-option.info:hover { border-color: rgba(33, 150, 243, 0.6); }
.analysis-option.vulnerabilities:hover { border-color: rgba(255, 152, 0, 0.6); }
.analysis-option.exploits:hover { border-color: rgba(244, 67, 54, 0.6); }
.analysis-option.hardening:hover { border-color: rgba(76, 175, 80, 0.6); }
.analysis-option.redteam:hover { border-color: rgba(156, 39, 176, 0.6); }
.analysis-option.vapt:hover { border-color: rgba(96, 125, 139, 0.6); }

.option-icon {
    font-size: 2em;
    margin-right: 15px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
    flex-shrink: 0;
}

.option-content {
    flex: 1;
}

.option-title {
    font-size: 1.1em;
    font-weight: 600;
    margin-bottom: 5px;
    color: #ffffff;
}

.option-desc {
    font-size: 0.9em;
    color: rgba(255, 255, 255, 0.7);
    line-height: 1.4;
}

.analysis-footer {
    margin-top: 30px;
    padding-top: 25px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.analysis-footer h5 {
    color: #b3e5fc;
    margin: 0 0 15px 0;
    font-size: 1.1em;
    font-weight: 600;
}

.search-links {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
}

.search-link {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    text-decoration: none;
    color: #b3e5fc;
    font-size: 0.9em;
    transition: all 0.3s ease;
}

.search-link:hover {
    background: rgba(79, 195, 247, 0.1);
    border-color: rgba(79, 195, 247, 0.3);
    transform: translateY(-1px);
}

/* Enhanced table styles for better version display */
.ports-table .version-info {
    font-family: 'Segoe UI', 'Arial', sans-serif;
    font-size: 0.9em;
    max-width: 200px;
    word-wrap: break-word;
}

.analyze-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, #1976d2, #1565c0);
    border: none;
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 0.85em;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;
}

.analyze-btn:hover {
    background: linear-gradient(135deg, #2196f3, #1976d2);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
}

.analyze-icon {
    font-size: 1.1em;
}

/* Responsive design */
@media (max-width: 768px) {
    .modal-analysis {
        width: 95vw;
        max-height: 90vh;
    }
    
    .analysis-grid {
        grid-template-columns: 1fr;
    }
    
    .search-links {
        grid-template-columns: 1fr;
    }
    
    .service-header {
        flex-direction: column;
        text-align: center;
    }
    
    .service-icon {
        margin-right: 0;
        margin-bottom: 15px;
    }
}

/* Dark theme enhancements */
@media (prefers-color-scheme: dark) {
    .analysis-option {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%);
    }
    
    .service-header {
        background: linear-gradient(135deg, rgba(79, 195, 247, 0.15) 0%, rgba(33, 150, 243, 0.15) 100%);
    }
}
</style>
`;

// Inject styles if not already present
if (!document.getElementById('analysis-styles')) {
    const styleElement = document.createElement('div');
    styleElement.id = 'analysis-styles';
    styleElement.innerHTML = analysisStyles;
    document.head.appendChild(styleElement);
}