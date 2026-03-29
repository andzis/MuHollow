/**
 * MuHollow Launcher - Real-time Rankings
 * Fetches top resets from the server API and renders the leaderboard.
 */

const RANKING_API_URL = 'http://muhollow.com.br/api/ranking';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // refresh every 5 minutes

function getClassAvatarPath(classAbbr) {
    return `assets/classes/${classAbbr}.jpg`;
}

function buildLeaderboardRow(player, rankClass) {
    const row = document.createElement('div');
    row.className = `leaderboard-row${rankClass ? ' ' + rankClass : ''}`;

    const imgSrc = getClassAvatarPath(player.class);

    row.innerHTML = `
        <span class="rank-number">#${player.rank}</span>
        <div class="player-avatar">
            <img src="${imgSrc}" alt="${player.class}" class="class-avatar-img"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='inline';">
            <i class="fas fa-user" style="display:none;"></i>
        </div>
        <span class="player-name">${escapeHtml(player.name)}</span>
        <span class="player-kills">${player.resets.toLocaleString()}</span>
    `;

    return row;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getRankClass(rank) {
    if (rank === 1) return 'rank-1';
    if (rank === 2) return 'rank-2';
    if (rank === 3) return 'rank-3';
    return '';
}

async function loadRanking() {
    const list = document.querySelector('.leaderboard-list');
    if (!list) return;

    try {
        const response = await fetch(RANKING_API_URL, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        if (!data.players || !Array.isArray(data.players)) throw new Error('Invalid data');

        list.innerHTML = '';

        if (data.players.length === 0) {
            list.innerHTML = '<div class="leaderboard-row" style="justify-content:center;color:#666;">No data available</div>';
            return;
        }

        data.players.forEach(player => {
            list.appendChild(buildLeaderboardRow(player, getRankClass(player.rank)));
        });

    } catch (err) {
        console.warn('[Ranking] Failed to load ranking data:', err.message);
        // Keep existing content on failure; don't blank out the list
    }
}

// Initial load + periodic refresh
document.addEventListener('DOMContentLoaded', () => {
    loadRanking();
    setInterval(loadRanking, REFRESH_INTERVAL_MS);
});
