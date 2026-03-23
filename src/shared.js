(() => {
  const SENSITIVE_KEYS = [/password/i, /token/i, /secret/i, /authorization/i, /cookie/i, /api[-_]?key/i];

  function nowIso() {
    return new Date().toISOString();
  }

  function uid(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function safeString(v, max = 500) {
    const s = typeof v === 'string' ? v : String(v ?? '');
    return s.length > max ? s.slice(0, max) + '…' : s;
  }

  function redactByKey(key, value) {
    if (!key) return value;
    const hit = SENSITIVE_KEYS.some((re) => re.test(key));
    return hit ? '[REDACTED]' : value;
  }

  function redactText(text) {
    if (!text) return text;
    return String(text)
      .replace(/(Bearer\s+)[A-Za-z0-9._\-+/=]+/gi, '$1[REDACTED]')
      .replace(/([?&](?:token|access_token|id_token|api_key|key|secret)=)[^&]*/gi, '$1[REDACTED]')
      .replace(/(authorization\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]');
  }

  function parseHeaders(rawHeaders) {
    const headers = {};
    if (!rawHeaders) return headers;
    String(rawHeaders)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line) => {
        const idx = line.indexOf(':');
        if (idx <= 0) return;
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        headers[k] = redactByKey(k, redactText(v));
      });
    return headers;
  }

  function pickBestSelectors(el) {
    if (!el || !el.tagName) return [];
    const selectors = [];
    const tag = el.tagName.toLowerCase();

    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test');
    if (testId) selectors.push({ kind: 'data-testid', value: `[data-testid="${CSS.escape(testId)}"]`, score: 0.98 });

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) selectors.push({ kind: 'aria-label', value: `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`, score: 0.9 });

    if (el.id) selectors.push({ kind: 'id', value: `#${CSS.escape(el.id)}`, score: 0.92 });

    if (el.name) selectors.push({ kind: 'name', value: `${tag}[name="${CSS.escape(el.name)}"]`, score: 0.88 });

    const classes = Array.from(el.classList || []).slice(0, 3).map((c) => `.${CSS.escape(c)}`).join('');
    if (classes) selectors.push({ kind: 'class', value: `${tag}${classes}`, score: 0.7 });

    selectors.push({ kind: 'nth-path', value: cssPath(el), score: 0.55 });
    return selectors;
  }

  function cssPath(el) {
    const path = [];
    let node = el;
    while (node && node.nodeType === 1 && path.length < 6) {
      let seg = node.tagName.toLowerCase();
      if (node.id) {
        seg += `#${CSS.escape(node.id)}`;
        path.unshift(seg);
        break;
      }
      const idx = siblingIndex(node);
      seg += `:nth-of-type(${idx})`;
      path.unshift(seg);
      node = node.parentElement;
    }
    return path.join(' > ');
  }

  function siblingIndex(node) {
    let i = 1;
    let sib = node;
    while ((sib = sib.previousElementSibling)) {
      if (sib.tagName === node.tagName) i++;
    }
    return i;
  }

  function getAncestorChain(el, maxDepth = 4) {
    const out = [];
    let cur = el;
    let d = 0;
    while (cur && cur.nodeType === 1 && d < maxDepth) {
      out.push({
        tag: cur.tagName.toLowerCase(),
        id: cur.id || null,
        class: cur.className || null,
        name: cur.getAttribute('name') || null
      });
      cur = cur.parentElement;
      d += 1;
    }
    return out;
  }

  function sanitizeUrl(url) {
    try {
      const u = new URL(url);
      ['token', 'access_token', 'id_token', 'api_key', 'key', 'secret'].forEach((k) => {
        if (u.searchParams.has(k)) u.searchParams.set(k, '[REDACTED]');
      });
      return u.toString();
    } catch {
      return redactText(url || '');
    }
  }

  self.BrowserParrotShared = {
    nowIso,
    uid,
    safeString,
    redactByKey,
    redactText,
    parseHeaders,
    pickBestSelectors,
    getAncestorChain,
    sanitizeUrl
  };
})();
