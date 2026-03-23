const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const isPanel = params.get('panel') === '1';

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function downloadJson(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function setVisualState(active) {
  const toggleBtn = $('toggleBtn');
  const modePill = $('modePill');
  if (active) {
    toggleBtn.textContent = 'Stop Discovery';
    toggleBtn.classList.add('stop');
    modePill.textContent = 'Recording';
    modePill.classList.remove('idle');
    modePill.classList.add('rec');
  } else {
    toggleBtn.textContent = 'Start Discovery';
    toggleBtn.classList.remove('stop');
    modePill.textContent = 'Idle';
    modePill.classList.remove('rec');
    modePill.classList.add('idle');
  }
}

function summarizeStep(step) {
  const action = step?.action || 'unknown';
  const name = step?.element?.name || step?.element?.id || step?.element?.tag || 'element';
  const url = step?.url_after || step?.url_before || '';
  return { action, target: name, url };
}

function prettyPreview(raw, simple, latestSteps) {
  const simpleScenario = simple?.scenarios?.[simple.scenarios.length - 1] || null;
  return {
    mode: $('exportMode').value,
    scenarioCount: raw?.scenarios?.length || 0,
    latestScenario: raw?.scenarios?.[raw.scenarios.length - 1]?.title || null,
    latestStepCount: latestSteps.length,
    simplePreviewTopSteps: (simpleScenario?.steps || []).slice(0, 6),
  };
}

async function refreshStatus() {
  const res = await send({ type: 'get_state' });
  if (!res?.ok) return;

  $('maskPasswords').checked = !!res.redaction?.maskPasswords;
  $('redactHeaders').checked = !!res.redaction?.redactHeaders;
  $('redactQuery').checked = !!res.redaction?.redactQuery;
  setVisualState(!!res.active);

  const scenarios = Array.isArray(res.scenarios) ? res.scenarios : [];
  const latest = scenarios[scenarios.length - 1] || null;

  const raw = await send({ type: 'export_session', format: 'raw' });
  const simple = await send({ type: 'export_session', format: 'simple' });

  const latestScenarioRaw = raw?.scenarios?.[raw.scenarios.length - 1] || null;
  const latestSteps = (latestScenarioRaw?.steps || []).slice(-8).map(summarizeStep);

  $('status').textContent = JSON.stringify(
    {
      active: res.active,
      scenarios: scenarios.length,
      current: latest
        ? { title: latest.title, step_count: latest.step_count, network_count: latest.network_count }
        : null,
      redaction: res.redaction
    },
    null,
    2
  );

  $('liveSteps').textContent = latestSteps.length
    ? JSON.stringify(latestSteps, null, 2)
    : 'No steps captured yet.';

  $('preview').textContent = JSON.stringify(prettyPreview(raw, simple, latestSteps), null, 2);
}

async function setMode(active) {
  const redaction = {
    maskPasswords: $('maskPasswords').checked,
    redactHeaders: $('redactHeaders').checked,
    redactQuery: $('redactQuery').checked
  };
  const title = $('scenarioTitle').value.trim();
  await send({ type: 'set_discovery_mode', active, redaction, title });
  await refreshStatus();
}

$('toggleBtn').addEventListener('click', async () => {
  const res = await send({ type: 'get_state' });
  await setMode(!res?.active);
});

$('clearBtn').addEventListener('click', async () => {
  await send({ type: 'clear_session' });
  await refreshStatus();
});

$('exportBtn').addEventListener('click', async () => {
  const format = $('exportMode').value;
  const res = await send({ type: 'export_session', format });
  if (!res?.ok) return;
  downloadJson(`browser-parrot-${format}-${Date.now()}.json`, res);
});

$('openPanelBtn').addEventListener('click', async () => {
  await chrome.windows.create({
    url: chrome.runtime.getURL('src/popup.html?panel=1'),
    type: 'popup',
    width: 460,
    height: 820,
    focused: true
  });
});

['maskPasswords', 'redactHeaders', 'redactQuery', 'exportMode'].forEach((id) => {
  $(id).addEventListener('change', async () => {
    const redaction = {
      maskPasswords: $('maskPasswords').checked,
      redactHeaders: $('redactHeaders').checked,
      redactQuery: $('redactQuery').checked
    };
    await send({ type: 'set_discovery_mode', redaction });
    await refreshStatus();
  });
});

if (isPanel) {
  $('openPanelBtn').style.display = 'none';
  document.title = 'Browser Parrot Controls';
}

refreshStatus();
setInterval(refreshStatus, 1200);
