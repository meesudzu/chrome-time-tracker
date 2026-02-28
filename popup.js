// popup.js — Popup UI logic (Device Flow via background service worker)

import { logout, getToken, getUser } from './auth.js';

// ─── Screens ─────────────────────────────────────────────────────

const screenLogin = document.getElementById('screen-login');
const screenDeviceCode = document.getElementById('screen-device-code');
const screenDashboard = document.getElementById('screen-dashboard');
const screenSettings = document.getElementById('screen-settings');

function showScreen(screen) {
  screenLogin.classList.add('hidden');
  screenDeviceCode.classList.add('hidden');
  screenDashboard.classList.add('hidden');
  screenSettings.classList.add('hidden');
  screen.classList.remove('hidden');
}

// ─── State ───────────────────────────────────────────────────────

let viewDate = new Date();
let viewDateStr = formatDateStr(viewDate);
let deviceFlowPollTimer = null;

function formatDateStr(d) {
  return d.toISOString().split('T')[0];
}

function formatTimeShort(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTimeLong(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatDateLabel(dateStr) {
  const today = formatDateStr(new Date());
  const yesterday = formatDateStr(new Date(Date.now() - 86400000));
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeAgo(timestamp) {
  if (!timestamp) return 'Never synced';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Initialize ──────────────────────────────────────────────────

async function init() {
  const token = await getToken();
  const user = await getUser();

  // Check if there's an active device flow
  chrome.runtime.sendMessage({ type: 'GET_DEVICE_FLOW_STATUS' }, (flowState) => {
    if (flowState && flowState.status === 'pending') {
      showDeviceCodeScreen(flowState.userCode, flowState.verificationUri);
      startPollingFlowStatus();
      return;
    }
    if (flowState && flowState.status === 'success') {
      chrome.runtime.sendMessage({ type: 'CLEAR_DEVICE_FLOW' }, async () => {
        const freshUser = await getUser();
        showDashboard(freshUser);
      });
      return;
    }
    if (flowState && flowState.status === 'error') {
      chrome.runtime.sendMessage({ type: 'CLEAR_DEVICE_FLOW' });
    }

    // Always show dashboard — works with or without login
    showDashboard(user);
  });

  setupEventListeners();
}

// ─── Device Code Screen ─────────────────────────────────────────

function showDeviceCodeScreen(userCode, verificationUri) {
  showScreen(screenDeviceCode);
  document.getElementById('device-code-value').textContent = userCode;
  document.getElementById('device-verify-link').href = verificationUri || 'https://github.com/login/device';
  document.getElementById('polling-text').textContent = 'Waiting for authorization...';
}

/**
 * Poll the background for device flow status updates
 */
function startPollingFlowStatus() {
  if (deviceFlowPollTimer) clearInterval(deviceFlowPollTimer);

  deviceFlowPollTimer = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'GET_DEVICE_FLOW_STATUS' }, async (flowState) => {
      if (!flowState) {
        stopPollingFlowStatus();
        showScreen(screenLogin);
        return;
      }

      if (flowState.status === 'success') {
        stopPollingFlowStatus();
        chrome.runtime.sendMessage({ type: 'CLEAR_DEVICE_FLOW' }, async () => {
          const user = await getUser();
          if (user) showDashboard(user);
          else showScreen(screenLogin);
        });
      } else if (flowState.status === 'error') {
        stopPollingFlowStatus();
        chrome.runtime.sendMessage({ type: 'CLEAR_DEVICE_FLOW' });
        showScreen(screenLogin);
        const errorEl = document.getElementById('login-error');
        errorEl.textContent = flowState.error || 'Login failed. Try again.';
        errorEl.classList.remove('hidden');
      } else if (flowState.status === 'cancelled') {
        stopPollingFlowStatus();
        showScreen(screenLogin);
      } else if (flowState.status === 'pending') {
        document.getElementById('polling-text').textContent =
          flowState.statusText || 'Waiting for authorization...';
      }
    });
  }, 2000); // Check every 2 seconds
}

