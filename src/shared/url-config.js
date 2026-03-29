/**
 * Configuracao Centralizada de URLs - MU Online Launcher
 *
 * Altere apenas este arquivo para mudar os endpoints do launcher.
 */

const URL_CONFIG = {
  // ===== SERVIDOR PRINCIPAL =====
  BASE_URL: 'http://muhollow.com.br/',

  // ===== CONFIGURACAO DO JOGO (apenas desenvolvedor) =====
  // Nome do executavel do jogo (ex: main.exe).
  GAME_EXECUTABLE: 'main.exe',

  // ===== ENDPOINTS DO LAUNCHER =====
  LAUNCHER: {
    MAIN: '/launcher',
    NEWS: '/noticias',
    RANKING: '/ranking',
    UPDATE: '/updates'
  },

  // ===== DOWNLOAD DO CLIENTE COMPLETO =====
  GITHUB_DOWNLOAD: 'https://github.com/yourrepo/download/Client.zip',

  // ===== CDN EXTERNOS =====
  CDN: {
    FONT_AWESOME: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
  },

  // ===== URLS COMPLETAS =====
  buildUrl(base, endpoint) {
    const safeBase = String(base || '').replace(/\/+$/, '');
    const safeEndpoint = String(endpoint || '').replace(/^\/+/, '');
    return `${safeBase}/${safeEndpoint}`;
  },

  get LAUNCHER_URL() {
    return this.buildUrl(this.BASE_URL, this.LAUNCHER.MAIN);
  },

  get NEWS_URL() {
    return this.buildUrl(this.BASE_URL, this.LAUNCHER.NEWS);
  },

  get RANKING_URL() {
    return this.buildUrl(this.BASE_URL, this.LAUNCHER.RANKING);
  },

  get UPDATE_URL() {
    return this.buildUrl(this.BASE_URL, this.LAUNCHER.UPDATE);
  },

  // ===== FUNCOES AUXILIARES =====
  getLauncherUrlWithParams(params = {}) {
    const urlParams = new URLSearchParams(params);
    const queryString = urlParams.toString();
    return queryString ? `${this.LAUNCHER_URL}?${queryString}` : this.LAUNCHER_URL;
  },

  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },

  getDomain(url) {
    try {
      return new URL(url).origin;
    } catch {
      return '';
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = URL_CONFIG;
} else if (typeof window !== 'undefined') {
  window.URL_CONFIG = URL_CONFIG;
} else {
  global.URL_CONFIG = URL_CONFIG;
}

if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
  console.log('URL Config loaded:', {
    baseUrl: URL_CONFIG.BASE_URL,
    launcherUrl: URL_CONFIG.LAUNCHER_URL,
    updateUrl: URL_CONFIG.UPDATE_URL
  });
}
