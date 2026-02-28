// background.js — Service Worker for time tracking

import { getToken, startDeviceFlow, pollForToken } from './auth.js';
import { forceSetDayData, getMonthData } from './gist.js';

// ─── Constants ───────────────────────────────────────────────────────
const TICK_ALARM = 'time-tracker-tick';
const SYNC_ALARM = 'time-tracker-sync';
const TICK_INTERVAL_MINUTES = 1;
const SYNC_INTERVAL_MINUTES = 30;
const IDLE_THRESHOLD_SECONDS = 120; // 2 minutes

// ─── State Keys in chrome.storage.local ──────────────────────────────
// 'tracking_today'     → { date: "YYYY-MM-DD", domains: { "domain.com": seconds } }
// 'tracking_active'    → { domain: "example.com", since: timestamp }
// 'last_sync_date'     → "YYYY-MM-DD"

// ─── Helpers ─────────────────────────────────────────────────────────

function getTodayStr() {
  const now = new Date();
  return now.toISOString().split('T')[0]; // "YYYY-MM-DD"
}

function extractDomain(url) {
  try {
    const u = new URL(url);
    // Skip internal Chrome pages
    if (['chrome:', 'chrome-extension:', 'about:', 'devtools:'].includes(u.protocol)) {
      return null;
    }
    return u.hostname;
  } catch {
    return null;
  }
}

/**
 * Get or initialize today's tracking data
 */
async function getTodayData() {
  const today = getTodayStr();
  const data = await chrome.storage.local.get('tracking_today');
  let tracking = data.tracking_today;

  if (!tracking || tracking.date !== today) {
    // Day changed — finalize previous day if exists
    if (tracking && tracking.date && Object.keys(tracking.domains).length > 0) {
      await finalizeDayAndSync(tracking.date, tracking.domains);
    }
    // Start new day
    tracking = { date: today, domains: {} };
    await chrome.storage.local.set({ tracking_today: tracking });
  }

  return tracking;
}

/**
 * Record elapsed time for the active domain
 */
async function flushActiveTime() {
  const data = await chrome.storage.local.get('tracking_active');
  const active = data.tracking_active;

  if (!active || !active.domain || !active.since) return;

  const now = Date.now();
  const elapsedSeconds = Math.round((now - active.since) / 1000);

  if (elapsedSeconds > 0 && elapsedSeconds < 3600) {
    // Cap at 1 hour to prevent runaway from service worker sleep
    const tracking = await getTodayData();
    tracking.domains[active.domain] = (tracking.domains[active.domain] || 0) + elapsedSeconds;
    await chrome.storage.local.set({ tracking_today: tracking });
  }

  // Reset active timer
  await chrome.storage.local.set({
    tracking_active: { domain: active.domain, since: now }
  });
}

/**
 * Set the currently active domain
 */
async function setActiveDomain(domain) {
  // Flush time for previous domain first
  await flushActiveTime();

  if (domain) {
    await chrome.storage.local.set({
      tracking_active: { domain, since: Date.now() }
    });
  } else {
    await chrome.storage.local.remove('tracking_active');
  }
}

/**
 * Detect the currently active tab's domain
 */
async function detectActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab && tab.url) {
      return extractDomain(tab.url);
    }
  } catch {
    // Extension context invalidated etc.
  }
  return null;
}

/**
 * Save a day's data to local monthly storage (same format as Gist)
 * Key: local_monthly_YYYY-MM → { "YYYY-MM-DD": { "domain.com": seconds, ... }, ... }
 */
async function saveToLocalMonthly(dateStr, domains) {
  if (!domains || Object.keys(domains).length === 0) return;
  const month = dateStr.substring(0, 7); // "YYYY-MM"
  const key = `local_monthly_${month}`;
  const data = await chrome.storage.local.get(key);
  const monthly = data[key] || {};
  monthly[dateStr] = domains;
  await chrome.storage.local.set({ [key]: monthly });

  // Track which months have unsynced data
  const unsyncedData = await chrome.storage.local.get('unsynced_months');
  const unsynced = new Set(unsyncedData.unsynced_months || []);
  unsynced.add(month);
  await chrome.storage.local.set({ unsynced_months: [...unsynced] });
}

/**
 * Get local monthly data
 */
async function getLocalMonthlyData(month) {
  const key = `local_monthly_${month}`;
  const data = await chrome.storage.local.get(key);
  return data[key] || null;
}

/**
 * Finalize a day's data — always save locally, sync to Gist if logged in
 */
