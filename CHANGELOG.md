# Changelog

All notable changes to this project will be documented in this file.

---

## [Unreleased] — 2026-03-04

### CI/CD
- Added GitHub Actions workflow for automated Chrome Web Store publishing ([`34bb8fd`](../../commit/34bb8fd2d15ccdee850aa8419c16259ecbc5a38c))
- Updated `.gitignore` to include workflow files
- Clarified README setup instructions for easier onboarding

---

## [2026-02-28]

### Features
- **Multi-device Gist sync**: Implemented Gist fallback for day data retrieval with local caching; enhanced Gist data merging to support synchronization across multiple devices ([`2f8abfe`](../../commit/2f8abfe205ff58596fcb81e56ceee1f4e1055c61))
- **Offline-first local storage**: Implemented local data storage with monthly organization; refactored Gist synchronization to always save locally first; updated the popup UI to display local data and show dynamic login/logout controls ([`d735bd8`](../../commit/d735bd8b28de5dd30e94da2eb6058053da301453))

---

## [2026-02-27]

### Documentation
- Added `PRIVACY.md` — privacy policy for the extension ([`3411400`](../../commit/3411400e8ee702ec16c53e3c2c2d45bda5ac4fe0))
