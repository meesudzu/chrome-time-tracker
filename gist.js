// gist.js — GitHub Gist sync module

import { getToken } from './auth.js';

const GIST_API_URL = 'https://api.github.com/gists';
const GIST_DESCRIPTION = 'Chrome Time Tracker';

/**
 * Get the filename for a given month
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {string} Filename like "chrome-time-tracker-2026-02.json"
 */
function getMonthlyFilename(dateStr) {
  const month = dateStr.substring(0, 7); // "YYYY-MM"
  return `chrome-time-tracker-${month}.json`;
}

/**
 * Get authenticated headers
 */
async function getHeaders() {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json'
  };
}

/**
 * Find existing Time Tracker gist or return null
 */
async function findGist() {
  // Check cached gist ID first
  const data = await chrome.storage.local.get('gist_id');
  if (data.gist_id) {
    try {
      const headers = await getHeaders();
      const response = await fetch(`${GIST_API_URL}/${data.gist_id}`, { headers });
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Gist not found or invalid, search for it
    }
    // Clear invalid cached ID
    await chrome.storage.local.remove('gist_id');
  }

  // Search through user's gists
  const headers = await getHeaders();
  let page = 1;
  while (page <= 10) {
    const response = await fetch(`${GIST_API_URL}?per_page=100&page=${page}`, { headers });
    if (!response.ok) throw new Error('Failed to fetch gists');

    const gists = await response.json();
    if (gists.length === 0) break;

    const found = gists.find(g => g.description === GIST_DESCRIPTION);
    if (found) {
      await chrome.storage.local.set({ gist_id: found.id });
      return found;
    }
    page++;
  }

  return null;
}

/**
 * Create a new gist
 */
async function createGist(filename, content) {
  const headers = await getHeaders();
  const response = await fetch(GIST_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: {
        [filename]: { content: JSON.stringify(content, null, 2) }
      }
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Failed to create gist: ${err.message || response.statusText}`);
  }

  const gist = await response.json();
  await chrome.storage.local.set({ gist_id: gist.id });
  return gist;
}

/**
 * Update an existing gist
 */
async function updateGist(gistId, filename, content) {
  const headers = await getHeaders();
  const response = await fetch(`${GIST_API_URL}/${gistId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      files: {
        [filename]: { content: JSON.stringify(content, null, 2) }
      }
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Failed to update gist: ${err.message || response.statusText}`);
  }

  return await response.json();
}

/**
 * Get full gist data (with file contents)
 */
async function getFullGist(gistId) {
  const headers = await getHeaders();
  const response = await fetch(`${GIST_API_URL}/${gistId}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch gist');
  return await response.json();
}

/**
 * Sync a day's data to the gist
 * @param {string} dateStr - Date string "YYYY-MM-DD"
 * @param {Object} dayData - { "domain.com": seconds, ... }
 */
export async function syncToGist(dateStr, dayData) {
  const filename = getMonthlyFilename(dateStr);
  let gist = await findGist();

  if (!gist) {
    // Create new gist with this day's data
    const content = { [dateStr]: dayData };
    gist = await createGist(filename, content);
    return { created: true, gistUrl: gist.html_url };
  }

  // Get full gist to read existing file content
  const fullGist = await getFullGist(gist.id);

  let monthlyData = {};

  // If the monthly file already exists, parse its content
  if (fullGist.files[filename]) {
    try {
      monthlyData = JSON.parse(fullGist.files[filename].content);
    } catch {
      monthlyData = {};
    }
  }

  // Merge day data (add to existing if present)
  if (monthlyData[dateStr]) {
    // Merge: add seconds to existing domains
    const existing = monthlyData[dateStr];
    for (const [domain, seconds] of Object.entries(dayData)) {
      existing[domain] = (existing[domain] || 0) + seconds;
    }
    monthlyData[dateStr] = existing;
  } else {
    monthlyData[dateStr] = dayData;
  }

  // Update the gist
  await updateGist(gist.id, filename, monthlyData);
  return { created: false, gistUrl: fullGist.html_url };
}

/**
 * Force-set a day's data (replace, not merge)
 */
export async function forceSetDayData(dateStr, dayData) {
  const filename = getMonthlyFilename(dateStr);
  let gist = await findGist();

  if (!gist) {
    const content = { [dateStr]: dayData };
    gist = await createGist(filename, content);
    return { created: true, gistUrl: gist.html_url };
  }

  const fullGist = await getFullGist(gist.id);
  let monthlyData = {};

  if (fullGist.files[filename]) {
    try {
      monthlyData = JSON.parse(fullGist.files[filename].content);
    } catch {
      monthlyData = {};
    }
  }

  monthlyData[dateStr] = dayData;
  await updateGist(gist.id, filename, monthlyData);
  return { created: false, gistUrl: fullGist.html_url };
}

/**
 * Get all data for a specific month
 * @param {string} monthStr - Month string "YYYY-MM"
 */
export async function getMonthData(monthStr) {
  const filename = `chrome-time-tracker-${monthStr}.json`;
  const gist = await findGist();
  if (!gist) return null;

  const fullGist = await getFullGist(gist.id);
  if (!fullGist.files[filename]) return null;

  try {
    return JSON.parse(fullGist.files[filename].content);
  } catch {
    return null;
  }
}

/**
 * Get the Gist URL
 */
export async function getGistUrl() {
  const gist = await findGist();
  return gist ? gist.html_url : null;
}