function stopPollingFlowStatus() {
  if (deviceFlowPollTimer) {
    clearInterval(deviceFlowPollTimer);
    deviceFlowPollTimer = null;
  }
}

// ─── Start Login ────────────────────────────────────────────────

function startLogin() {
  const errorEl = document.getElementById('login-error');
  errorEl.classList.add('hidden');

  // Ask background to start device flow
  chrome.runtime.sendMessage({ type: 'START_DEVICE_FLOW' }, (response) => {
    if (response && response.success) {
      showDeviceCodeScreen(response.flow.userCode, response.flow.verificationUri);
      startPollingFlowStatus();
    } else {
      errorEl.textContent = response?.error || 'Failed to start login. Try again.';
      errorEl.classList.remove('hidden');
    }
  });
}

// ─── Dashboard ────────────────────────────────────────────────────

async function showDashboard(user) {
  showScreen(screenDashboard);

  const userAvatar = document.getElementById('user-avatar');
  const userName = document.getElementById('user-name');
  const loginBtn = document.getElementById('btn-logout');

  if (user) {
    userAvatar.src = user.avatar_url;
    userAvatar.style.display = '';
    userName.textContent = user.login;
    loginBtn.textContent = 'Logout';
    loginBtn.onclick = async () => { await logout(); showDashboard(null); };
  } else {
    userAvatar.style.display = 'none';
    userName.textContent = 'Not logged in';
    loginBtn.textContent = 'Login';
    loginBtn.onclick = () => startLogin();
  }

  await loadDayData();
}

async function loadDayData() {
  const today = formatDateStr(new Date());
  document.getElementById('current-date').textContent = formatDateLabel(viewDateStr);
  document.getElementById('btn-next-day').style.visibility = viewDateStr >= today ? 'hidden' : 'visible';

  if (viewDateStr === today) {
    chrome.runtime.sendMessage({ type: 'GET_TODAY_DATA' }, (response) => {
      if (response) {
        renderDomains(response.tracking.domains);
        updateSyncStatus(response.lastSyncTime);
      }
    });
  } else {
    // Load historical data from local storage
    chrome.runtime.sendMessage({ type: 'GET_LOCAL_DATA', date: viewDateStr }, (response) => {
      if (response && response.domains) {
        renderDomains(response.domains);
      } else {
        document.getElementById('total-time').textContent = '—';
        document.getElementById('domain-list').innerHTML = `
          <div class="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            <p>No data for this day.</p>
          </div>
        `;
      }
    });
  }
}

