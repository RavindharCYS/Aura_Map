/**
 * Screenshot Manager for Nmap GUI Tool
 * Handles web service screenshot capture and analysis
 */

class ScreenshotManager {
    constructor() {
        this.screenshotResults = [];
        this.isCapturing = false;
        this.captureProgress = { current: 0, total: 0 };
    }

    /**
     * Extract web services from scan results for screenshot capture
     */
    extractWebServices(scanResults) {
        const webServices = [];
        
        scanResults.forEach(result => {
            if (result.host_status === 'up' && result.services) {
                result.services.forEach(service => {
                    // Check if service is potentially a web service
                    if (this.isWebService(service)) {
                        webServices.push({
                            ip: result.target_ip,
                            port: service.port,
                            service: service.service,
                            product: service.product || '',
                            version: service.version || '',
                            url: this.buildServiceUrl(result.target_ip, service.port, service.service)
                        });
                    }
                });
            }
        });
        
        return webServices;
    }

    /**
     * Determine if a service is potentially a web service
     */
    isWebService(service) {
        const webServiceNames = ['http', 'https', 'http-proxy', 'ssl/http', 'http-alt'];
        const webPorts = ['80', '443', '8080', '8443', '8000', '8008', '9000', '3000'];
        
        return webServiceNames.includes(service.service?.toLowerCase()) || 
               webPorts.includes(service.port?.toString()) ||
               (service.product && service.product.toLowerCase().includes('http'));
    }

    /**
     * Build URLs for web services (try both HTTP and HTTPS)
     */
    buildServiceUrl(ip, port, service) {
        // Try HTTPS first for known secure ports
        if (port === '443' || service?.toLowerCase().includes('ssl') || service?.toLowerCase().includes('https')) {
            return [`https://${ip}:${port}`, `http://${ip}:${port}`];
        }
        // Try HTTP first for standard ports
        return [`http://${ip}:${port}`, `https://${ip}:${port}`];
    }

