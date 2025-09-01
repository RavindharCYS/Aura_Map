/**
 * Enhanced Nmap GUI Tool - Main Application
 * Core initialization and event coordination
 */

// Application state
const AppState = {
    isScanning: false,
    currentProjectId: null,
    panelSizes: {
        leftWidth: 400,
        minWidth: 300,
        maxWidth: 600
    },
    isDraggingDivider: false
};

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing Enhanced Nmap GUI Tool...');
    
    // Initialize modules
    initializePanelResize();
    initializeSystemInfo();
    initializeKeyboardShortcuts();
    checkNmapAvailability();
    
    // Load saved preferences
    loadUserPreferences();
    
    // Set initial UI state
    updateUIState();
});

// Panel resize functionality
function initializePanelResize() {
    const divider = document.getElementById('panelDivider');
    const leftPanel = document.getElementById('leftPanel');
    const rightPanel = document.getElementById('rightPanel');
    
    let startX = 0;
    let startWidth = 0;
    
    divider.addEventListener('mousedown', (e) => {
        AppState.isDraggingDivider = true;
        startX = e.clientX;
        startWidth = leftPanel.offsetWidth;
        
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        
        // Add overlay to prevent iframe interference
        const overlay = document.createElement('div');
        overlay.id = 'resize-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.zIndex = '9999';
        document.body.appendChild(overlay);
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!AppState.isDraggingDivider) return;
        
        const width = startWidth + (e.clientX - startX);
        
        if (width >= AppState.panelSizes.minWidth && width <= AppState.panelSizes.maxWidth) {
            leftPanel.style.width = width + 'px';
            AppState.panelSizes.leftWidth = width;
            
            // Save preference
            localStorage.setItem('leftPanelWidth', width);
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (AppState.isDraggingDivider) {
            AppState.isDraggingDivider = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            // Remove overlay
            const overlay = document.getElementById('resize-overlay');
            if (overlay) overlay.remove();
        }
    });
    
    // Load saved panel width
    const savedWidth = localStorage.getItem('leftPanelWidth');
    if (savedWidth) {
        const width = parseInt(savedWidth);
        if (width >= AppState.panelSizes.minWidth && width <= AppState.panelSizes.maxWidth) {
            leftPanel.style.width = width + 'px';
            AppState.panelSizes.leftWidth = width;
        }
    }
}

// System info functionality
function initializeSystemInfo() {
    document.getElementById('systemInfoBtn').addEventListener('click', async () => {
        openModal('systemInfoModal');
        
        const contentDiv = document.getElementById('systemInfoContent');
        contentDiv.innerHTML = '<div class="loading">Loading system information...</div>';
        
        try {
            const response = await fetch('/api/system/info');
            const info = await response.json();
            
            contentDiv.innerHTML = `
                <div class="system-info-grid">
                    <div class="info-item">
                        <label>Platform:</label>
                        <span>${info.platform}</span>
                    </div>
                    <div class="info-item">
                        <label>Platform Version:</label>
                        <span>${info.platform_version}</span>
                    </div>
                    <div class="info-item">
                        <label>Python Version:</label>
                        <span>${info.python_version}</span>
                    </div>
                    <div class="info-item">
                        <label>Nmap Version:</label>
                        <span class="${info.nmap_version.includes('Not installed') ? 'error' : 'success'}">
                            ${info.nmap_version}
                        </span>
                    </div>
                    <div class="info-item">
                        <label>Data Directory:</label>
                        <span>${info.data_directory}</span>
                    </div>
                    <div class="info-item">
                        <label>Projects Directory:</label>
                        <span>${info.projects_directory}</span>
                    </div>
                </div>
                
                ${info.nmap_version.includes('Not installed') ? `
                    <div class="warning-message">
                        <p><strong>Warning:</strong> Nmap is not installed or not in PATH.</p>
                        <p>Please install Nmap to use this tool:</p>
                        <ul>
                            <li><strong>Windows:</strong> Download from <a href="https://nmap.org/download.html" target="_blank">nmap.org</a></li>
                            <li><strong>Linux:</strong> Run <code>sudo apt-get install nmap</code></li>
                            <li><strong>macOS:</strong> Run <code>brew install nmap</code></li>
                        </ul>
                    </div>
                ` : ''}
            `;
        } catch (error) {
            contentDiv.innerHTML = '<div class="error-message">Failed to load system information</div>';
            console.error('System info error:', error);
        }
    });
}

// Check Nmap availability on startup
async function checkNmapAvailability() {
    try {
        const response = await fetch('/api/system/info');
        const info = await response.json();
        
        if (info.nmap_version.includes('Not installed')) {
            Utils.showNotification('Warning: Nmap is not installed. Please install Nmap to use this tool.', 'warning', 10000);
        }
    } catch (error) {
        console.error('Failed to check Nmap availability:', error);
    }
}

// Keyboard shortcuts
function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + Enter to start scan
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const startBtn = document.getElementById('startScan');
            if (!startBtn.disabled && startBtn.style.display !== 'none') {
                startBtn.click();
            }
        }
        
        // Escape to cancel scan
        if (e.key === 'Escape' && AppState.isScanning) {
            const cancelBtn = document.getElementById('cancelScan');
            if (cancelBtn.style.display !== 'none') {
                cancelBtn.click();
            }
        }
        
        // Ctrl/Cmd + S to save template
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            document.getElementById('saveTemplate').click();
        }
        
        // Ctrl/Cmd + O to open project folder
        if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
            e.preventDefault();
            const openBtn = document.getElementById('openProjectFolder');
            if (!openBtn.disabled) {
                openBtn.click();
            }
        }
        
        // Ctrl/Cmd + E to export results
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
            e.preventDefault();
            const exportBtn = document.getElementById('exportResults');
            if (!exportBtn.disabled) {
                exportBtn.click();
            }
        }
        
        // F5 to refresh projects
        if (e.key === 'F5') {
            e.preventDefault();
            projectManager.loadProjects();
            Utils.showNotification('Projects refreshed', 'info');
        }
    });
}

// Load user preferences
function loadUserPreferences() {
    // Theme preference
    const theme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', theme);
    
    // Notification sounds
    const enableSounds = localStorage.getItem('enableNotificationSounds') !== 'false';
    
    // Auto-scroll preference
    const autoScroll = localStorage.getItem('autoScroll') !== 'false';
    if (!autoScroll) {
        document.getElementById('toggleAutoScroll').click();
    }
}

// Update UI state based on application state
function updateUIState() {
    const isScanning = AppState.isScanning;
    
    // Update scanning-related UI elements
    document.querySelectorAll('.scan-sensitive').forEach(el => {
        el.disabled = isScanning;
    });
    
    // Update status indicators
    if (isScanning) {
        document.body.classList.add('scanning');
    } else {
        document.body.classList.remove('scanning');
    }
}

// --- START OF MODIFICATION ---
// Load Project button functionality
document.getElementById('loadProjectBtn').addEventListener('click', () => {
    projectManager.showProjectModal();
});

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    Utils.showNotification('An unexpected error occurred', 'error');
});

// Handle connection loss
window.addEventListener('offline', () => {
    Utils.showNotification('Connection lost. Some features may not work.', 'warning');
});

window.addEventListener('online', () => {
    Utils.showNotification('Connection restored', 'success');
});

// Export global functions for use in onclick attributes
window.openModal = openModal;
window.closeModal = closeModal;
window.resultsManager = resultsManager;
window.projectManager = projectManager;