async function finalizeDayAndSync(dateStr, domains) {
  if (!domains || Object.keys(domains).length === 0) return;

  // Always save locally first
  await saveToLocalMonthly(dateStr, domains);

  // Try to sync if logged in
  const token = await getToken();
  if (token) {
    try {
      await forceSetDayData(dateStr, domains);
      await chrome.storage.local.set({ last_sync_date: dateStr, last_sync_time: Date.now() });
      // Mark this month as synced (remove from unsynced if all days synced)
    } catch (err) {
      console.error('Failed to sync to Gist:', err);
      // Data is safe locally, will retry later
    }
  }
}

/**
 * Sync today's data to Gist
 */
async function syncToday() {
  const tracking = await getTodayData();
  if (Object.keys(tracking.domains).length === 0) return { success: true, message: 'No data to sync' };

  await flushActiveTime();

  const token = await getToken();
  if (!token) {
    // Still save locally even if not logged in
    const freshData = await chrome.storage.local.get('tracking_today');
    await saveToLocalMonthly(freshData.tracking_today.date, freshData.tracking_today.domains);
    return { success: true, message: 'Saved locally (not logged in)' };
  }

  try {
    // Re-read after flush
    const freshData = await chrome.storage.local.get('tracking_today');
    await saveToLocalMonthly(freshData.tracking_today.date, freshData.tracking_today.domains);
    const result = await forceSetDayData(freshData.tracking_today.date, freshData.tracking_today.domains);
    await chrome.storage.local.set({ last_sync_time: Date.now() });

    // Sync all unsynced local months to Gist
    await syncAllLocal();

    return { success: true, message: 'Synced successfully', gistUrl: result.gistUrl };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Sync all local monthly data to Gist (called after login or periodically)
 */
async function syncAllLocal() {
  const unsyncedData = await chrome.storage.local.get('unsynced_months');
  const unsynced = unsyncedData.unsynced_months || [];

  for (const month of unsynced) {
    const monthlyData = await getLocalMonthlyData(month);
    if (!monthlyData) continue;

    for (const [dateStr, domains] of Object.entries(monthlyData)) {
      try {
        await forceSetDayData(dateStr, domains);
      } catch {
        // Will retry next time
        return;
      }
    }
  }

  // Clear unsynced list after successful sync
  await chrome.storage.local.set({ unsynced_months: [] });
  await chrome.storage.local.set({ last_sync_time: Date.now() });
}

// ─── Event Listeners ─────────────────────────────────────────────────

// Tab activated (switched tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    const domain = tab.url ? extractDomain(tab.url) : null;
    await setActiveDomain(domain);
  } catch {
    // Tab might have been closed
  }
});

// Tab URL changed (navigation within a tab)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    // Check if this is the active tab
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (activeTab && activeTab.id === tabId) {
        const domain = extractDomain(changeInfo.url);
        await setActiveDomain(domain);
      }
    } catch {
      // ignore
    }
  }
});

// Window focus changed
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // All windows lost focus — pause tracking
    await flushActiveTime();
    await chrome.storage.local.remove('tracking_active');
  } else {
    // Refocused — detect active tab
    const domain = await detectActiveTab();
    if (domain) {
      await chrome.storage.local.set({
        tracking_active: { domain, since: Date.now() }
      });
    }
  }
});

// Idle state changed
chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === 'idle' || state === 'locked') {
    // User went idle — flush and pause
    await flushActiveTime();
    await chrome.storage.local.remove('tracking_active');
  } else if (state === 'active') {
    // User came back — resume tracking
    const domain = await detectActiveTab();
    if (domain) {
      await chrome.storage.local.set({
        tracking_active: { domain, since: Date.now() }
      });
    }
  }
});

// ─── Alarms ──────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === TICK_ALARM) {
    // Periodic tick — flush active time and check day boundary
    await flushActiveTime();
    await getTodayData(); // This handles day boundary rollover
  }

  if (alarm.name === SYNC_ALARM) {
    // Periodic sync
    await syncToday();
  }
});

// ─── Installation & Startup ─────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  // Set up alarms
  await chrome.alarms.create(TICK_ALARM, { periodInMinutes: TICK_INTERVAL_MINUTES });
  await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_INTERVAL_MINUTES });

  // Set idle threshold
  chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);

  // Initialize tracking
  await getTodayData();
  const domain = await detectActiveTab();
  if (domain) {
    await setActiveDomain(domain);
  }

  console.log('Chrome Time Tracker installed and running');
});

