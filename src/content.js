(() => {
  if (window.__browserParrotInitialized) return;
  window.__browserParrotInitialized = true;

  const SH = self.BrowserParrotShared;
  if (!SH) return;

  let discoveryActive = false;

  function send(type, payload) {
    chrome.runtime.sendMessage({ source: 'content', type, payload }, () => void chrome.runtime.lastError);
  }

  function syncState() {
    chrome.runtime.sendMessage({ type: 'get_state' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && typeof res.active === 'boolean') discoveryActive = res.active;
    });
  }

  function elementMeta(el) {
    if (!el) return null;
    const tag = (el.tagName || '').toLowerCase();
    const type = el.getAttribute?.('type') || null;
    return {
      tag,
      type,
      text: SH.safeString(el.innerText || el.value || ''),
      id: el.id || null,
      name: el.getAttribute?.('name') || null,
      role: el.getAttribute?.('role') || null,
      selectors: SH.pickBestSelectors(el),
      ancestors: SH.getAncestorChain(el),
      bounds: rect(el)
    };
  }

  function rect(el) {
    try {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    } catch {
      return null;
    }
  }

  function snapshot(el) {
    return {
      target_outer_html: SH.safeString(el?.outerHTML || '', 2000),
      ancestor_chain: SH.getAncestorChain(el)
    };
  }

  function inferSensitive(el) {
    const type = (el?.getAttribute?.('type') || '').toLowerCase();
    const name = (el?.getAttribute?.('name') || '').toLowerCase();
    return type === 'password' || /password|token|secret/.test(name);
  }

  function onAction(action, e, extra = {}) {
    if (!discoveryActive) return;
    const el = e.target;
    if (!el || !el.tagName) return;

    const valueRaw = 'value' in el ? String(el.value ?? '') : null;
    const sensitive = inferSensitive(el);
    const value = sensitive ? '***' : SH.safeString(valueRaw || '', 300);

    send('ui_event', {
      step_id: SH.uid('step'),
      ts: SH.nowIso(),
      action,
      url: location.href,
      element: elementMeta(el),
      value,
      sensitive,
      dom_before: snapshot(el),
      dom_after: snapshot(el),
      ...extra
    });
  }

  window.addEventListener('focus', (e) => onAction('focus', e), true);
  window.addEventListener('input', (e) => onAction('input', e), true);
  window.addEventListener('change', (e) => onAction('change', e), true);
  window.addEventListener('click', (e) => onAction('click', e), true);

  let lastHref = location.href;
  const mo = new MutationObserver(() => {
    if (!discoveryActive) return;
    if (location.href !== lastHref) {
      send('url_change', {
        step_id: SH.uid('step'),
        ts: SH.nowIso(),
        action: 'navigation',
        url_before: lastHref,
        url_after: location.href
      });
      lastHref = location.href;
    }
  });
  mo.observe(document.documentElement, { subtree: true, childList: true });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'set_discovery_mode') {
      discoveryActive = !!msg.active;
      sendResponse({ ok: true, discoveryActive });
      return true;
    }
  });

  syncState();
  setInterval(syncState, 1000);
})();
