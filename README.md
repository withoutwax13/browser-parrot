# browser-parrot

Browser Parrot is a Chrome MV3 extension for QA automation discovery.

## What V1 (Phase 1 + 2) does
- Start/stop **Discovery Mode** from popup.
- Capture chronological UI steps: `focus`, `input`, `change`, `click`, URL changes.
- Capture element metadata and selector candidates.
- Capture lightweight DOM context (`target outerHTML` + ancestor chain) before/after.
- Capture network activity from:
  - `chrome.webRequest` listener in background, and
  - DevTools Network stream (`onRequestFinished`) for richer details.
- Correlate network requests to each user step within a configurable time window (default 2s).
- Export session as JSON.
- Redact sensitive data (passwords/tokens/auth/cookies/query secrets).

## Load in Chrome
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder: `browser-parrot`

## Usage
1. Open target app tab.
2. Click extension popup → **Start Discovery**.
3. Perform manual steps (login, navigation, etc).
4. Open DevTools panel **Browser Parrot** to see live timeline.
5. Click popup **Export JSON**.

## Output shape
Export includes:
- `meta` (counts, redaction config)
- `steps[]` with:
  - `action`, `ts`
  - `url_before`, `url_after`
  - `element`
  - `input`
  - `dom_before`, `dom_after`
  - `network[]` correlated to step window

## Limitations
- Network correlation is heuristic by time window (not guaranteed causal mapping).
- DevTools-level request details are richer only when DevTools is open.
- Large/SPA pages can produce noisy event streams.
