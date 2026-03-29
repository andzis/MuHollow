const { ipcRenderer } = require('electron');

// Expose ipcRenderer globally for other scripts
window.ipcRenderer = ipcRenderer;

class MuDMG {
    constructor() {
        this.config = {};
        this.isUpdating = false;
        this.isReadyToPlay = false;
        this.connectedAccounts = 0;
        this.maxAccounts = 3;
        this.accountCheckInterval = null;
        this.init();
    }

    async init() {
        // Safety: always hide loader after max 3 seconds no matter what
        setTimeout(() => { this.hideMainLoader(); }, 3000);

        try {
            this.showMainLoader();
            console.log('[Launcher] Starting init...');

            await this.loadConfig();
            console.log('[Launcher] Config loaded');

            this.initUI();
            console.log('[Launcher] UI initialized');

            this.setupEventListeners();
            console.log('[Launcher] Event listeners set');

            this.initParticles();
            console.log('[Launcher] Particles initialized');

            this.initSidebar();
            console.log('[Launcher] Sidebar initialized');

            this.handleUpdateProgress({
                type: 'ready',
                message: 'Initializing launcher...'
            });

            setTimeout(() => {
                this.hideMainLoader();
            }, 1500);

            setTimeout(() => {
                this.checkForUpdates();
            }, 2500);

            this.startAccountMonitoring();

            ipcRenderer.on('game-data-state', (event, stateData) => {
                this.handleGameDataStateChange(stateData);
            });

            console.log('[Launcher] Init complete');
        } catch (error) {
            console.error('[Launcher] Failed to initialize:', error);
            this.hideMainLoader();
            this.showNotification('Failed to initialize: ' + error.message, 'error');
        }
    }

    showMainLoader() {
        const mainLoader = document.getElementById('mainLoader');
        if (mainLoader) {
            mainLoader.style.display = 'flex';
        }
    }

    hideMainLoader() {
        const mainLoader = document.getElementById('mainLoader');
        if (mainLoader) {
            mainLoader.classList.add('hidden');
            setTimeout(() => {
                mainLoader.style.display = 'none';
            }, 500);
        }
    }

    async loadConfig() {
        try {
            this.config = await ipcRenderer.invoke('get-config');
        } catch (error) {
            console.error('Failed to load configuration:', error);
            this.config = { gamePath: '' };
        }
    }

    initUI() {
        this.updateUIFromConfig();
    }

    updateUIFromConfig() {
        const gamePathInput = document.getElementById('gamePath');
        const serverUrlInput = document.getElementById('serverUrl');
        if (gamePathInput) gamePathInput.value = this.config.gamePath || '';
        if (serverUrlInput) serverUrlInput.value = this.config.serverUrl || '';
        this.toggleCredentialsFields();
    }

