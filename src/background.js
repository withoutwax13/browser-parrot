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
  scenarios: [],
  currentScenarioId: null
};

function broadcast(msg) {
  chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }, (tabs) => {
    (tabs || []).forEach((tab) => {
      if (!tab?.id) return;
      chrome.tabs.sendMessage(tab.id, msg, () => void chrome.runtime.lastError);
    });
  });
}

function ensureInjectedAllTabs() {
  chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }, (tabs) => {
    (tabs || []).forEach((tab) => {
      if (!tab?.id) return;
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ['src/shared.js', 'src/content.js'] },
        () => void chrome.runtime.lastError
      );
    });
  });
}

function currentScenario() {
  return state.scenarios.find((s) => s.id === state.currentScenarioId) || null;
}

function scenarioTitleFrom(input) {
  const t = (input || '').trim();
  return t || `Scenario ${state.scenarios.length + 1}`;
}

function startScenario(title) {
  const scenario = {
    id: SH.uid('scenario'),
    title: scenarioTitleFrom(title),
    started_at: SH.nowIso(),
    stopped_at: null,
    steps: [],
    network: []
  };
  state.scenarios.push(scenario);
  state.currentScenarioId = scenario.id;
  return scenario;
}

function stopScenario() {
  const s = currentScenario();
  if (s && !s.stopped_at) s.stopped_at = SH.nowIso();
}

function correlate(step, scenario) {
  const t = new Date(step.ts).getTime();
  return (scenario?.network || []).filter((n) => {
    const nt = new Date(n.ts).getTime();
    return nt >= t && nt <= t + NETWORK_WINDOW_MS;
  });
}

function shapedStep(raw, scenario) {
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
  out.network = correlate(out, scenario);
  return out;
}

function isNoisy(step) {
  if (!step?.action) return true;
  if (step.action === 'focus') return true;
  const tag = String(step.element?.tag || '').toLowerCase();
  if (tag === 'html' || tag === 'body') return true;
  return false;
}

function selectorKey(step) {
  const arr = step?.element?.selectors;
  if (!Array.isArray(arr) || !arr.length) return '';
  const s = arr[0];
  return typeof s === 'string' ? s : (s?.value || '');
}

function pushStepWithDedupe(step, scenario) {
  if (isNoisy(step)) return;
  const list = scenario.steps;
  const prev = list[list.length - 1];

  if (prev && step.action === 'input' && prev.action === 'input') {
    const sameTarget = selectorKey(step) && selectorKey(step) === selectorKey(prev);
    const dt = new Date(step.ts).getTime() - new Date(prev.ts).getTime();
    if (sameTarget && dt <= 2000) {
      list[list.length - 1] = step;
      return;
    }
  }

  list.push(step);
}

function pushNetwork(payload = {}) {
  const s = currentScenario();
  if (!s) return;
  s.network.push({
    ts: payload.ts || SH.nowIso(),
    method: payload.method || 'GET',
    url: SH.sanitizeUrl(payload.url || ''),
    status: payload.status || 0,
    type: payload.type || 'xhr',
    duration_ms: payload.duration_ms || null,
    request_headers: state.redaction.redactHeaders ? SH.parseHeaders(payload.request_headers) : (payload.request_headers || {}),
    response_headers: state.redaction.redactHeaders ? SH.parseHeaders(payload.response_headers) : (payload.response_headers || {})
  });
}

function selectorsForExport(step) {
  const sels = Array.isArray(step?.element?.selectors) ? step.element.selectors : [];
  const out = [];
  for (const s of sels) {
    const value = typeof s === 'string' ? s : s?.value;
    if (!value) continue;
    out.push([String(value)]);
    if (out.length >= 4) break;
  }
  return out;
}

function toRecorderStep(step) {
  if (step.action === 'navigation') {
    return {
      type: 'navigate',
      url: step.url_after || step.url_before || '',
      assertedEvents: [{ type: 'navigation', url: step.url_after || step.url_before || '' }]
    };
  }

  const type = step.action === 'input' ? 'change' : (step.action || 'click');
  const out = {
    type,
    target: 'main',
    selectors: selectorsForExport(step)
  };

  if (type === 'change') out.value = step.input?.raw ?? '';
  return out;
}

function buildRecorderExport() {
  const s = currentScenario() || state.scenarios[state.scenarios.length - 1] || null;
  return {
    title: s?.title || 'Browser Parrot Recording',
    steps: s ? s.steps.map(toRecorderStep) : []
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'ui_event' && state.active) {
    const s = currentScenario();
    if (!s) return true;
    const step = shapedStep(msg.payload || {}, s);
    pushStepWithDedupe(step, s);
    sendResponse?.({ ok: true });
    return true;
  }

  if (msg.type === 'url_change' && state.active) {
    const s = currentScenario();
    if (!s) return true;
    const step = shapedStep(msg.payload || {}, s);
    pushStepWithDedupe(step, s);
    sendResponse?.({ ok: true });
    return true;
  }

  if (msg.type === 'devtools_network' && state.active) {
    pushNetwork(msg.payload || {});
    sendResponse?.({ ok: true });
    return true;
  }

  if (msg.type === 'set_discovery_mode') {
    if (typeof msg.active === 'boolean') {
      if (msg.active && !state.active) {
        startScenario(msg.title);
        ensureInjectedAllTabs();
      }
      if (!msg.active && state.active) stopScenario();
      state.active = msg.active;
    }

    if (msg.redaction) state.redaction = { ...state.redaction, ...msg.redaction };

    if (msg.clear) {
      state.scenarios = [];
      state.currentScenarioId = null;
      state.active = false;
    }

    broadcast({ type: 'set_discovery_mode', active: state.active });
    sendResponse?.({ ok: true, active: state.active, redaction: state.redaction });
    return true;
  }

  if (msg.type === 'clear_session') {
    state.scenarios = [];
    state.currentScenarioId = null;
    state.active = false;
    sendResponse?.({ ok: true });
    return true;
  }

  if (msg.type === 'get_state') {
    const s = currentScenario();
    sendResponse?.({
      ok: true,
      active: state.active,
      redaction: state.redaction,
      steps: s?.steps || [],
      networkCount: s?.network?.length || 0,
      scenarios: state.scenarios.map((x) => ({
        id: x.id,
        title: x.title,
        started_at: x.started_at,
        stopped_at: x.stopped_at,
        step_count: x.steps.length,
        network_count: x.network.length
      }))
    });
    return true;
  }

  if (msg.type === 'export_session') {
    sendResponse?.({ ok: true, ...buildRecorderExport() });
    return true;
  }

  if (msg.type === 'ingest_network_event' && state.active) {
    pushNetwork(msg.payload || {});
    sendResponse?.({ ok: true });
    return true;
  }
});

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (!state.active) return;
    if (details.tabId < 0) return;
    pushNetwork({
      ts: SH.nowIso(),
      method: details.method,
      url: details.url,
      status: details.statusCode,
      type: details.type,
      duration_ms: null
    });
  },
  { urls: ['<all_urls>'] }
);
