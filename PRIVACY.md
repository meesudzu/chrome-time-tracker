# Privacy Policy — Chrome Time Tracker

**Last updated:** February 27, 2026

## Overview

Chrome Time Tracker is an open-source browser extension that tracks the time you spend on each website and syncs daily reports to your private GitHub Gist. Your privacy is our top priority.

## Data We Collect

| Data | Purpose | Stored Where |
|------|---------|--------------|
| Website domain names (e.g., `github.com`) | Time tracking per domain | Locally in your browser (`chrome.storage.local`) |
| Time spent per domain (in seconds) | Browsing time reports | Locally + your private GitHub Gist |
| GitHub username and avatar URL | Display in the extension popup | Locally in your browser |
| GitHub access token | Authenticate with GitHub Gist API | Locally in your browser |

## Data We Do NOT Collect

- ❌ Full URLs or page paths
- ❌ Page content, titles, or text
- ❌ Browsing history
- ❌ Personal information (name, email, etc.)
- ❌ Cookies, form data, or passwords
- ❌ Data from other extensions
- ❌ Any analytics or telemetry

## Where Data Is Stored

- **Locally:** All data is stored in `chrome.storage.local` on your device.
- **GitHub Gist:** If you choose to sign in with GitHub, your daily time reports are synced to a **private Gist** in **your own GitHub account**. Only you can access this Gist.

## Third-Party Services

This extension communicates only with:

- **github.com** — For user authentication via GitHub Device Flow
- **api.github.com** — For reading/writing your private GitHub Gist

No data is sent to any other server, analytics service, or third party.

## Data Sharing

We do **not** sell, share, transfer, or disclose your data to any third party.

## Data Retention

- Local data remains on your device until you uninstall the extension or clear extension data.
- Gist data remains in your GitHub account under your control. You can delete it at any time.

## Permissions Used

| Permission | Reason |
|------------|--------|
| `tabs` | Read the active tab's URL to extract the domain name for time tracking |
| `storage` | Save browsing time data and settings locally |
| `alarms` | Periodic timers for time tracking (1 min) and auto-sync (30 min) |
| `idle` | Detect when the user is away to pause time tracking |
| Host: `github.com`, `api.github.com` | GitHub login and Gist sync |

## Open Source

This extension is fully open source. You can review the source code at:
https://github.com/user/chrome-time-tracker

## Contact

If you have any questions about this privacy policy, please open an issue on the GitHub repository.

## Changes

We may update this privacy policy from time to time. Changes will be posted in the GitHub repository.
