/**
 * Enhanced Nmap GUI Tool - Main Application
 * Core initialization and event coordination with session management
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
    
    // Restore active scan session if exists
    restoreActiveScanSession();
    
    // Load saved preferences
    loadUserPreferences();
    
    // Set initial UI state
    updateUIState();
});

// Restore active scan session on page load
async function restoreActiveScanSession() {
    const activeSessionId = sessionStorage.getItem('activeScanSessionId');
    const activeProjectId = sessionStorage.getItem('activeProjectId');

    if (activeSessionId && activeProjectId) {
        console.log(`Found active scan session: ${activeSessionId}`);
        Utils.showNotification('Restoring active scan session...', 'info');

        // 1. Put the UI into a "scanning" state immediately
        AppState.isScanning = true;
        scanManager.setScanningUI(true);
        scanManager.currentScanSession = activeSessionId;

        // 2. Fetch the results that have already completed for this project
        try {
            await projectManager.loadProjectResults(activeProjectId, 'Restored Session');
            window.currentProjectId = activeProjectId;
        } catch (error) {
            console.error('Failed to load project results during restoration:', error);
        }

        // 3. Re-join the WebSocket room to get live updates for the rest of the scan
        if (scanManager.socket && scanManager.socket.connected) {
            scanManager.socket.emit('join_scan_session', {
                scan_session_id: activeSessionId
            });
        } else {
            // Wait for socket connection
            scanManager.socket.on('connect', () => {
                scanManager.socket.emit('join_scan_session', {
                    scan_session_id: activeSessionId
                });
            });
        }
        
        // 4. Start the timer (from current time since we don't know original start)
        scanManager.scanStartTime = Date.now();
        scanManager.startScanTimer();
        
        Utils.showNotification('Scan session restored successfully', 'success');
    }
}

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
        const toggleBtn = document.getElementById('toggleAutoScroll');
        if (toggleBtn) {
            toggleBtn.click();
        }
    }
}

// Update UI state based on application state
function updateUIState() {
    const isScanning = AppState.isScanning;
    
    // Update scanning-related UI elements
    document.querySelectorAll('.scan-sensitive').forEach(el => {
        el.disabled = isScanning;
    });
    
    // Show or hide the "Close Session" button
    const closeBtn = document.getElementById('closeSessionBtn');
    if (closeBtn) {
        closeBtn.style.display = isScanning ? 'inline-block' : 'none';
    }
    
    // Update status indicators
    if (isScanning) {
        document.body.classList.add('scanning');
    } else {
        document.body.classList.remove('scanning');
    }
}

// Load Project button functionality
document.getElementById('loadProjectBtn').addEventListener('click', () => {
    projectManager.showProjectModal();
});

// Handle the new "Close Session" button
document.getElementById('closeSessionBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to close this session? This will cancel the currently running scan.')) {
        // Cancel the scan on the backend
        scanManager.cancelScan();
        
        // Clear the session from storage
        sessionStorage.removeItem('activeScanSessionId');
        sessionStorage.removeItem('activeProjectId');
        
        // Update UI state
        AppState.isScanning = false;
        updateUIState();
        
        // Reload the page to get a clean state
        window.location.reload();
    }
});

// Warn user before leaving the page if a scan is active
window.addEventListener('beforeunload', (e) => {
    const activeSessionId = sessionStorage.getItem('activeScanSessionId');
    if (AppState.isScanning || activeSessionId) {
        e.preventDefault();
        e.returnValue = 'A scan is currently in progress. Are you sure you want to leave? The scan will continue in the background.';
    }
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

// Modal management functions
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('modal-open');
        // Focus management for accessibility
        const firstInput = modal.querySelector('input, select, textarea, button');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('modal-open');
    }
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
        e.target.classList.remove('modal-open');
    }
});

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const openModal = document.querySelector('.modal[style*="flex"]');
        if (openModal) {
            openModal.style.display = 'none';
            openModal.classList.remove('modal-open');
        }
    }
});

// Initialize notification system
function initializeNotifications() {
    // Create notification container if it doesn't exist
    if (!document.getElementById('notificationContainer')) {
        const container = document.createElement('div');
        container.id = 'notificationContainer';
        container.className = 'notification-container';
        document.body.appendChild(container);
    }
}

// Session management utilities
const SessionManager = {
    save: (key, value) => {
        try {
            sessionStorage.setItem(key, value);
        } catch (error) {
            console.error('Failed to save to session storage:', error);
        }
    },
    
    get: (key) => {
        try {
            return sessionStorage.getItem(key);
        } catch (error) {
            console.error('Failed to read from session storage:', error);
            return null;
        }
    },
    
    remove: (key) => {
        try {
            sessionStorage.removeItem(key);
        } catch (error) {
            console.error('Failed to remove from session storage:', error);
        }
    },
    
    clear: () => {
        try {
            sessionStorage.removeItem('activeScanSessionId');
            sessionStorage.removeItem('activeProjectId');
        } catch (error) {
            console.error('Failed to clear session storage:', error);
        }
    },
    
    isActiveSession: () => {
        return SessionManager.get('activeScanSessionId') !== null;
    }
};

// Enhanced UI state management
function updateUIState() {
    const isScanning = AppState.isScanning || SessionManager.isActiveSession();
    
    // Update scanning-related UI elements
    document.querySelectorAll('.scan-sensitive').forEach(el => {
        el.disabled = isScanning;
    });
    
    // Show or hide the "Close Session" button
    const closeBtn = document.getElementById('closeSessionBtn');
    if (closeBtn) {
        closeBtn.style.display = isScanning ? 'inline-block' : 'none';
    }
    
    // Update connection status styling
    const connectionStatus = document.getElementById('connectionStatus');
    if (connectionStatus) {
        connectionStatus.classList.toggle('scanning', isScanning);
    }
    
    // Update status indicators
    if (isScanning) {
        document.body.classList.add('scanning');
    } else {
        document.body.classList.remove('scanning');
    }
    
    // Update AppState
    AppState.isScanning = isScanning;
}

// Theme management
function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    Utils.showNotification(`Switched to ${newTheme} theme`, 'info');
}

// Performance monitoring
const PerformanceMonitor = {
    start: (operation) => {
        performance.mark(`${operation}-start`);
    },
    
    end: (operation) => {
        try {
            performance.mark(`${operation}-end`);
            performance.measure(operation, `${operation}-start`, `${operation}-end`);
            const measure = performance.getEntriesByName(operation)[0];
            console.log(`${operation} took ${measure.duration.toFixed(2)}ms`);
        } catch (error) {
            console.error('Performance monitoring error:', error);
        }
    }
};

// Initialize tooltips
function initializeTooltips() {
    document.querySelectorAll('[title]').forEach(element => {
        element.addEventListener('mouseenter', (e) => {
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.textContent = e.target.title;
            document.body.appendChild(tooltip);
            
            const rect = e.target.getBoundingClientRect();
            tooltip.style.left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2 + 'px';
            tooltip.style.top = rect.top - tooltip.offsetHeight - 10 + 'px';
            
            e.target.tooltip = tooltip;
            e.target.removeAttribute('title'); // Prevent default tooltip
        });
        
        element.addEventListener('mouseleave', (e) => {
            if (e.target.tooltip) {
                e.target.tooltip.remove();
                e.target.title = e.target.tooltip.textContent; // Restore title
                e.target.tooltip = null;
            }
        });
    });
}

// Initialize after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeNotifications();
    initializeTooltips();
});

// Export global functions for use in onclick attributes
window.openModal = openModal;
window.closeModal = closeModal;
window.resultsManager = resultsManager;
window.projectManager = projectManager;
window.scanManager = scanManager;
window.SessionManager = SessionManager;
window.updateUIState = updateUIState;
window.toggleTheme = toggleTheme;

// Cleanup on page unload
window.addEventListener('unload', () => {
    // Cleanup any timers or intervals
    if (scanManager && scanManager.scanTimer) {
        clearInterval(scanManager.scanTimer);
    }
    
    // Close socket connection
    if (scanManager && scanManager.socket) {
        scanManager.socket.disconnect();
    }
});