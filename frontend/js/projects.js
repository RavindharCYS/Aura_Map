/**
 * Enhanced Nmap GUI Tool - Projects Module
 * Handles project management, selection, and vulnerability analysis integration
 */

class ProjectManager {
    constructor() {
        this.projects = [];
        this.currentProject = null;
        this.isNewProjectMode = true;
        this.initializeEventListeners();
        this.loadProjects();
    }

    initializeEventListeners() {
        // Toggle between new/existing project
        document.getElementById('toggleProjectMode').addEventListener('click', () => {
            this.toggleProjectMode();
        });

        // Project select change
        document.getElementById('projectSelect').addEventListener('change', (e) => {
            this.selectProject(e.target.value);
        });

        // Load templates when page loads
        this.loadTemplates();
    }

    toggleProjectMode() {
        this.isNewProjectMode = !this.isNewProjectMode;
        
        const projectName = document.getElementById('projectName');
        const projectSelect = document.getElementById('projectSelect');
        const toggleBtn = document.getElementById('toggleProjectMode');
        const projectPMO = document.getElementById('projectPMO');
        const projectDescription = document.getElementById('projectDescription');
        
        if (this.isNewProjectMode) {
            projectName.style.display = 'block';
            projectSelect.style.display = 'none';
            toggleBtn.textContent = 'New';
            projectPMO.disabled = false;
            projectDescription.disabled = false;
            
            // Clear fields
            projectName.value = '';
            projectPMO.value = '';
            projectDescription.value = '';
        } else {
            projectName.style.display = 'none';
            projectSelect.style.display = 'block';
            toggleBtn.textContent = 'Existing';
            
            // Refresh project list
            this.loadProjects();
        }
    }

    async loadProjects() {
        try {
            const response = await fetch('/api/projects');
            const projects = await response.json();
            
            this.projects = projects;
            this.updateProjectSelect(projects);
            
        } catch (error) {
            console.error('Failed to load projects:', error);
            Utils.showNotification('Failed to load projects', 'error');
        }
    }

