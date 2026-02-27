// auth.js — GitHub Device Flow authentication module

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_CLIENT_ID = 'Ov23liTFUujU8MruEFuh';

/**
 * Get stored access token
 */
export async function getToken() {
  const data = await chrome.storage.local.get('github_token');
  return data.github_token || null;
}

/**
 * Start GitHub Device Flow login
 * Returns { user_code, verification_uri, device_code, interval, expires_in }
 */
export async function startDeviceFlow() {
  const response = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: 'gist'
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to start device flow: ${err}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    deviceCode: data.device_code,
    interval: data.interval || 5,
    expiresIn: data.expires_in || 900
  };
}

/**
 * Poll GitHub for the access token after user has entered the code
 * @param {string} deviceCode - Device code from startDeviceFlow
 * @param {number} interval - Polling interval in seconds
 * @param {number} expiresIn - Expiration time in seconds
 * @param {function} onStatus - Callback for status updates
 * @returns {Promise<{token, user}>}
 */
export async function pollForToken(deviceCode, interval, expiresIn, onStatus) {
  const startTime = Date.now();
  const expiresAt = startTime + (expiresIn * 1000);

  return new Promise((resolve, reject) => {
    const poll = async () => {
      if (Date.now() > expiresAt) {
        reject(new Error('Device code expired. Please try again.'));
        return;
      }

      try {
        const response = await fetch(GITHUB_TOKEN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
          })
        });

        const data = await response.json();

        if (data.access_token) {
          // Success!
          await chrome.storage.local.set({ github_token: data.access_token });
          const user = await fetchUser(data.access_token);
          await chrome.storage.local.set({ github_user: user });
          resolve({ token: data.access_token, user });
          return;
        }

        if (data.error === 'authorization_pending') {
          if (onStatus) onStatus('Waiting for authorization...');
          setTimeout(poll, interval * 1000);
          return;
        }

        if (data.error === 'slow_down') {
          // Increase interval
          interval += 5;
          if (onStatus) onStatus('Waiting for authorization...');
          setTimeout(poll, interval * 1000);
          return;
        }

        if (data.error === 'expired_token') {
          reject(new Error('Device code expired. Please try again.'));
          return;
        }

        if (data.error === 'access_denied') {
          reject(new Error('Authorization was denied.'));
          return;
        }

        reject(new Error(data.error_description || data.error || 'Unknown error'));
      } catch (err) {
        reject(err);
      }
    };

    // Start polling
    setTimeout(poll, interval * 1000);
  });
}

/**
 * Fetch GitHub user info
 */
async function fetchUser(token) {
  const response = await fetch(GITHUB_USER_URL, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json'
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user info');
  }

  const user = await response.json();
  return {
    login: user.login,
    name: user.name,
    avatar_url: user.avatar_url,
    html_url: user.html_url
  };
}

/**
 * Get stored user info
 */
export async function getUser() {
  const data = await chrome.storage.local.get('github_user');
  return data.github_user || null;
}

/**
 * Logout — clear stored token and user
 */
export async function logout() {
  await chrome.storage.local.remove(['github_token', 'github_user', 'gist_id']);
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated() {
  const token = await getToken();
  if (!token) return false;

  try {
    const response = await fetch(GITHUB_USER_URL, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json'
      }
    });
    return response.ok;
  } catch {
    return false;
  }
}
