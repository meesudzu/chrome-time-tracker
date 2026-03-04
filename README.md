# Chrome Time Tracker

A Chrome extension that tracks your browsing time per domain and syncs daily logs to a private GitHub Gist, organized by month.

## Features

- 🕐 **Automatic Time Tracking** — Tracks seconds spent on each domain
- 🌐 **Per-Domain Breakdown** — See which websites consume the most time
- 🔄 **GitHub Gist Sync** — Daily logs stored as monthly JSON files in a private Gist
- 🔐 **One-Click GitHub Login** — Simple device code authentication
- 😴 **Idle Detection** — Pauses tracking when you're away (>2 min)
- 📊 **Visual Dashboard** — Dark-themed popup with progress bars and favicons

## Setup Local

### 1. Load the Extension

1. Open Chrome → go to `chrome://extensions`
2. Enable **"Developer mode"** (top right toggle)
3. Click **"Load unpacked"** and select this folder

### 2. Login

1. Click the extension icon in the toolbar
2. Click **"Sign in with GitHub"**
3. Copy the **device code** shown
4. Click the link to open **github.com/login/device**
5. Paste the code and authorize — done ✅

## Data Structure

Monthly JSON files in a private Gist:

```
chrome-time-tracker-2026-02.json
chrome-time-tracker-2026-03.json
```

Each file:

```json
{
  "2026-02-27": {
    "github.com": 3600,
    "stackoverflow.com": 1200
  }
}
```

Values are in **seconds**.

## Sync

- Auto-sync every 30 minutes
- Manual sync via popup button
- Day boundary sync at midnight
- Offline queue with retry

## Auto-Publish to Chrome Web Store

A GitHub Actions workflow auto-publishes when you push a version tag.

### One-Time Setup

1. **Pay the $5 developer fee** at [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. **Manually upload the first version** via the dashboard
3. **Get API credentials** — follow [Google's guide](https://developer.chrome.com/docs/webstore/using-api):
   - Create an OAuth client in Google Cloud Console
   - Get `client_id`, `client_secret`, and `refresh_token`
4. **Add GitHub Secrets** to your repo (`Settings → Secrets → Actions`):

   | Secret | Value |
   |--------|-------|
   | `CHROME_EXTENSION_ID` | Your extension ID from the Chrome Web Store |
   | `CHROME_CLIENT_ID` | Google API OAuth client ID |
   | `CHROME_CLIENT_SECRET` | Google API OAuth client secret |
   | `CHROME_REFRESH_TOKEN` | Google API OAuth refresh token |

### Publishing a New Version

```bash
git add -A && git commit -m "v1.0.1"
git tag v1.0.1
git push && git push --tags
```

The workflow will automatically zip, upload, and publish to the Chrome Web Store.
