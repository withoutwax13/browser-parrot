# Browser Parrot Verification Checklist

This checklist verifies a Chrome Manifest V3 extension named `browser-parrot` with the required phase 1 and phase 2 features. It is intentionally repository-agnostic: acceptance is based on observable artifacts, code structure, and behavior rather than fixed filenames.

## Acceptance Rules

A submission passes only if all required automated checks pass and all required manual checks are demonstrably satisfied.

## Automated Checks

### 1. Extension packaging and MV3 structure

- A `manifest.json` file exists somewhere in the repository.
- The manifest declares `"manifest_version": 3`.
- The manifest identifies the extension as `browser-parrot`, or the repository otherwise clearly contains the browser-parrot extension implementation.
- The manifest includes popup wiring through `action.default_popup`, or equivalent popup entry referenced by the manifest.
- The manifest includes a background service worker entry.
- The manifest includes content script registration, or code structure clearly implements injected content capture for pages.
- The manifest includes a devtools entry such as `devtools_page`, or equivalent devtools wiring.

### 2. Popup controls

- Popup UI implementation exists.
- Popup code or markup includes controls for:
  - start
  - stop
  - export
  - clear
- Popup code or markup includes redaction controls or toggles.

### 3. Content capture

- Content-side logic exists for capturing:
  - focus
  - input
  - change
  - click
- Captured events include selector generation or selector recording.
- Captured events include lightweight DOM context before and after the interaction, or clearly named equivalent fields.

### 4. URL change capture

- URL changes are captured through history/navigation hooks, location observers, tab updates, or equivalent logic.

### 5. Background session store and correlation

- Background logic maintains a session store or equivalent chronological event log.
- Step or event ordering is preserved chronologically.
- Network correlation logic exists with an explicit time-based correlation window or equivalent bounded matching rule.

### 6. DevTools panel

- DevTools panel or devtools page implementation exists.
- DevTools code exposes a live timeline view.
- DevTools code includes network-related inspection, display, or ingestion.

### 7. Export

- Export logic produces JSON.
- Export output contains step/event data.
- Export output contains correlated network data.

### 8. Redaction

- Password values are redacted.
- Sensitive tokens are redacted.
- Sensitive headers are redacted.
- Redaction logic is applied during capture, storage, export, or a documented combination of those stages.

### 9. Script quality

- `verify.sh` executes with `/bin/bash`.
- `verify.sh` exits nonzero on failures.
- `verify.sh` degrades gracefully when `jq` or `node` is unavailable.

## Manual Checks

These checks should be run in a local Chrome or Chromium session with the unpacked extension loaded.

### 1. Popup workflow

- Open the popup.
- Confirm visible controls for start, stop, export, clear, and redaction toggles.
- Start a recording session and confirm the UI reflects active state.
- Stop the session and confirm the UI reflects inactive state.
- Clear the session and confirm recorded data is removed from the UI or backing state.

### 2. Interaction capture

- On a test page, trigger focus, input, change, and click events.
- Confirm each interaction appears in the session timeline or export.
- Confirm each captured step includes a selector.
- Confirm each captured step includes lightweight DOM context before and after the event.

### 3. URL change capture

- Navigate via full page load and via in-page route change if the test page is an SPA.
- Confirm URL changes are recorded as steps or navigation events.

### 4. Network correlation

- Trigger one or more network requests close in time to recorded interactions.
- Confirm correlated requests appear attached to the relevant step or exported session.
- Confirm unrelated requests outside the correlation window are not incorrectly attached.

### 5. DevTools panel

- Open Chrome DevTools and the extension’s custom panel.
- Confirm a live timeline is visible while actions occur on the page.
- Confirm network activity appears in the panel and remains aligned with captured steps.

### 6. Export JSON

- Export a completed session.
- Confirm the exported file is valid JSON.
- Confirm it contains ordered steps and correlated network records.

### 7. Redaction behavior

- Type into a password field and confirm the raw password is not stored or exported.
- Trigger requests containing tokens or sensitive headers and confirm those values are redacted in stored or exported data.
- Confirm redaction toggles affect behavior as designed without exposing sensitive values unexpectedly.

## Evidence to Collect

- Manifest file path.
- Popup file path.
- Background/service worker file path.
- Content capture file path.
- DevTools file path.
- One sample exported JSON file.
- One screenshot of the popup and one screenshot of the devtools panel during a live session.
