const { ipcRenderer } = require('electron');

// Expose ipcRenderer globally for other scripts
window.ipcRenderer = ipcRenderer;

class MuDMG {
    constructor() {
        this.config = {};
        this.isUpdating = false;
        this.isReadyToPlay = false;
        this.onlinePlayers = 0;
        this.maxPlayers = 500;
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

            this.setupInstallLocationModal();
            console.log('[Launcher] Install location modal ready');

            this.initSidebar();
            console.log('[Launcher] Sidebar initialized');

            this.handleUpdateProgress({
                type: 'ready',
                message: 'Inicializando launcher...'
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
            this.showNotification('Falha ao inicializar: ' + error.message, 'error');
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
                hue: Math.random() > 0.5 ? 195 : 210 // ice blue frozen shards
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
                ctx.fillStyle = `hsla(${p.hue}, 85%, 70%, ${p.opacity})`;
                ctx.fill();

                // Subtle glow
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius * 3, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${p.hue}, 85%, 70%, ${p.opacity * 0.18})`;
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

            if (state.needsInstallPath) {
                this.setPlayButtonText('INSTALAR');
                this.showInstallLocationModal();
                return;
            }

            if (state.isInstalling) {
                this.handleUpdateProgress({
                    type: 'waiting',
                    message: 'Baixando cliente do jogo...'
                });
                setTimeout(() => { this.checkForUpdates(); }, 5000);
                return;
            }

            if (!state.isInstalled) {
                this.handleUpdateProgress({
                    type: 'waiting',
                    message: 'Aguardando instalação...'
                });
                setTimeout(() => { this.checkForUpdates(); }, 5000);
                return;
            }

            console.log('Game data ready, checking for updates...');
            this.setPlayButtonText('VERIFICANDO...');
            this.handleUpdateProgress({
                type: 'check',
                message: 'Verificando atualizações...'
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
                        message: 'Jogo atualizado - Pronto para jogar!'
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
            this.showNotification('Falha na verificação de atualização', 'error');
            this.handleUpdateProgress({
                type: 'ready',
                message: 'Falha na verificação - Tente novamente'
            });
        }
    }

    // Monitoramento de jogadores online no servidor
    startAccountMonitoring() {
        this.fetchOnlinePlayers();
        this.accountCheckInterval = setInterval(() => {
            this.fetchOnlinePlayers();
        }, 30000); // atualiza a cada 30 segundos
    }

    async fetchOnlinePlayers() {
        try {
            const response = await fetch('http://muhollow.com.br/api/online.php', { cache: 'no-cache' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            this.onlinePlayers = data.online || 0;
            this.maxPlayers = data.max || 500;
            this.updateAccountCounter();
            this.updatePlayButtonState();
        } catch (error) {
            console.error('Erro ao buscar jogadores online:', error);
        }
    }

    updateAccountCounter() {
        const counterElement = document.getElementById('connectedAccounts');
        const counterLimit = document.getElementById('counterLimit');
        const counterContainer = document.getElementById('accountCounter');

        if (counterElement) {
            counterElement.textContent = this.onlinePlayers;
        }
        if (counterLimit) {
            counterLimit.textContent = this.maxPlayers;
        }
        if (counterContainer) {
            counterContainer.classList.remove('limit-reached');
        }
    }

    updatePlayButtonState() {
        const playBtn = document.getElementById('playBtn');
        if (playBtn && this.isReadyToPlay) {
            playBtn.disabled = false;
            playBtn.title = 'Jogar';
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
        this.setPlayButtonText('ATUALIZANDO...');

        this.handleUpdateProgress({
            type: 'ready',
            message: 'Iniciando atualização...'
        });

        try {
            const gameDirResult = await ipcRenderer.invoke('get-game-directory');
            const gamePath = gameDirResult.success ? gameDirResult.gamePath : (this.config.gamePath || process.cwd());

            const result = await ipcRenderer.invoke('perform-update', {
                gamePath: gamePath,
                serverUrl: URL_CONFIG.UPDATE_URL
            });

            if (result.success) {
                this.showNotification('Atualização concluída com sucesso', 'success');
                this.handleUpdateProgress({
                    type: 'ready',
                    message: 'Atualização concluída - Pronto para jogar!'
                });
                this.enablePlayButton();
            } else {
                this.showNotification(`Falha na atualização: ${result.error}`, 'error');
                this.handleUpdateProgress({
                    type: 'ready',
                    message: `Falha na atualização: ${result.error} - Tente novamente`
                });
            }
        } catch (error) {
            console.error('Update failed:', error);
            this.showNotification('Falha na atualização', 'error');
            this.handleUpdateProgress({
                type: 'ready',
                message: 'Falha na atualização - Tente novamente'
            });
        } finally {
            this.isUpdating = false;
        }
    }

    handleGameDataStateChange(stateData) {
        switch (stateData.type) {
            case 'installing':
                this.setPlayButtonText('BAIXANDO...');
                this.handleUpdateProgress({
                    type: 'waiting',
                    message: stateData.message || 'Baixando cliente do jogo...'
                });
                break;
            case 'ready-for-update':
                this.setPlayButtonText('VERIFICANDO...');
                this.handleUpdateProgress({
                    type: 'ready',
                    message: stateData.message || 'Verificando atualizações...'
                });
                setTimeout(() => { this.checkForUpdates(); }, 1000);
                break;
            case 'error':
                this.setPlayButtonText('ERRO');
                this.handleUpdateProgress({
                    type: 'error',
                    message: stateData.message || 'Erro na instalação'
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
                statusText.textContent = 'Baixando manifesto de atualização...';
                if (downloadProgressFooter) downloadProgressFooter.style.width = '0%';
                if (downloadTextFooter) downloadTextFooter.textContent = '0%';
                if (overallProgressFooter) overallProgressFooter.style.width = '0%';
                if (overallTextFooter) overallTextFooter.textContent = '0%';
                break;
            case 'check':
                statusText.textContent = 'Verificando atualizações...';
                if (downloadProgressFooter) downloadProgressFooter.style.width = '0%';
                if (downloadTextFooter) downloadTextFooter.textContent = '0%';
                if (overallProgressFooter) overallProgressFooter.style.width = '0%';
                if (overallTextFooter) overallTextFooter.textContent = '0%';
                break;
            case 'download':
                statusText.textContent = `Baixando ${progress.current} de ${progress.total} arquivos`;
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
                statusText.textContent = `Baixando: ${progress.file || 'arquivo'}`;
                break;
            case 'verify':
                statusText.textContent = 'Verificando arquivos baixados...';
                break;
            case 'ready':
                statusText.textContent = progress.message || 'Pronto para jogar';
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
                this.showNotification('Iniciando jogo...', 'success');
            } else {
                this.showNotification(`Erro ao iniciar o jogo: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Erro ao iniciar o jogo:', error);
            this.showNotification('Erro ao iniciar o jogo', 'error');
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

    setPlayButtonText(text) {
        const playBtn = document.getElementById('playBtn');
        if (playBtn) {
            const btnText = playBtn.querySelector('.play-btn-text');
            if (btnText) btnText.textContent = text;
            else playBtn.textContent = text;
        }
    }

    enablePlayButton() {
        this.isReadyToPlay = true;
        const playBtn = document.getElementById('playBtn');
        if (playBtn) playBtn.disabled = false;
        this.setPlayButtonText('JOGAR');
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
                this.setPlayButtonText('BAIXANDO...');
                this.showDataInstallationModal();
                this.updateDataInstallationModal(progress);
                break;
            case 'download-progress':
                if (!document.getElementById('dataInstallationModal').classList.contains('show')) {
                    this.showDataInstallationModal();
                }
                this.setPlayButtonText(`BAIXANDO ${progress.progress || 0}%`);
                this.updateDataInstallationModal(progress);
                break;
            case 'download-complete':
            case 'extract-start':
                this.setPlayButtonText('EXTRAINDO...');
                this.updateDataInstallationModal(progress);
                break;
            case 'extract-progress':
                this.setPlayButtonText(`EXTRAINDO ${progress.progress || 0}%`);
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
                this.setPlayButtonText('VERIFICANDO...');
                this.handleUpdateProgress({
                    type: 'ready',
                    message: progress.message
                });
                this.enablePlayButton();
                break;
            case 'installation-error':
            case 'error':
                this.setPlayButtonText('ERRO');
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

    // ===== INSTALL LOCATION MODAL =====
    showInstallLocationModal() {
        const modal = document.getElementById('installLocationModal');
        if (modal) modal.classList.add('show');
    }

    hideInstallLocationModal() {
        const modal = document.getElementById('installLocationModal');
        if (modal) modal.classList.remove('show');
    }

    setupInstallLocationModal() {
        const browseBtn = document.getElementById('browseInstallBtn');
        const confirmBtn = document.getElementById('confirmInstallBtn');
        const pathInput = document.getElementById('installPathInput');
        const hint = document.getElementById('installPathHint');

        if (!browseBtn || !confirmBtn || !pathInput) return;

        browseBtn.addEventListener('click', async () => {
            const result = await ipcRenderer.invoke('select-install-folder');
            if (result.success) {
                pathInput.value = result.path;
                hint.textContent = result.path;
                hint.style.color = '#6dbf6d';
                confirmBtn.disabled = false;
            }
        });

        confirmBtn.addEventListener('click', async () => {
            const installPath = pathInput.value;
            if (!installPath) return;

            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Iniciando...';

            await ipcRenderer.invoke('set-install-path', installPath);
            this.hideInstallLocationModal();
            await ipcRenderer.invoke('install-game-data');
        });
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