function renderDomains(domains) {
  const domainList = document.getElementById('domain-list');
  const totalTimeEl = document.getElementById('total-time');
  const sorted = Object.entries(domains).sort(([, a], [, b]) => b - a);
  const totalSeconds = sorted.reduce((sum, [, s]) => sum + s, 0);
  totalTimeEl.textContent = formatTimeLong(totalSeconds);

  if (sorted.length === 0) {
    domainList.innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
        <p>No browsing data yet. Start surfing!</p>
      </div>
    `;
    return;
  }

  const maxTime = sorted[0][1];
  domainList.innerHTML = sorted.map(([domain, seconds], index) => {
    const barWidth = Math.max(2, (seconds / maxTime) * 100);
    const rank = index + 1;
    let rankClass = 'rank-other';
    if (rank === 1) rankClass = 'rank-1';
    else if (rank === 2) rankClass = 'rank-2';
    else if (rank === 3) rankClass = 'rank-3';
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

    return `
      <div class="domain-item" style="animation-delay: ${index * 0.05}s">
        <div class="domain-row">
          <span class="domain-name">
            <span class="rank-badge ${rankClass}">${rank}</span>
            <img class="domain-favicon" src="${faviconUrl}" alt="" onerror="this.style.display='none'">
            ${escapeHtml(domain)}
          </span>
          <span class="domain-time">${formatTimeShort(seconds)}</span>
        </div>
        <div class="domain-bar-bg">
          <div class="domain-bar" style="width: ${barWidth}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function updateSyncStatus(lastSyncTime) {
  document.getElementById('sync-status').textContent = `Synced: ${timeAgo(lastSyncTime)}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Event Listeners ─────────────────────────────────────────────

function setupEventListeners() {
  // Login
  document.getElementById('btn-login').addEventListener('click', () => startLogin());

  // Copy device code
  document.getElementById('btn-copy-code').addEventListener('click', async () => {
    const code = document.getElementById('device-code-value').textContent;
    try {
      await navigator.clipboard.writeText(code);
      const btn = document.getElementById('btn-copy-code');
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';
      setTimeout(() => {
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
      }, 2000);
    } catch { /* ignore */ }
  });

  // Cancel login
  document.getElementById('btn-cancel-login').addEventListener('click', () => {
    stopPollingFlowStatus();
    chrome.runtime.sendMessage({ type: 'CANCEL_DEVICE_FLOW' });
    showScreen(screenLogin);
  });

  // Logout is handled dynamically in showDashboard()

  // Settings
  document.getElementById('btn-settings').addEventListener('click', () => showScreen(screenSettings));

  // Back from settings
  document.getElementById('btn-back').addEventListener('click', async () => {
    const user = await getUser();
    showDashboard(user);
  });

  // Sync
  document.getElementById('btn-sync').addEventListener('click', () => {
    const syncBtn = document.getElementById('btn-sync');
    const origHtml = syncBtn.innerHTML;
    syncBtn.innerHTML = '<div class="spinner"></div>';
    syncBtn.disabled = true;

    chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, (response) => {
      syncBtn.disabled = false;
      syncBtn.innerHTML = origHtml;
      if (response && response.success) {
        updateSyncStatus(Date.now());
        if (response.gistUrl) {
          const gistLink = document.getElementById('gist-link');
          gistLink.href = response.gistUrl;
          gistLink.classList.remove('hidden');
        }
      } else {
        const syncStatus = document.getElementById('sync-status');
        syncStatus.textContent = `Sync failed: ${response?.message || 'Unknown error'}`;
        syncStatus.style.color = 'var(--red)';
        setTimeout(() => { syncStatus.style.color = ''; }, 3000);
      }
    });
  });

  // Force sync
  document.getElementById('btn-force-sync').addEventListener('click', () => {
    const statusEl = document.getElementById('force-sync-status');
    statusEl.textContent = 'Syncing...';
    statusEl.style.color = 'var(--accent)';
    statusEl.classList.remove('hidden');

    chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, (response) => {
      if (response && response.success) {
        statusEl.textContent = '✓ Synced successfully';
        statusEl.style.color = 'var(--green)';
      } else {
        statusEl.textContent = `✗ ${response?.message || 'Sync failed'}`;
        statusEl.style.color = 'var(--red)';
      }
    });
  });

  // Date navigation
  document.getElementById('btn-prev-day').addEventListener('click', () => {
    viewDate = new Date(viewDate.getTime() - 86400000);
    viewDateStr = formatDateStr(viewDate);
    loadDayData();
  });

  document.getElementById('btn-next-day').addEventListener('click', () => {
    const today = formatDateStr(new Date());
    if (viewDateStr < today) {
      viewDate = new Date(viewDate.getTime() + 86400000);
      viewDateStr = formatDateStr(viewDate);
      loadDayData();
    }
  });
}

// Auto-refresh every 30s
setInterval(() => {
  const today = formatDateStr(new Date());
  if (viewDateStr === today && !screenDashboard.classList.contains('hidden')) {
    chrome.runtime.sendMessage({ type: 'GET_TODAY_DATA' }, (response) => {
      if (response) {
        renderDomains(response.tracking.domains);
        updateSyncStatus(response.lastSyncTime);
      }
    });
  }
}, 30000);

document.addEventListener('DOMContentLoaded', init);