    // ===== PARTICLE SYSTEM =====
    initParticles() {
        const canvas = document.getElementById('particleCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        canvas.width = 1280;
        canvas.height = 720;

        const particles = [];
        const PARTICLE_COUNT = 40;

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                radius: Math.random() * 2 + 0.5,
                speedX: (Math.random() - 0.5) * 0.3,
                speedY: -Math.random() * 0.5 - 0.1,
                opacity: Math.random() * 0.5 + 0.1,
                hue: Math.random() > 0.5 ? 30 : 42 // warm gold embers
            });
        }

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            particles.forEach(p => {
                p.x += p.speedX;
                p.y += p.speedY;

                // Reset particle when it goes off screen
                if (p.y < -10) {
                    p.y = canvas.height + 10;
                    p.x = Math.random() * canvas.width;
                }
                if (p.x < -10) p.x = canvas.width + 10;
                if (p.x > canvas.width + 10) p.x = -10;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${p.hue}, 70%, 60%, ${p.opacity})`;
                ctx.fill();

                // Subtle glow
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius * 3, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${p.hue}, 70%, 60%, ${p.opacity * 0.15})`;
                ctx.fill();
            });

            requestAnimationFrame(animate);
        };

        animate();
    }

    // ===== SIDEBAR =====
    initSidebar() {
        const sidebarBtns = document.querySelectorAll('.sidebar-btn');
        sidebarBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                sidebarBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    setupEventListeners() {
        // Title bar buttons
        document.getElementById('minimizeBtn').addEventListener('click', () => {
            ipcRenderer.invoke('minimize-to-tray');
        });

        document.getElementById('closeBtn').addEventListener('click', () => {
            ipcRenderer.invoke('close-app');
        });

        // Settings button
        document.getElementById('settingsBtn').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.openSettings();
        });

        // Play button
        document.getElementById('playBtn').addEventListener('click', () => {
            this.launchGame();
        });

        // Listen for update progress
        ipcRenderer.on('update-progress', (event, progress) => {
            this.handleUpdateProgress(progress);
        });

        // Listen for external URL requests
        document.addEventListener('click', (e) => {
            if (e.target.tagName === 'A' && e.target.href) {
                e.preventDefault();
                ipcRenderer.invoke('open-external-url', e.target.href);
            }
        });

        // Listen for tray launch game request
        ipcRenderer.on('launch-game-from-tray', () => {
            this.launchGame();
        });

        // Listen for data installation progress
        ipcRenderer.on('data-installation-progress', (event, progress) => {
            this.handleDataInstallationProgress(progress);
        });
    }

    async checkForUpdates() {
        try {
            const gameDataState = await ipcRenderer.invoke('get-game-data-state');

            if (!gameDataState.success) {
                console.error('Failed to get game data state:', gameDataState.error);
                return;
            }

            const state = gameDataState.state;

            if (state.isInstalling) {
                console.log('Game data is being installed, waiting...');
                this.handleUpdateProgress({
                    type: 'waiting',
                    message: 'Waiting for client download...'
                });
                setTimeout(() => { this.checkForUpdates(); }, 5000);
                return;
            }

            if (!state.isInstalled) {
                console.log('Game data not installed, cannot check for updates');
                this.handleUpdateProgress({
                    type: 'waiting',
                    message: 'Waiting for game data installation...'
                });
                setTimeout(() => { this.checkForUpdates(); }, 5000);
                return;
            }

            console.log('Game data ready, checking for updates...');
            this.handleUpdateProgress({
                type: 'check',
                message: 'Checking for updates...'
            });

            const gameDirResult = await ipcRenderer.invoke('get-game-directory');
            const gamePath = gameDirResult.success ? gameDirResult.gamePath : (this.config.gamePath || process.cwd());

            const result = await ipcRenderer.invoke('check-updates', {
                gamePath: gamePath,
                serverUrl: URL_CONFIG.UPDATE_URL
            });

            if (result.success) {
                if (result.filesNeedingUpdate > 0) {
                    this.showNotification(`${result.filesNeedingUpdate} files need to be updated`, 'warning');
                    this.handleUpdateProgress({
                        type: 'ready',
                        message: `${result.filesNeedingUpdate} files need update - Starting download...`
                    });
                    this.startUpdate();
                } else {
                    this.handleUpdateProgress({
                        type: 'ready',
                        message: 'Game is up to date - Ready to play!'
                    });
                    this.enablePlayButton();
                }
            } else {
                this.showNotification('Failed to check for updates', 'error');
                this.handleUpdateProgress({
                    type: 'ready',
                    message: 'Failed to check updates - Please try again'
                });
            }
        } catch (error) {
            console.error('Update check failed:', error);
            this.showNotification('Update check failed', 'error');
            this.handleUpdateProgress({
                type: 'ready',
                message: 'Update check failed - Please try again'
            });
        }
    }

    // Account monitoring
    startAccountMonitoring() {
        this.checkConnectedAccounts();
        this.accountCheckInterval = setInterval(() => {
            this.checkConnectedAccounts();
        }, 3000);
    }

    async checkConnectedAccounts() {
        try {
            const result = await ipcRenderer.invoke('get-connected-accounts');
            this.connectedAccounts = result.count || 0;
            this.updateAccountCounter();
            this.updatePlayButtonState();
        } catch (error) {
            console.error('Error checking connected accounts:', error);
        }
    }

    updateAccountCounter() {
        const counterElement = document.getElementById('connectedAccounts');
        const counterContainer = document.getElementById('accountCounter');

        if (counterElement) {
            counterElement.textContent = this.connectedAccounts;
        }

        if (counterContainer) {
            if (this.connectedAccounts >= this.maxAccounts) {
                counterContainer.classList.add('limit-reached');
            } else {
                counterContainer.classList.remove('limit-reached');
            }
        }
    }

    updatePlayButtonState() {
        const playBtn = document.getElementById('playBtn');
        if (playBtn) {
            if (this.connectedAccounts >= this.maxAccounts) {
                playBtn.disabled = true;
                playBtn.title = `Limit of ${this.maxAccounts} accounts reached`;
            } else if (this.isReadyToPlay) {
                playBtn.disabled = false;
                playBtn.title = 'Play Game';
            }
        }
    }

    stopAccountMonitoring() {
        if (this.accountCheckInterval) {
            clearInterval(this.accountCheckInterval);
            this.accountCheckInterval = null;
        }
    }

    async startUpdate() {
        if (this.isUpdating) return;

        this.isUpdating = true;
        this.disablePlayButton();

        this.handleUpdateProgress({
            type: 'ready',
            message: 'Starting update process...'
        });

        try {
            const gameDirResult = await ipcRenderer.invoke('get-game-directory');
            const gamePath = gameDirResult.success ? gameDirResult.gamePath : (this.config.gamePath || process.cwd());

            const result = await ipcRenderer.invoke('perform-update', {
                gamePath: gamePath,
                serverUrl: URL_CONFIG.UPDATE_URL
            });

            if (result.success) {
                this.showNotification('Update completed successfully', 'success');
                this.handleUpdateProgress({
                    type: 'ready',
                    message: 'Update completed successfully - Ready to play!'
                });
                this.enablePlayButton();
            } else {
                this.showNotification(`Update failed: ${result.error}`, 'error');
                this.handleUpdateProgress({
                    type: 'ready',
                    message: `Update failed: ${result.error} - Please try again`
                });
            }
        } catch (error) {
            console.error('Update failed:', error);
            this.showNotification('Update failed', 'error');
            this.handleUpdateProgress({
                type: 'ready',
                message: 'Update failed - Please try again'
            });
        } finally {
            this.isUpdating = false;
        }
    }

    handleGameDataStateChange(stateData) {
        switch (stateData.type) {
            case 'installing':
                this.handleUpdateProgress({
                    type: 'waiting',
                    message: stateData.message || 'Waiting for client download...'
                });
                break;
            case 'ready-for-update':
                this.handleUpdateProgress({
                    type: 'ready',
                    message: stateData.message || 'Game data ready - checking updates...'
                });
                setTimeout(() => { this.checkForUpdates(); }, 1000);
                break;
            case 'error':
                this.handleUpdateProgress({
                    type: 'error',
                    message: stateData.message || 'Data installation error'
                });
                break;
        }
    }

    handleUpdateProgress(progress) {
        const downloadProgressFooter = document.getElementById('downloadProgressFooter');
        const downloadTextFooter = document.getElementById('downloadTextFooter');
        const overallProgressFooter = document.getElementById('overallProgressFooter');
        const overallTextFooter = document.getElementById('overallTextFooter');
        const currentFileInfo = document.getElementById('currentFileInfo');
        const statusText = document.getElementById('statusText');

        if (!statusText) return;

        switch (progress.type) {
            case 'manifest':
                statusText.textContent = 'Downloading update manifest...';
                if (downloadProgressFooter) downloadProgressFooter.style.width = '0%';
                if (downloadTextFooter) downloadTextFooter.textContent = '0%';
                if (overallProgressFooter) overallProgressFooter.style.width = '0%';
                if (overallTextFooter) overallTextFooter.textContent = '0%';
                break;
            case 'check':
                statusText.textContent = 'Checking for updates...';
                if (downloadProgressFooter) downloadProgressFooter.style.width = '0%';
                if (downloadTextFooter) downloadTextFooter.textContent = '0%';
                if (overallProgressFooter) overallProgressFooter.style.width = '0%';
                if (overallTextFooter) overallTextFooter.textContent = '0%';
                break;
            case 'download':
                statusText.textContent = `Downloading ${progress.current} of ${progress.total} files`;
                if (progress.total && progress.total > 0) {
                    const overallPercent = Math.round((progress.current / progress.total) * 100);
                    if (overallProgressFooter) overallProgressFooter.style.width = `${overallPercent}%`;
                    if (overallTextFooter) overallTextFooter.textContent = `${overallPercent}%`;
                } else {
                    if (overallProgressFooter) overallProgressFooter.style.width = '0%';
                    if (overallTextFooter) overallTextFooter.textContent = '0%';
                }
                break;
            case 'download-progress':
                if (downloadProgressFooter) downloadProgressFooter.style.width = `${progress.progress}%`;
                if (downloadTextFooter) downloadTextFooter.textContent = `${progress.progress}%`;
                statusText.textContent = `Downloading: ${progress.file || 'file'}`;
                break;
            case 'verify':
                statusText.textContent = 'Verifying downloaded files...';
                break;
            case 'ready':
                statusText.textContent = progress.message || 'Ready to play';
                if (downloadProgressFooter) downloadProgressFooter.style.width = '100%';
                if (downloadTextFooter) downloadTextFooter.textContent = '100%';
                if (overallProgressFooter) overallProgressFooter.style.width = '100%';
                if (overallTextFooter) overallTextFooter.textContent = '100%';
                break;
        }
    }

    async launchGame() {
        try {
            const result = await ipcRenderer.invoke('launch-game');
            if (result.success) {
                this.showNotification('Launching game...', 'success');
            } else {
                this.showNotification(`Failed to launch game: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Exception during game launch:', error);
            this.showNotification('Failed to launch game', 'error');
        }
    }

    async openSettings() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            this.resetSettingsModal();
            await this.loadConfig();

            if (window.settingsManager && window.settingsManager.loadSettingsToForm) {
                await window.settingsManager.loadSettingsToForm(this.config);
            }

            setTimeout(() => {
                modal.classList.add('show');
                setTimeout(() => {
                    if (!modal.classList.contains('show')) {
                        modal.classList.add('show');
                    }
                }, 100);
            }, 50);
        }
    }

    resetSettingsModal() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.className = 'modal';
            modal.style.display = '';
            modal.style.visibility = '';
            modal.style.opacity = '';
        }
    }

    closeSettings() {
        if (window.settingsManager && window.settingsManager.closeSettings) {
            window.settingsManager.closeSettings();
        } else {
            const modal = document.getElementById('settingsModal');
            if (modal) modal.classList.remove('show');
        }
    }

    enablePlayButton() {
        this.isReadyToPlay = true;
        const playBtn = document.getElementById('playBtn');
        if (playBtn) playBtn.disabled = false;
    }

    disablePlayButton() {
        const playBtn = document.getElementById('playBtn');
        if (playBtn) playBtn.disabled = true;
    }

    toggleCredentialsFields() {}

    showNotification(message, type = 'info') {
        const container = document.getElementById('notificationContainer');
        if (!container) return;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        container.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }

    showNoExtractorError() {
        const container = document.getElementById('notificationContainer');
        if (!container) return;

        // Remove qualquer alerta anterior do mesmo tipo
        const existing = container.querySelector('.notification-extractor-error');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = 'notification error notification-extractor-error';
        notification.style.cssText = 'display:flex; flex-direction:column; gap:8px; max-width:360px;';
        notification.innerHTML = `
            <strong>⚠ Ferramenta de extração não encontrada</strong>
            <span>Para instalar o cliente do jogo é necessário ter o <b>7-Zip</b> ou <b>WinRAR</b> instalado.</span>
            <div style="display:flex; gap:8px; margin-top:4px;">
                <button onclick="ipcRenderer.invoke('open-external-url','https://www.7-zip.org/download.html')"
                    style="flex:1; padding:6px; background:#c0392b; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px;">
                    Baixar 7-Zip
                </button>
                <button onclick="this.closest('.notification-extractor-error').remove()"
                    style="padding:6px 10px; background:rgba(255,255,255,0.15); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px;">
                    ✕
                </button>
            </div>
        `;
        container.appendChild(notification);
    }

    handleDataInstallationProgress(progress) {
        switch (progress.type) {
            case 'start':
            case 'download-start':
                this.showDataInstallationModal();
                this.updateDataInstallationModal(progress);
                break;
            case 'download-progress':
                if (!document.getElementById('dataInstallationModal').classList.contains('show')) {
                    this.showDataInstallationModal();
                }
                this.updateDataInstallationModal(progress);
                break;
            case 'download-complete':
            case 'extract-start':
                this.updateDataInstallationModal(progress);
                break;
            case 'extract-progress':
                this.updateDataInstallationModal(progress);
                break;
            case 'extract-complete':
            case 'installation-complete':
            case 'success':
                this.updateDataInstallationModal(progress);
                setTimeout(() => {
                    this.hideDataInstallationModal();
                    this.showNotification(progress.message, 'success');
                }, 2000);
                this.enablePlayButton();
                break;
            case 'data-exists':
                this.handleUpdateProgress({
                    type: 'ready',
                    message: progress.message
                });
                this.enablePlayButton();
                break;
            case 'installation-error':
            case 'error':
                this.updateDataInstallationModal(progress);
                setTimeout(() => {
                    this.hideDataInstallationModal();
                    if (progress.message && progress.message.includes('7-Zip')) {
                        this.showNoExtractorError();
                    } else {
                        this.showNotification(progress.message, 'error');
                    }
                }, 3000);
                break;
        }
    }

    showDataInstallationModal() {
        const modal = document.getElementById('dataInstallationModal');
        if (modal) modal.classList.add('show');
    }

    hideDataInstallationModal() {
        const modal = document.getElementById('dataInstallationModal');
        if (modal) modal.classList.remove('show');
    }

    updateDataInstallationModal(progress) {
        const currentStatus = document.getElementById('currentStatusText');
        if (currentStatus) {
            currentStatus.textContent = progress.message || 'Processing...';
        }

        const downloadSection = document.getElementById('downloadProgressSection');
        if (downloadSection) {
            const downloadPercentage = document.getElementById('downloadProgressPercentage');
            const downloadFill = document.getElementById('downloadProgressFill');
            const downloadSpeed = document.getElementById('downloadSpeed');

            if (progress.type === 'download-progress' || progress.type === 'download-start') {
                if (downloadPercentage) downloadPercentage.textContent = `${progress.progress || 0}%`;
                if (downloadFill) downloadFill.style.width = `${progress.progress || 0}%`;
                if (downloadSpeed && progress.speed !== undefined) {
                    downloadSpeed.textContent = `${progress.speed.toFixed(1)} MB/s`;
                }
            }
        }

        this.updateOverallProgress(progress);
    }

    updateOverallProgress(progress) {
        const overallPercentage = document.getElementById('overallProgressPercentage');
        const overallFill = document.getElementById('overallProgressFill');

        let overallProgress = 0;

        switch (progress.type) {
            case 'download-start': overallProgress = 10; break;
            case 'download-progress': overallProgress = 10 + (progress.progress * 0.4); break;
            case 'download-complete':
            case 'extract-start': overallProgress = 50; break;
            case 'extract-progress': overallProgress = 50 + (progress.progress * 0.4); break;
            case 'extract-complete':
            case 'installation-complete':
            case 'success': overallProgress = 100; break;
            case 'error':
            case 'installation-error': overallProgress = 0; break;
        }

        if (overallPercentage) overallPercentage.textContent = `${Math.round(overallProgress)}%`;
        if (overallFill) overallFill.style.width = `${overallProgress}%`;
    }

    cleanup() {
        this.stopAccountMonitoring();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.muDMG = new MuDMG();
});

window.addEventListener('beforeunload', () => {
    if (window.muDMG) {
        window.muDMG.cleanup();
    }
});

module.exports = MuDMG;