    /**
     * Start screenshot capture process
     */
    async startScreenshotCapture(webServices, projectId) {
        if (this.isCapturing) {
            Utils.showNotification('Screenshot capture already in progress', 'warning');
            return;
        }

        this.isCapturing = true;
        this.captureProgress.total = webServices.length;
        this.captureProgress.current = 0;
        this.screenshotResults = [];

        Utils.showNotification(`Starting screenshot capture for ${webServices.length} web services`, 'info');

        try {
            // Show screenshot progress UI
            this.showScreenshotProgress();

            const response = await fetch('/api/screenshots/capture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: projectId,
                    web_services: webServices
                })
            });

            const result = await response.json();
            
            if (result.success) {
                // Join screenshot session for progress updates
                if (window.scanManager && window.scanManager.socket) {
                    window.scanManager.socket.emit('join_screenshot_session', {
                        session_id: result.session_id
                    });
                }
            } else {
                throw new Error(result.error || 'Failed to start screenshot capture');
            }

        } catch (error) {
            console.error('Screenshot capture error:', error);
            Utils.showNotification('Failed to start screenshot capture', 'error');
            this.isCapturing = false;
            this.hideScreenshotProgress();
        }
    }

    /**
     * Handle screenshot progress updates from WebSocket
     */
    handleScreenshotProgress(data) {
        this.captureProgress.current = data.completed;
        this.updateScreenshotProgressUI(data);
        
        if (data.result) {
            this.screenshotResults.push(data.result);
            this.addScreenshotToResults(data.result);
        }
    }

    /**
     * Handle screenshot completion
     */
    handleScreenshotComplete(data) {
        this.isCapturing = false;
        this.hideScreenshotProgress();
        
        Utils.showNotification(`Screenshot capture completed: ${data.successful}/${data.total} successful`, 'success');
        
        // Update results view with screenshot gallery
        this.updateResultsWithScreenshots();
    }

    /**
     * Show screenshot progress UI
     */
    showScreenshotProgress() {
        const progressHtml = `
            <div class="screenshot-progress" id="screenshotProgress">
                <div class="progress-header">
                    <h4>Capturing Screenshots</h4>
                    <button id="cancelScreenshots" class="btn-danger btn-sm">Cancel</button>
                </div>
                <div class="progress-bar-wrapper">
                    <div class="progress-bar" id="screenshotProgressBar"></div>
                    <span class="progress-text" id="screenshotProgressText">0%</span>
                </div>
                <div class="current-capture" id="currentCapture">Initializing...</div>
            </div>
        `;
        
        const scanStatus = document.getElementById('scanStatus');
        if (scanStatus) {
            scanStatus.insertAdjacentHTML('beforeend', progressHtml);
            scanStatus.style.display = 'block';
        }

        // Add cancel functionality
        document.getElementById('cancelScreenshots').addEventListener('click', () => {
            this.cancelScreenshotCapture();
        });
    }

    /**
     * Update screenshot progress UI
     */
    updateScreenshotProgressUI(data) {
        const progressBar = document.getElementById('screenshotProgressBar');
        const progressText = document.getElementById('screenshotProgressText');
        const currentCapture = document.getElementById('currentCapture');
        
        if (progressBar && progressText) {
            const percentage = (data.completed / data.total) * 100;
            progressBar.style.width = `${percentage}%`;
            progressText.textContent = `${Math.round(percentage)}%`;
        }
        
        if (currentCapture && data.current_url) {
            currentCapture.textContent = `Capturing: ${data.current_url}`;
        }
    }

    /**
     * Hide screenshot progress UI
     */
    hideScreenshotProgress() {
        const progressElement = document.getElementById('screenshotProgress');
        if (progressElement) {
            progressElement.remove();
        }
    }

    /**
     * Cancel screenshot capture
     */
    async cancelScreenshotCapture() {
        try {
            const response = await fetch('/api/screenshots/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            Utils.showNotification('Screenshot capture cancelled', 'warning');
            this.isCapturing = false;
            this.hideScreenshotProgress();
            
        } catch (error) {
            console.error('Cancel screenshot error:', error);
        }
    }

    /**
     * Add screenshot to results display
     */
    addScreenshotToResults(screenshotData) {
        // Find the corresponding host result element
        const hostElements = document.querySelectorAll('.host-result');
        
        hostElements.forEach(element => {
            const hostIP = element.getAttribute('data-ip');
            const hostPorts = element.querySelectorAll('.service-tag');
            
            hostPorts.forEach(portElement => {
                const port = portElement.getAttribute('data-port');
                
                if (hostIP === screenshotData.ip && port === screenshotData.port.toString()) {
                    // Add screenshot thumbnail to service
                    this.addScreenshotThumbnail(portElement, screenshotData);
                }
            });
        });
    }

    /**
     * Add screenshot thumbnail to service element
     */
    addScreenshotThumbnail(serviceElement, screenshotData) {
        // Remove any existing screenshot
        const existingScreenshot = serviceElement.querySelector('.screenshot-thumbnail');
        if (existingScreenshot) {
            existingScreenshot.remove();
        }

        if (screenshotData.screenshot_path) {
            const thumbnail = document.createElement('div');
            thumbnail.className = 'screenshot-thumbnail';
            thumbnail.innerHTML = `
                <img src="/api/screenshots/${screenshotData.screenshot_filename}" 
                     alt="Screenshot" 
                     onclick="screenshotManager.showScreenshotModal('${screenshotData.url}', '${screenshotData.screenshot_filename}')"
                     title="Click to view full screenshot">
                <span class="screenshot-indicator">📷</span>
            `;
            serviceElement.appendChild(thumbnail);
        } else if (screenshotData.error) {
            const errorIndicator = document.createElement('span');
            errorIndicator.className = 'screenshot-error';
            errorIndicator.textContent = '❌';
            errorIndicator.title = `Screenshot failed: ${screenshotData.error}`;
            serviceElement.appendChild(errorIndicator);
        }
    }

    /**
     * Show screenshot in modal
     */
    showScreenshotModal(url, filename) {
        const modal = document.createElement('div');
        modal.className = 'modal screenshot-modal';
        modal.style.display = 'flex';
        
        modal.innerHTML = `
            <div class="modal-content modal-large">
                <div class="modal-header">
                    <h3>Screenshot: ${url}</h3>
                    <button class="modal-close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="screenshot-container">
                        <img src="/api/screenshots/${filename}" 
                             alt="Website Screenshot" 
                             style="max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                    <div class="screenshot-actions">
                        <button onclick="window.open('/api/screenshots/${filename}', '_blank')" class="btn-secondary">
                            🔗 Open Full Size
                        </button>
                        <button onclick="window.open('${url}', '_blank')" class="btn-primary">
                            🌐 Visit Site
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    /**
     * Update results view with screenshot gallery
     */
    updateResultsWithScreenshots() {
        // Add screenshot gallery section to results
        const resultsContainer = document.getElementById('resultsContainer');
        if (!resultsContainer) return;

        // Check if gallery already exists
        let gallery = document.getElementById('screenshotGallery');
        if (!gallery) {
            gallery = document.createElement('div');
            gallery.id = 'screenshotGallery';
            gallery.className = 'screenshot-gallery';
            
            const galleryHeader = document.createElement('div');
            galleryHeader.className = 'gallery-header';
            galleryHeader.innerHTML = `
                <h3>Web Service Screenshots</h3>
                <div class="gallery-controls">
                    <button id="toggleGallery" class="btn-secondary btn-sm">Hide Gallery</button>
                    <button id="downloadAllScreenshots" class="btn-primary btn-sm">Download All</button>
                </div>
            `;
            gallery.appendChild(galleryHeader);
            
            const galleryGrid = document.createElement('div');
            galleryGrid.className = 'gallery-grid';
            galleryGrid.id = 'galleryGrid';
            gallery.appendChild(galleryGrid);
            
            resultsContainer.appendChild(gallery);
            
            // Add event listeners
            document.getElementById('toggleGallery').addEventListener('click', () => {
                this.toggleGalleryVisibility();
            });
            
            document.getElementById('downloadAllScreenshots').addEventListener('click', () => {
                this.downloadAllScreenshots();
            });
        }
        
        // Populate gallery with screenshots
        this.populateScreenshotGallery();
    }

    /**
     * Populate screenshot gallery
     */
    populateScreenshotGallery() {
        const galleryGrid = document.getElementById('galleryGrid');
        if (!galleryGrid) return;
        
        galleryGrid.innerHTML = '';
        
        this.screenshotResults.forEach(screenshot => {
            if (screenshot.screenshot_path) {
                const galleryItem = document.createElement('div');
                galleryItem.className = 'gallery-item';
                galleryItem.innerHTML = `
                    <div class="gallery-thumbnail">
                        <img src="/api/screenshots/${screenshot.screenshot_filename}" 
                             alt="${screenshot.url}"
                             onclick="screenshotManager.showScreenshotModal('${screenshot.url}', '${screenshot.screenshot_filename}')">
                        <div class="gallery-overlay">
                            <span class="gallery-url">${screenshot.url}</span>
                        </div>
                    </div>
                `;
                galleryGrid.appendChild(galleryItem);
            }
        });
        
        if (this.screenshotResults.length === 0) {
            galleryGrid.innerHTML = '<div class="empty-gallery">No screenshots captured yet</div>';
        }
    }

    /**
     * Toggle gallery visibility
     */
    toggleGalleryVisibility() {
        const gallery = document.getElementById('screenshotGallery');
        const toggleBtn = document.getElementById('toggleGallery');
        
        if (gallery.style.display === 'none') {
            gallery.style.display = 'block';
            toggleBtn.textContent = 'Hide Gallery';
        } else {
            gallery.style.display = 'none';
            toggleBtn.textContent = 'Show Gallery';
        }
    }

    /**
     * Download all screenshots as ZIP
     */
    async downloadAllScreenshots() {
        try {
            Utils.showNotification('Preparing screenshot download...', 'info');
            
            const response = await fetch('/api/screenshots/download-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: window.currentProjectId
                })
            });
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `screenshots_${new Date().toISOString().split('T')[0]}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                
                Utils.showNotification('Screenshots downloaded successfully', 'success');
            } else {
                throw new Error('Download failed');
            }
        } catch (error) {
            console.error('Download error:', error);
            Utils.showNotification('Failed to download screenshots', 'error');
        }
    }

    /**
     * Add screenshot capture button to results interface
     */
    addScreenshotControls() {
        const dashboardControls = document.querySelector('.dashboard-controls');
        if (!dashboardControls) return;

        // Check if button already exists
        if (document.getElementById('captureScreenshots')) return;

        const screenshotBtn = document.createElement('button');
        screenshotBtn.id = 'captureScreenshots';
        screenshotBtn.className = 'btn-secondary';
        screenshotBtn.innerHTML = '<span class="btn-icon">📷</span> Capture Screenshots';
        screenshotBtn.disabled = true;
        
        screenshotBtn.addEventListener('click', () => {
            this.initiateScreenshotCapture();
        });
        
        // Insert before export button
        const exportBtn = document.getElementById('exportResults');
        if (exportBtn) {
            dashboardControls.insertBefore(screenshotBtn, exportBtn);
        } else {
            dashboardControls.appendChild(screenshotBtn);
        }
    }

    /**
     * Initiate screenshot capture from current results
     */
    async initiateScreenshotCapture() {
        if (!window.resultsManager || !window.resultsManager.results) {
            Utils.showNotification('No scan results available for screenshot capture', 'error');
            return;
        }

        if (!window.currentProjectId) {
            Utils.showNotification('No active project for screenshot capture', 'error');
            return;
        }

        const webServices = this.extractWebServices(window.resultsManager.results);
        
        if (webServices.length === 0) {
            Utils.showNotification('No web services found in scan results', 'warning');
            return;
        }

        if (confirm(`Capture screenshots for ${webServices.length} web services?`)) {
            await this.startScreenshotCapture(webServices, window.currentProjectId);
        }
    }

    /**
     * Enable screenshot controls when results are available
     */
    enableScreenshotControls() {
        const screenshotBtn = document.getElementById('captureScreenshots');
        if (screenshotBtn) {
            screenshotBtn.disabled = false;
        }
    }

    /**
     * Disable screenshot controls
     */
    disableScreenshotControls() {
        const screenshotBtn = document.getElementById('captureScreenshots');
        if (screenshotBtn) {
            screenshotBtn.disabled = true;
        }
    }
}

// Initialize screenshot manager
const screenshotManager = new ScreenshotManager();

// Integration with existing scan manager
if (window.scanManager) {
    // Add screenshot event listeners to socket
    const originalSocket = window.scanManager.socket;
    
    if (originalSocket) {
        originalSocket.on('screenshot_progress', (data) => {
            screenshotManager.handleScreenshotProgress(data);
        });
        
        originalSocket.on('screenshot_completed', (data) => {
            screenshotManager.handleScreenshotComplete(data);
        });
    }
}

// Export for global access
window.screenshotManager = screenshotManager;