/**
 * Enhanced Nmap GUI Tool - Projects Module
 * Handles project management and selection
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
        
        card.innerHTML = `
            <div class="project-card-header">
                <h4>${project.name}</h4>
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
                <button class="btn-primary" onclick="projectManager.loadProjectResults('${project.id}', '${Utils.escapeHtml(project.name)}')">Load Results</button>
                <button class="btn-secondary" onclick="projectManager.selectProjectFromModal('${project.id}')">Set as Active</button>
            </div>
        `;
        
        return card;
    }

    async loadProjectResults(projectId, projectName) {
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
                    
                    // Update results manager
                    resultsManager.results = scanResults;
                    resultsManager.filteredResults = scanResults;
                    
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
                    
                    Utils.showNotification(`Successfully loaded ${scanResults.length} scan results.`, 'success');
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
            
            // TODO: Show project details in a modal or separate view
            console.log('Project scans:', scans);
            Utils.showNotification('Project details view coming soon', 'info');
            
        } catch (error) {
            Utils.showNotification('Failed to load project details', 'error');
        }
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
                
                Utils.showNotification(`Applied template: ${selectedOption.textContent}`, 'success');
            } catch (error) {
                console.error('Error applying template:', error);
            }
        }
    });
});