importScripts('shared.js');

const SH = self.BrowserParrotShared;
const NETWORK_WINDOW_MS = 2000;

const state = {
  active: false,
  redaction: {
    maskPasswords: true,
    redactHeaders: true,
    redactQuery: true
  },
  steps: [],
  network: []
};

function activeTabId(cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => cb(tabs?.[0]?.id));
}

function broadcast(msg) {
  activeTabId((tabId) => {
    if (!tabId) return;
    chrome.tabs.sendMessage(tabId, msg, () => void chrome.runtime.lastError);
  });
}

function correlate(step) {
  const t = new Date(step.ts).getTime();
  return state.network.filter((n) => {
    const nt = new Date(n.ts).getTime();
    return nt >= t && nt <= t + NETWORK_WINDOW_MS;
  });
}

function shapedStep(raw) {
  const out = {
    id: raw.step_id || SH.uid('step'),
    ts: raw.ts || SH.nowIso(),
    action: raw.action,
    url_before: raw.url_before || raw.url || null,
    url_after: raw.url_after || raw.url || null,
    element: raw.element || null,
    input: raw.value != null ? { raw: raw.value, masked: !!raw.sensitive } : null,
    dom_before: raw.dom_before || null,
    dom_after: raw.dom_after || null,
    network: []
  };
  out.network = correlate(out);
  return out;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'ui_event' && state.active) {
    const step = shapedStep(msg.payload || {});
    state.steps.push(step);
    sendResponse?.({ ok: true });
    return true;
  }

  if (msg.type === 'url_change' && state.active) {
    const step = shapedStep(msg.payload || {});
    state.steps.push(step);
    sendResponse?.({ ok: true });
    return true;
  }

  if (msg.type === 'devtools_network' && state.active) {
    const p = msg.payload || {};
    state.network.push({
      ts: p.ts || SH.nowIso(),
      method: p.method || 'GET',
      url: SH.sanitizeUrl(p.url || ''),
      status: p.status || 0,
      type: p.type || 'xhr',
      duration_ms: p.duration_ms || null,
      request_headers: state.redaction.redactHeaders ? SH.parseHeaders(p.request_headers) : (p.request_headers || {}),
      response_headers: state.redaction.redactHeaders ? SH.parseHeaders(p.response_headers) : (p.response_headers || {})
    });
    sendResponse?.({ ok: true });
    return true;
  }

  if (msg.type === 'set_discovery_mode') {
    state.active = !!msg.active;
    if (msg.clear) {
      state.steps = [];
      state.network = [];
    }
    if (msg.redaction) state.redaction = { ...state.redaction, ...msg.redaction };
    broadcast({ type: 'set_discovery_mode', active: state.active });
    sendResponse?.({ ok: true, active: state.active, redaction: state.redaction });
    return true;
  }

  if (msg.type === 'clear_session') {
    state.steps = [];
    state.network = [];
    sendResponse?.({ ok: true });
    return true;
  }

  if (msg.type === 'get_state') {
    sendResponse?.({ ok: true, active: state.active, redaction: state.redaction, steps: state.steps, networkCount: state.network.length });
    return true;
  }

  if (msg.type === 'export_session') {
    sendResponse?.({
      ok: true,
      exported_at: SH.nowIso(),
      meta: {
        step_count: state.steps.length,
        network_count: state.network.length,
        window_ms: NETWORK_WINDOW_MS,
        redaction: state.redaction
      },
      steps: state.steps
    });
    return true;
  }

  if (msg.type === 'ingest_network_event' && state.active) {
    const ev = msg.payload || {};
    state.network.push({
      ts: ev.ts || SH.nowIso(),
      method: ev.method || 'GET',
      url: SH.sanitizeUrl(ev.url || ''),
      status: ev.status || 0,
      type: ev.type || 'xhr',
      duration_ms: ev.duration_ms || null,
      request_headers: state.redaction.redactHeaders ? SH.parseHeaders(ev.request_headers) : ev.request_headers,
      response_headers: state.redaction.redactHeaders ? SH.parseHeaders(ev.response_headers) : ev.response_headers
    });
    sendResponse?.({ ok: true });
    return true;
  }
});

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (!state.active) return;
    if (details.tabId < 0) return;
    state.network.push({
      ts: SH.nowIso(),
      method: details.method,
      url: SH.sanitizeUrl(details.url),
      status: details.statusCode,
      type: details.type,
      duration_ms: null
    });
  },
  { urls: ['<all_urls>'] }
);