    updateProjectSelect(projects) {
        const select = document.getElementById('projectSelect');
        select.innerHTML = '<option value="">Select existing project...</option>';
        
        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.name;
            
            // Add additional info as data attributes
            option.setAttribute('data-pmo', project.pmo || '');
            option.setAttribute('data-assessment-type', project.assessment_type || '');
            option.setAttribute('data-description', project.description || '');
            
            select.appendChild(option);
        });
    }

    selectProject(projectId) {
        if (!projectId) {
            // Clear fields
            document.getElementById('projectPMO').value = '';
            document.getElementById('projectDescription').value = '';
            document.getElementById('assessmentType').value = 'network_pt';
            return;
        }

        const project = this.projects.find(p => p.id === projectId);
        if (project) {
            this.currentProject = project;
            
            // Populate fields with project data
            document.getElementById('projectPMO').value = project.pmo || '';
            document.getElementById('projectDescription').value = project.description || '';
            document.getElementById('assessmentType').value = project.assessment_type || 'network_pt';
            
            // Disable editing for existing projects
            document.getElementById('projectPMO').disabled = true;
            document.getElementById('projectDescription').disabled = true;
            
            Utils.showNotification(`Selected project: ${project.name}`, 'info');
        }
    }

    async loadTemplates() {
        try {
            const response = await fetch('/api/templates');
            const templates = await response.json();
            
            const select = document.getElementById('scanTemplate');
            select.innerHTML = '<option value="">Select a template...</option>';
            
            // Add built-in templates
            templates.filter(t => t.built_in).forEach(template => {
                const option = document.createElement('option');
                option.value = template.id;
                option.textContent = `${template.name} (Built-in)`;
                option.setAttribute('data-options', JSON.stringify(template.options));
                select.appendChild(option);
            });
            
            // Add separator if there are custom templates
            const customTemplates = templates.filter(t => !t.built_in);
            if (customTemplates.length > 0) {
                const separator = document.createElement('option');
                separator.disabled = true;
                separator.textContent = '── Custom Templates ──';
                select.appendChild(separator);
                
                customTemplates.forEach(template => {
                    const option = document.createElement('option');
                    option.value = template.id;
                    option.textContent = template.name;
                    option.setAttribute('data-options', JSON.stringify(template.options));
                    select.appendChild(option);
                });
            }
            
        } catch (error) {
            console.error('Failed to load templates:', error);
        }
    }

    showProjectModal() {
        const modal = document.getElementById('projectModal');
        const projectList = document.getElementById('projectList');
        
        projectList.innerHTML = '<div class="loading">Loading projects...</div>';
        openModal('projectModal');
        
        // Load and display projects
        fetch('/api/projects')
            .then(response => response.json())
            .then(projects => {
                if (projects.length === 0) {
                    projectList.innerHTML = '<div class="empty-state">No projects found</div>';
                    return;
                }
                
                projectList.innerHTML = '';
                projects.forEach(project => {
                    const projectCard = this.createProjectCard(project);
                    projectList.appendChild(projectCard);
                });
            })
            .catch(error => {
                projectList.innerHTML = '<div class="error-state">Failed to load projects</div>';
                console.error('Error loading projects:', error);
            });
    }

    createProjectCard(project) {
        const card = document.createElement('div');
        card.className = 'project-card';
        
        const lastScanText = project.last_scan ? 
            `Last scan: ${new Date(project.last_scan).toLocaleDateString()}` : 
            'No scans yet';
        
        // Determine scan status
        const scanStatus = project.scan_status || 'complete';
        const statusIndicator = scanStatus === 'incomplete' ? 
            '<span class="incomplete-indicator">⚠️ Incomplete</span>' : '';
        
        card.innerHTML = `
            <div class="project-card-header">
                <h4>${project.name} ${statusIndicator}</h4>
                <span class="project-id">#${project.id}</span>
            </div>
            <div class="project-card-body">
                <div class="project-info">
                    <p><strong>PMO:</strong> ${project.pmo || 'Not specified'}</p>
                    <p><strong>Type:</strong> ${this.getAssessmentTypeLabel(project.assessment_type)}</p>
                    <p><strong>Created:</strong> ${new Date(project.created_at).toLocaleDateString()}</p>
                    <p><strong>Scans:</strong> ${project.scan_count || 0}</p>
                    <p>${lastScanText}</p>
                </div>
                ${project.description ? `<p class="project-description">${project.description}</p>` : ''}
            </div>
            <div class="project-card-actions">
                <button class="btn-primary" onclick="projectManager.loadProjectResults('${project.id}', '${Utils.escapeHtml(project.name)}', '${scanStatus}')">Load Results</button>
                <button class="btn-secondary" onclick="projectManager.selectProjectFromModal('${project.id}')">Set as Active</button>
                ${scanStatus === 'incomplete' ? 
                    `<button class="btn-warning" onclick="projectManager.resumeProjectScan('${project.id}')">Resume Scan</button>` : 
                    ''
                }
            </div>
        `;
        
        return card;
    }

    async loadProjectResults(projectId, projectName, scanStatus = 'complete') {
        Utils.showNotification(`Loading results for project: ${projectName}...`, 'info');
        closeModal('projectModal');

        // Prepare the UI for loaded results
        const resultsContainer = document.getElementById('resultsContainer');
        const emptyState = document.getElementById('emptyState');
        const filtersBar = document.getElementById('filtersBar');
        
        resultsContainer.innerHTML = '<div class="loading">Loading results...</div>';
        if (emptyState) emptyState.style.display = 'none';
        if (filtersBar) filtersBar.style.display = 'block';

        try {
            console.log(`Fetching project data for project ID: ${projectId}`);
            const response = await fetch(`/api/projects/${projectId}/aggregate`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('Received project data:', data);

            if (data.detailed_results && data.detailed_results.length > 0) {
                console.log(`Processing ${data.detailed_results.length} detailed results`);
                
                // Extract and validate scan results
                const scanResults = data.detailed_results
                    .map(item => {
                        // Handle different data structures
                        if (item.scan_result) {
                            return item.scan_result;
                        } else if (item.target_ip) {
                            return item; // Direct result object
                        } else {
                            console.warn('Invalid result item:', item);
                            return null;
                        }
                    })
                    .filter(result => {
                        // Filter out null/invalid results and ensure basic properties exist
                        return result && 
                               result.target_ip && 
                               (result.host_status || result.status);
                    });

                console.log(`Filtered to ${scanResults.length} valid scan results`);

                if (scanResults.length > 0) {
                    // Clear loading message
                    resultsContainer.innerHTML = '';
                    
                    // Update results manager with scan status
                    resultsManager.results = scanResults;
                    resultsManager.filteredResults = scanResults;
                    resultsManager.scanStatus = scanStatus;
                    
                    // Set view mode to detailed and render
                    const viewModeSelect = document.getElementById('viewMode');
                    if (viewModeSelect) {
                        viewModeSelect.value = 'detailed';
                        resultsManager.viewMode = 'detailed';
                    }
                    
                    // Render the results
                    resultsManager.renderDetailedView();
                    
                    // Enable action buttons
                    const openFolderBtn = document.getElementById('openProjectFolder');
                    const exportBtn = document.getElementById('exportResults');
                    const viewResultsBtn = document.getElementById('viewResults');
                    
                    if (openFolderBtn) openFolderBtn.disabled = false;
                    if (exportBtn) exportBtn.disabled = false;
                    if (viewResultsBtn) viewResultsBtn.style.display = 'none';
                    
                    // Set the current project ID for other operations
                    window.currentProjectId = projectId;
                    
                    const statusText = scanStatus === 'incomplete' ? ' (Incomplete scan)' : '';
                    Utils.showNotification(`Successfully loaded ${scanResults.length} scan results${statusText}.`, 'success');
                } else {
                    resultsManager.showEmptyState('No valid scan results found for this project.');
                    Utils.showNotification('No valid scan results to display.', 'warning');
                }
            } else {
                console.log('No detailed results found in response');
                resultsManager.showEmptyState('No scan results found for this project.');
                Utils.showNotification('No scan results to display.', 'warning');
            }
        } catch (error) {
            console.error('Error loading project results:', error);
            resultsManager.showEmptyState('Error loading scan results. Check console for details.');
            Utils.showNotification(`Could not load project results: ${error.message}`, 'error');
        }
    }

    async resumeProjectScan(projectId) {
        if (confirm('Resume the incomplete scan for this project?')) {
            try {
                // Get project details to determine where to resume
                const response = await fetch(`/api/projects/${projectId}/scan-status`);
                const scanData = await response.json();
                
                if (scanData.success && scanData.last_completed_target !== undefined) {
                    // Load the project's target list and resume from the next target
                    Utils.showNotification('Preparing to resume scan...', 'info');
                    
                    // This would integrate with your scanner to resume from the correct point
                    // You'd need to implement this in your backend
                    const resumeResponse = await fetch(`/api/projects/${projectId}/resume-scan`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            resume_from: scanData.last_completed_target + 1
                        })
                    });
                    
                    const result = await resumeResponse.json();
                    if (result.success) {
                        closeModal('projectModal');
                        Utils.showNotification('Scan resumed successfully', 'success');
                        
                        // Update UI to show scanning state
                        if (window.scanManager) {
                            window.scanManager.setScanningUI(true);
                        }
                    } else {
                        Utils.showNotification(result.error || 'Failed to resume scan', 'error');
                    }
                } else {
                    Utils.showNotification('Cannot determine resume point for this scan', 'error');
                }
            } catch (error) {
                console.error('Resume scan error:', error);
                Utils.showNotification('Failed to resume scan', 'error');
            }
        }
    }

    selectProjectFromModal(projectId) {
        // Switch to existing project mode
        this.isNewProjectMode = false;
        this.toggleProjectMode();
        
        // Select the project
        document.getElementById('projectSelect').value = projectId;
        this.selectProject(projectId);
        
        // Close modal
        closeModal('projectModal');
    }

    async viewProjectDetails(projectId) {
        try {
            const response = await fetch(`/api/projects/${projectId}/scans`);
            const scans = await response.json();
            
            // Create detailed project view modal
            this.showProjectDetailsModal(projectId, scans);
            
        } catch (error) {
            Utils.showNotification('Failed to load project details', 'error');
        }
    }

    showProjectDetailsModal(projectId, scans) {
        const modal = document.createElement('div');
        modal.className = 'modal project-details-modal';
        modal.style.display = 'flex';
        
        modal.innerHTML = `
            <div class="modal-content modal-large">
                <div class="modal-header">
                    <h3>Project Details</h3>
                    <button class="modal-close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="project-details">
                        <h4>Scan History</h4>
                        <div class="scan-history">
                            ${scans.map(scan => `
                                <div class="scan-entry">
                                    <div class="scan-info">
                                        <span class="scan-date">${new Date(scan.created_at).toLocaleString()}</span>
                                        <span class="scan-status ${scan.status}">${scan.status}</span>
                                        <span class="scan-targets">${scan.target_count} targets</span>
                                    </div>
                                    <div class="scan-actions">
                                        <button onclick="projectManager.loadScanResults('${scan.id}')" class="btn-sm">Load</button>
                                        ${scan.status === 'incomplete' ? 
                                            `<button onclick="projectManager.resumeScan('${scan.id}')" class="btn-sm resume">Resume</button>` : 
                                            ''
                                        }
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    getAssessmentTypeLabel(type) {
        const labels = {
            'network_pt': 'Network Penetration Test',
            'retest_pt': 'Retest Network PT',
            'vulnerability': 'Vulnerability Assessment',
            'compliance': 'Compliance Check',
            'discovery': 'Network Discovery'
        };
        
        return labels[type] || type;
    }

    /**
     * Enhanced analysis integration for services
     */
    async analyzeProjectServices(projectId) {
        try {
            Utils.showNotification('Analyzing all services in project...', 'info');
            
            const response = await fetch(`/api/projects/${projectId}/analyze-services`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const result = await response.json();
            if (result.success) {
                this.showServiceAnalysisReport(result.analysis);
            } else {
                Utils.showNotification(result.error || 'Analysis failed', 'error');
            }
        } catch (error) {
            console.error('Service analysis error:', error);
            Utils.showNotification('Failed to analyze services', 'error');
        }
    }

    showServiceAnalysisReport(analysisData) {
        const modal = document.createElement('div');
        modal.className = 'modal analysis-report-modal';
        modal.style.display = 'flex';
        
        const criticalCount = analysisData.filter(item => item.risk_level === 'Critical').length;
        const highCount = analysisData.filter(item => item.risk_level === 'High').length;
        
        modal.innerHTML = `
            <div class="modal-content modal-large">
                <div class="modal-header">
                    <h3>Project Security Analysis Report</h3>
                    <button class="modal-close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="analysis-summary">
                        <div class="risk-overview">
                            <div class="risk-card critical">
                                <div class="risk-count">${criticalCount}</div>
                                <div class="risk-label">Critical Issues</div>
                            </div>
                            <div class="risk-card high">
                                <div class="risk-count">${highCount}</div>
                                <div class="risk-label">High Risk Issues</div>
                            </div>
                        </div>
                        
                        <div class="detailed-analysis">
                            ${analysisData.map(item => `
                                <div class="analysis-item ${item.risk_level.toLowerCase()}">
                                    <div class="item-header">
                                        <span class="service-info">${item.ip}:${item.port} - ${item.service} ${item.version}</span>
                                        <span class="risk-badge ${item.risk_level.toLowerCase()}">${item.risk_level}</span>
                                    </div>
                                    <div class="item-details">
                                        <p><strong>Issues Found:</strong> ${item.issues_count}</p>
                                        <p><strong>EOL Status:</strong> ${item.eol_status}</p>
                                        <div class="recommendations">
                                            <strong>Recommendations:</strong>
                                            <ul>
                                                ${item.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        
                        <div class="report-actions">
                            <button onclick="Utils.downloadAnalysisReport()" class="btn-primary">Download Report</button>
                            <button onclick="Utils.copyAnalysisReport()" class="btn-secondary">Copy Report</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
}

// Initialize project manager
const projectManager = new ProjectManager();

// Template management
document.addEventListener('DOMContentLoaded', function() {
    // Save template button
    document.getElementById('saveTemplate').addEventListener('click', () => {
        openModal('templateModal');
    });
    
    // Save template action
    document.getElementById('saveTemplateBtn').addEventListener('click', async () => {
        const name = document.getElementById('templateName').value.trim();
        const description = document.getElementById('templateDescription').value.trim();
        
        if (!name) {
            Utils.showNotification('Please enter a template name', 'error');
            return;
        }
        
        const options = Utils.parseScanOptions();
        
        try {
            const response = await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description, options })
            });
            
            const result = await response.json();
            if (result.success) {
                Utils.showNotification('Template saved successfully', 'success');
                closeModal('templateModal');
                
                // Clear form
                document.getElementById('templateName').value = '';
                document.getElementById('templateDescription').value = '';
                
                // Reload templates
                projectManager.loadTemplates();
            } else {
                Utils.showNotification(result.error || 'Failed to save template', 'error');
            }
        } catch (error) {
            Utils.showNotification('Error saving template', 'error');
            console.error('Save template error:', error);
        }
    });
    
    // Template selection change
    document.getElementById('scanTemplate').addEventListener('change', (e) => {
        const selectedOption = e.target.selectedOptions[0];
        if (!selectedOption || !selectedOption.value) return;
        
        const optionsStr = selectedOption.getAttribute('data-options');
        if (optionsStr) {
            try {
                const options = JSON.parse(optionsStr);
                
                // Apply template options
                if (options.preset) {
                    document.getElementById('scanPreset').value = options.preset;
                }
                if (options.timing) {
                    document.getElementById('timingTemplate').value = options.timing;
                }
                
                // Apply checkboxes
                document.getElementById('enableScripts').checked = options.scripts || false;
                document.getElementById('versionDetection').checked = options.version_detection || false;
                document.getElementById('osDetection').checked = options.os_detection || false;
                document.getElementById('skipPing').checked = options.skip_ping || false;
                document.getElementById('pingOnly').checked = options.ping_only || false;
                document.getElementById('aggressive').checked = options.aggressive || false;
                document.getElementById('verbose').checked = options.verbose || false;
                
                if (options.custom_ports) {
                    document.getElementById('customPorts').value = options.custom_ports;
                }
                
                if (options.custom_flags) {
                    document.getElementById('customOptions').value = options.custom_flags;
                }
                
                // Update command preview
                if (window.scanManager) {
                    const preview = document.getElementById('commandPreview');
                    if (preview) {
                        preview.textContent = scanManager.generateCommandPreview();
                    }
                }
                
                Utils.showNotification(`Applied template: ${selectedOption.textContent}`, 'success');
            } catch (error) {
                console.error('Error applying template:', error);
            }
        }
    });

    // Initialize command preview updates
    const updateCommandPreview = () => {
        if (window.scanManager) {
            const preview = document.getElementById('commandPreview');
            if (preview) {
                preview.textContent = scanManager.generateCommandPreview();
            }
        }
    };

    // Add listeners for real-time command preview updates
    document.querySelectorAll('#scanPreset, #timingTemplate, #customPorts, #customOptions').forEach(el => {
        el.addEventListener('change', updateCommandPreview);
        el.addEventListener('input', updateCommandPreview);
    });

    document.querySelectorAll('#enableScripts, #versionDetection, #osDetection, #skipPing, #pingOnly, #aggressive, #verbose').forEach(el => {
        el.addEventListener('change', updateCommandPreview);
    });
    
    // Initial command preview update
    setTimeout(updateCommandPreview, 100);
});