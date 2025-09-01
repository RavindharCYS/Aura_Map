/**
 * Enhanced Nmap GUI Tool - Scanner Module
 * Handles scan configuration, execution, and real-time updates with advanced features
 */

class ScanManager {
    constructor() {
        this.socket = null;
        this.currentScanSession = null;
        this.scanResults = [];
        this.scanStartTime = null;
        this.scanTimer = null;
        this.autoScroll = true;
        this.targetList = [];
        this.totalTargets = 0;
        this.completedTargets = 0;
        this.lastCompletedTarget = null;
        this.initializeSocket();
        this.initializeCommandPreview();
    }

    initializeSocket() {
        // Initialize Socket.IO connection
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to scanner backend');
            document.getElementById('connectionStatus').textContent = 'Connected';
            document.getElementById('connectionStatus').classList.add('connected');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from backend');
            document.getElementById('connectionStatus').textContent = 'Disconnected';
            document.getElementById('connectionStatus').classList.remove('connected');
        });

        // Scan event handlers
        this.socket.on('scan_started', (data) => {
            this.handleScanStarted(data);
        });

        this.socket.on('scan_progress', (data) => {
            this.handleScanProgress(data);
        });

        this.socket.on('host_result', (data) => {
            this.handleHostResult(data);
        });

        this.socket.on('host_error', (data) => {
            this.handleHostError(data);
        });

        this.socket.on('scan_completed', (data) => {
            this.handleScanCompleted(data);
        });

        this.socket.on('scan_cancelled', (data) => {
            this.handleScanCancelled(data);
        });
    }

    initializeCommandPreview() {
        // Update command preview when options change
        const updatePreview = () => {
            const preview = document.getElementById('commandPreview');
            if (preview) {
                preview.textContent = this.generateCommandPreview();
            }
        };

        // Listen to all scan option changes
        document.querySelectorAll('#scanPreset, #timingTemplate, #customPorts, #customOptions').forEach(el => {
            el.addEventListener('change', updatePreview);
            el.addEventListener('input', updatePreview);
        });

        document.querySelectorAll('#enableScripts, #versionDetection, #osDetection, #skipPing, #pingOnly, #aggressive, #verbose').forEach(el => {
            el.addEventListener('change', updatePreview);
        });
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
        
        // Add custom options
        const customOptions = document.getElementById('customOptions')?.value?.trim();
        if (customOptions) {
            command += ' ' + customOptions;
        }
        
        command += ' [TARGETS]';
        return command;
    }

    async processInput() {
        const activeTab = document.querySelector('.tab-content.active').id;
        let inputText = '';

        if (activeTab === 'manual-tab') {
            inputText = document.getElementById('ipInput').value.trim();
        } else if (activeTab === 'range-tab') {
            const startIP = document.getElementById('startIP').value.trim();
            const endIP = document.getElementById('endIP').value.trim();
            const ports = document.getElementById('rangePorts').value.trim();
            
            if (!startIP || !endIP) {
                Utils.showNotification('Please enter start and end IP addresses', 'error');
                return;
            }

            try {
                const ipRange = Utils.parseIPRange(startIP, endIP);
                inputText = ipRange.join('\n');
                if (ports) {
                    inputText = ipRange.map(ip => `${ip}:${ports}`).join('\n');
                }
            } catch (error) {
                Utils.showNotification(error.message, 'error');
                return;
            }
        } else if (activeTab === 'file-tab') {
            const fileInput = document.getElementById('fileInput');
            if (fileInput.files.length === 0) {
                Utils.showNotification('Please select a file', 'error');
                return;
            }

            try {
                inputText = await this.readFile(fileInput.files[0]);
            } catch (error) {
                Utils.showNotification('Error reading file', 'error');
                return;
            }
        }

        if (!inputText) {
            Utils.showNotification('No targets specified', 'error');
            return;
        }

        // Process input on backend
        try {
            const response = await fetch('/api/scan/process-input', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ input: inputText })
            });

            const result = await response.json();
            
            if (result.success) {
                this.targetList = result.targets;
                this.totalTargets = result.total_targets;
                this.updateScopePreview(result);
                document.getElementById('startScan').disabled = false;
                Utils.showNotification(`Processed ${result.total_targets} targets`, 'success');
                
                // Update command preview with actual targets
                this.updateCommandPreviewWithTargets();
            } else {
                Utils.showNotification(result.error || 'Failed to process input', 'error');
            }
        } catch (error) {
            Utils.showNotification('Error processing input', 'error');
            console.error(error);
        }
    }

    updateCommandPreviewWithTargets() {
        const preview = document.getElementById('commandPreview');
        if (preview && this.targetList.length > 0) {
            let command = this.generateCommandPreview();
            // Replace [TARGETS] with actual targets (show first few)
            const targetDisplay = this.targetList.length > 3 ? 
                `${this.targetList.slice(0, 3).join(' ')} ... (${this.targetList.length} total)` :
                this.targetList.join(' ');
            command = command.replace('[TARGETS]', targetDisplay);
            preview.textContent = command;
        }
    }

    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    updateScopePreview(data) {
        document.getElementById('totalTargets').textContent = `${data.total_targets} IPs`;
        document.getElementById('estimatedTime').textContent = `~${Math.ceil(data.estimated_time / 60)} min`;
    }

    async startScan(resumeFrom = null) {
        // Validate project
        const projectName = document.getElementById('projectName').value.trim();
        if (!projectName) {
            Utils.showNotification('Please enter a project name', 'error');
            return;
        }

        // Get or create project
        let projectId = null;
        const isNewProject = document.getElementById('toggleProjectMode').textContent === 'New';
        
        if (isNewProject) {
            // Create new project
            try {
                const projectData = {
                    name: projectName,
                    pmo: document.getElementById('projectPMO').value.trim(),
                    description: document.getElementById('projectDescription').value.trim(),
                    assessment_type: document.getElementById('assessmentType').value
                };

                const response = await fetch('/api/projects', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(projectData)
                });

                const result = await response.json();
                if (result.success) {
                    projectId = result.project_id;
                    Utils.showNotification(`Project '${projectName}' created`, 'success');
                } else {
                    Utils.showNotification(result.error || 'Failed to create project', 'error');
                    return;
                }
            } catch (error) {
                Utils.showNotification('Error creating project', 'error');
                console.error(error);
                return;
            }
        } else {
            // Use existing project
            const selectedProject = document.getElementById('projectSelect').value;
            if (!selectedProject) {
                Utils.showNotification('Please select a project', 'error');
                return;
            }
            projectId = selectedProject;
        }

        // Get scan options
        const options = Utils.parseScanOptions();

        // Add custom options if specified
        const customOptions = document.getElementById('customOptions')?.value?.trim();
        if (customOptions) {
            options.custom_flags = customOptions;
        }

        // Prepare targets (resume from specific point if needed)
        let targetsToScan = this.targetList;
        if (resumeFrom !== null) {
            targetsToScan = this.targetList.slice(resumeFrom);
            Utils.showNotification(`Resuming scan from target ${resumeFrom + 1}`, 'info');
        }

        // Start scan
        try {
            const response = await fetch('/api/scan/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: projectId,
                    targets: targetsToScan,
                    options: options,
                    resume_from: resumeFrom
                })
            });

            const result = await response.json();
            if (result.success) {
                this.currentScanSession = result.scan_session_id;
                if (!resumeFrom) {
                    this.scanResults = [];
                    this.completedTargets = 0;
                }
                this.scanStartTime = Date.now();
                this.startScanTimer();
                
                // Update UI
                this.setScanningUI(true);
                
                // Join scan session for real-time updates
                this.socket.emit('join_scan_session', { 
                    scan_session_id: result.scan_session_id 
                });
                
                Utils.showNotification(resumeFrom ? 'Scan resumed' : 'Scan started', 'success');
                
                // Store current project ID for results
                window.currentProjectId = projectId;
            } else {
                Utils.showNotification(result.error || 'Failed to start scan', 'error');
            }
        } catch (error) {
            Utils.showNotification('Error starting scan', 'error');
            console.error(error);
        }
    }

    async cancelScan() {
        if (!this.currentScanSession) return;

        try {
            const response = await fetch('/api/scan/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scan_session_id: this.currentScanSession
                })
            });

            const result = await response.json();
            if (result.success) {
                Utils.showNotification('Scan cancelled', 'warning');
                
                // Mark scan as incomplete if targets remain
                if (this.completedTargets < this.totalTargets) {
                    resultsManager.scanStatus = 'incomplete';
                    resultsManager.lastScannedTarget = this.completedTargets;
                }
            }
        } catch (error) {
            console.error('Error cancelling scan:', error);
        }
    }

    resumeScan() {
        if (this.lastScannedTarget !== null && this.lastScannedTarget < this.totalTargets - 1) {
            this.startScan(this.lastScannedTarget + 1);
        } else {
            Utils.showNotification('No incomplete scan to resume', 'warning');
        }
    }

    setScanningUI(scanning) {
        // Toggle button states with null checks
        const startBtn = document.getElementById('startScan');
        const cancelBtn = document.getElementById('cancelScan');
        
        if (startBtn) {
            startBtn.style.display = scanning ? 'none' : 'block';
        }
        
        if (cancelBtn) {
            cancelBtn.style.display = scanning ? 'block' : 'none';
        }
        
        // Disable inputs during scanning
        const inputs = document.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            if (!['cancelScan', 'clearLog', 'toggleAutoScroll'].includes(input.id)) {
                input.disabled = scanning;
            }
        });
        
        // Show/hide scan status
        const scanStatus = document.getElementById('scanStatus');
        if (scanStatus) {
            scanStatus.style.display = scanning ? 'block' : 'none';
        }
        
        if (scanning) {
            const scanStatusText = document.getElementById('scanStatusText');
            if (scanStatusText) {
                scanStatusText.textContent = 'Scanning';
                scanStatusText.classList.add('scanning');
            }
            
            const resultsContainer = document.getElementById('resultsContainer');
            if (resultsContainer) {
                resultsContainer.innerHTML = '';
            }
            
            const emptyState = document.getElementById('emptyState');
            if (emptyState) {
                emptyState.style.display = 'none';
            }
            
            const filtersBar = document.getElementById('filtersBar');
            if (filtersBar) {
                filtersBar.style.display = 'block';
            }
        } else {
            const scanStatusText = document.getElementById('scanStatusText');
            if (scanStatusText) {
                scanStatusText.textContent = 'Ready';
                scanStatusText.classList.remove('scanning');
            }
            this.stopScanTimer();
        }
    }

    startScanTimer() {
        this.scanTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.scanStartTime) / 1000);
            document.getElementById('scanDuration').textContent = Utils.formatDuration(elapsed);
        }, 1000);
    }

    stopScanTimer() {
        if (this.scanTimer) {
            clearInterval(this.scanTimer);
            this.scanTimer = null;
        }
    }

    handleScanStarted(data) {
        console.log('Scan started:', data);
        this.totalTargets = data.total_targets;
        document.getElementById('totalCount').textContent = data.total_targets;
        this.logMessage(`Scan started - ${data.total_targets} targets`, 'info');
    }

    handleScanProgress(data) {
        // Update progress bar
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        progressBar.style.width = `${data.progress}%`;
        progressText.textContent = `${Math.round(data.progress)}%`;
        
        // Update metrics
        document.getElementById('currentTarget').textContent = data.current_target;
        document.getElementById('completedCount').textContent = data.completed;
        document.getElementById('scanETA').textContent = data.eta;
        
        // Track completion for resume functionality
        this.completedTargets = data.completed;
        this.lastCompletedTarget = data.current_target_index;
    }

    handleHostResult(data) {
        this.scanResults.push(data.result);
        
        // Add to results display
        const resultElement = resultsManager.createHostResultElement(data.result);
        if (resultElement) {
            document.getElementById('resultsContainer').appendChild(resultElement);
        }
        
        // Log result
        const status = data.result.host_status === 'up' ? 'UP' : 'DOWN';
        const openPorts = data.result.open_ports || 0;
        this.logMessage(
            `${data.target_ip} - ${status} - ${openPorts} open ports`, 
            status === 'UP' ? 'success' : 'warning'
        );

        // Auto-scroll to latest result if enabled
        if (this.autoScroll && resultElement) {
            resultElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }

        // Update live statistics
        this.updateLiveStatistics();
    }

    handleHostError(data) {
        this.logMessage(`Error scanning ${data.target_ip}: ${data.error}`, 'error');
    }

    handleScanCompleted(data) {
        this.setScanningUI(false);
        this.stopScanTimer();
        
        // Determine if scan was complete or incomplete
        const isComplete = data.total_completed >= this.totalTargets;
        resultsManager.scanStatus = isComplete ? 'complete' : 'incomplete';
        
        if (isComplete) {
            Utils.showNotification('Scan completed!', 'success');
            this.logMessage(`Scan completed - ${data.total_completed} hosts scanned`, 'success');
        } else {
            Utils.showNotification(`Scan incomplete - ${data.total_completed}/${this.totalTargets} hosts scanned`, 'warning');
            this.logMessage(`Scan incomplete - ${data.total_completed}/${this.totalTargets} hosts scanned`, 'warning');
            resultsManager.lastScannedTarget = this.completedTargets;
        }
        
        // Enable results actions
        document.getElementById('openProjectFolder').disabled = false;
        document.getElementById('exportResults').disabled = false;
        document.getElementById('viewResults').style.display = 'inline-block';
        
        // Update final statistics
        this.updateLiveStatistics();
        
        // Play completion sound if enabled
        if (this.isNotificationSoundEnabled()) {
            this.playNotificationSound();
        }
    }

    handleScanCancelled(data) {
        this.setScanningUI(false);
        this.stopScanTimer();
        
        // Mark as incomplete if not all targets were scanned
        if (this.completedTargets < this.totalTargets) {
            resultsManager.scanStatus = 'incomplete';
            resultsManager.lastScannedTarget = this.completedTargets;
        }
        
        Utils.showNotification('Scan cancelled', 'warning');
        this.logMessage('Scan cancelled by user', 'warning');
    }

    updateLiveStatistics() {
        const stats = Utils.calculateScanStats(this.scanResults);
        
        // Update summary in header
        const summaryText = `Hosts: ${stats.hostsUp}↑ ${stats.hostsDown}↓ | Ports: ${stats.totalOpenPorts} open`;
        
        // Create or update summary element
        let summaryElement = document.getElementById('scanSummary');
        if (!summaryElement) {
            summaryElement = document.createElement('div');
            summaryElement.id = 'scanSummary';
            summaryElement.className = 'scan-summary';
            document.querySelector('.dashboard-header').appendChild(summaryElement);
        }
        summaryElement.textContent = summaryText;
    }

    logMessage(message, type = 'info') {
        const logContainer = document.getElementById('scanLog');
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${type}`;
        
        const timestamp = new Date().toLocaleTimeString();
        logEntry.innerHTML = `
            <span class="log-time">[${timestamp}]</span>
            <span class="log-message">${Utils.escapeHtml(message)}</span>
        `;
        
        logContainer.appendChild(logEntry);
        
        // Auto-scroll if enabled
        if (this.autoScroll) {
            logContainer.scrollTop = logContainer.scrollHeight;
        }
        
        // Limit log entries
        const maxEntries = 1000;
        while (logContainer.children.length > maxEntries) {
            logContainer.removeChild(logContainer.firstChild);
        }
    }

    isNotificationSoundEnabled() {
        return localStorage.getItem('enableNotificationSounds') !== 'false';
    }

    playNotificationSound() {
        try {
            const audio = new Audio('assets/sounds/scan-complete.mp3');
            audio.volume = 0.5;
            audio.play().catch(e => console.log('Could not play notification sound:', e));
        } catch (e) {
            console.log('Error playing notification sound:', e);
        }
    }
}

// Initialize scanner
const scanManager = new ScanManager();

// Event listeners for scan controls
document.addEventListener('DOMContentLoaded', function() {
    // Process input button
    document.getElementById('processInput').addEventListener('click', () => {
        scanManager.processInput();
    });

    // Start scan button
    document.getElementById('startScan').addEventListener('click', () => {
        scanManager.startScan();
    });

    // Cancel scan button
    document.getElementById('cancelScan').addEventListener('click', () => {
        if (confirm('Are you sure you want to cancel the current scan?')) {
            scanManager.cancelScan();
        }
    });

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            
            // Update active states
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            
            this.classList.add('active');
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });

    // Generate range button
    document.getElementById('generateRange').addEventListener('click', () => {
        const startIP = document.getElementById('startIP').value.trim();
        const endIP = document.getElementById('endIP').value.trim();
        
        if (!startIP || !endIP) {
            Utils.showNotification('Please enter start and end IP addresses', 'error');
            return;
        }
        
        scanManager.processInput();
    });

    // File upload
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('fileDropZone');
    
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            const fileName = fileInput.files[0].name;
            dropZone.querySelector('.drop-content p').textContent = fileName;
            scanManager.processInput();
        }
    });

    // Drag and drop support
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
            const fileName = files[0].name;
            dropZone.querySelector('.drop-content p').textContent = fileName;
            scanManager.processInput();
        }
    });

    // Log controls
    document.getElementById('clearLog').addEventListener('click', () => {
        document.getElementById('scanLog').innerHTML = '';
    });

    document.getElementById('toggleAutoScroll').addEventListener('click', function() {
        scanManager.autoScroll = !scanManager.autoScroll;
        this.classList.toggle('active');
        this.textContent = scanManager.autoScroll ? 'Auto-scroll' : 'Manual scroll';
    });

    // Input change listeners
    document.getElementById('ipInput').addEventListener('input', Utils.debounce(() => {
        const hasInput = document.getElementById('ipInput').value.trim().length > 0;
        document.getElementById('processInput').disabled = !hasInput;
    }, 300));

    // Command preview toggle
    document.getElementById('toggleCommandPreview')?.addEventListener('click', () => {
        const preview = document.getElementById('commandPreviewSection');
        if (preview) {
            preview.style.display = preview.style.display === 'none' ? 'block' : 'none';
        }
    });
});