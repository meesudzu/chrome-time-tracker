# Chrome Time Tracker

A Chrome extension that tracks your browsing time per domain and syncs daily logs to a private GitHub Gist, organized by month.

## Features

- 🕐 **Automatic Time Tracking** — Tracks seconds spent on each domain
- 🌐 **Per-Domain Breakdown** — See which websites consume the most time
- 🔄 **GitHub Gist Sync** — Daily logs stored as monthly JSON files in a private Gist
- 🔐 **One-Click GitHub Login** — Simple device code authentication
- 😴 **Idle Detection** — Pauses tracking when you're away (>2 min)
- 📊 **Visual Dashboard** — Dark-themed popup with progress bars and favicons

## Setup

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
