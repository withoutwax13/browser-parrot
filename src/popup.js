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

async function refreshStatus() {
  const res = await send({ type: 'get_state' });
  if (!res?.ok) return;
  $('maskPasswords').checked = !!res.redaction?.maskPasswords;
  $('redactHeaders').checked = !!res.redaction?.redactHeaders;
  $('redactQuery').checked = !!res.redaction?.redactQuery;
  setVisualState(!!res.active);

  const scenarios = Array.isArray(res.scenarios) ? res.scenarios : [];
  const latest = scenarios[scenarios.length - 1] || null;

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
    width: 420,
    height: 700,
    focused: true
  });
});

['maskPasswords', 'redactHeaders', 'redactQuery'].forEach((id) => {
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