chrome.runtime.onStartup.addListener(async () => {
  // Re-create alarms on browser startup
  await chrome.alarms.create(TICK_ALARM, { periodInMinutes: TICK_INTERVAL_MINUTES });
  await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_INTERVAL_MINUTES });
  chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);

  await getTodayData();
  const domain = await detectActiveTab();
  if (domain) {
    await setActiveDomain(domain);
  }
});

// ─── Message Handler (from popup) ────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_TODAY_DATA') {
    (async () => {
      await flushActiveTime();
      const data = await chrome.storage.local.get(['tracking_today', 'last_sync_time']);
      sendResponse({
        tracking: data.tracking_today || { date: getTodayStr(), domains: {} },
        lastSyncTime: data.last_sync_time || null
      });
    })();
    return true;
  }

  if (message.type === 'SYNC_NOW') {
    (async () => {
      const result = await syncToday();
      sendResponse(result);
    })();
    return true;
  }

  if (message.type === 'GET_STATUS') {
    (async () => {
      const data = await chrome.storage.local.get([
        'tracking_today', 'tracking_active', 'last_sync_time', 'unsynced_months'
      ]);
      sendResponse({
        today: data.tracking_today || { date: getTodayStr(), domains: {} },
        active: data.tracking_active || null,
        lastSyncTime: data.last_sync_time || null,
        unsyncedMonths: data.unsynced_months || []
      });
    })();
    return true;
  }

  if (message.type === 'GET_LOCAL_DATA') {
    (async () => {
      const dateStr = message.date;
      const month = dateStr.substring(0, 7);

      // Try local storage first
      const monthlyData = await getLocalMonthlyData(month);
      if (monthlyData && monthlyData[dateStr]) {
        sendResponse({ domains: monthlyData[dateStr] });
        return;
      }

      // Fall back to Gist if logged in
      const token = await getToken();
      if (token) {
        try {
          const gistData = await getMonthData(month);
          if (gistData && gistData[dateStr]) {
            // Cache it locally for next time
            await saveToLocalMonthly(dateStr, gistData[dateStr]);
            sendResponse({ domains: gistData[dateStr] });
            return;
          }
        } catch {
          // Gist read failed, return null
        }
      }

      sendResponse({ domains: null });
    })();
    return true;
  }

  // ─── Device Flow (runs in background, survives popup close) ────────

  if (message.type === 'START_DEVICE_FLOW') {
    (async () => {
      try {
        const flow = await startDeviceFlow();

        // Store device flow state so popup can recover it
        await chrome.storage.local.set({
          device_flow: {
            userCode: flow.userCode,
            verificationUri: flow.verificationUri,
            deviceCode: flow.deviceCode,
            interval: flow.interval,
            expiresIn: flow.expiresIn,
            startedAt: Date.now(),
            status: 'pending'
          }
        });

        sendResponse({ success: true, flow });

        // Start polling in the background (this continues after popup closes)
        try {
          const result = await pollForToken(
            flow.deviceCode,
            flow.interval,
            flow.expiresIn,
            async (status) => {
              // Update stored status for popup to read
              const data = await chrome.storage.local.get('device_flow');
              if (data.device_flow && data.device_flow.status === 'pending') {
                data.device_flow.statusText = status;
                await chrome.storage.local.set({ device_flow: data.device_flow });
              }
            }
          );

          // Success! Sync all local data to Gist
          try { await syncAllLocal(); } catch { /* will retry */ }

          await chrome.storage.local.set({
            device_flow: { status: 'success', user: result.user }
          });
        } catch (err) {
          // Check if it was cancelled
          const data = await chrome.storage.local.get('device_flow');
          if (data.device_flow && data.device_flow.status === 'cancelled') return;

          await chrome.storage.local.set({
            device_flow: { status: 'error', error: err.message }
          });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === 'GET_DEVICE_FLOW_STATUS') {
    (async () => {
      const data = await chrome.storage.local.get('device_flow');
      sendResponse(data.device_flow || null);
    })();
    return true;
  }

  if (message.type === 'CANCEL_DEVICE_FLOW') {
    (async () => {
      await chrome.storage.local.set({
        device_flow: { status: 'cancelled' }
      });
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.type === 'CLEAR_DEVICE_FLOW') {
    (async () => {
      await chrome.storage.local.remove('device_flow');
      sendResponse({ success: true });
    })();
    return true;
  }
});

