chrome.devtools.panels.create('Browser Parrot', '', 'src/devtools-panel.html');

chrome.devtools.network.onRequestFinished.addListener((req) => {
  const payload = {
    ts: new Date().toISOString(),
    method: req.request?.method,
    url: req.request?.url,
    status: req.response?.status,
    type: req._resourceType || req.response?.content?.mimeType || 'xhr',
    duration_ms: req.time,
    request_headers: (req.request?.headers || []).map((h) => `${h.name}: ${h.value}`).join('\n'),
    response_headers: (req.response?.headers || []).map((h) => `${h.name}: ${h.value}`).join('\n')
  };
  chrome.runtime.sendMessage({ type: 'ingest_network_event', payload }, () => void chrome.runtime.lastError);
});
