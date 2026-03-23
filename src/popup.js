const $ = (id) => document.getElementById(id);

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

async function refreshStatus() {
  const res = await send({ type: 'get_state' });
  if (!res?.ok) return;
  $('status').textContent = JSON.stringify({
    active: res.active,
    steps: res.steps?.length || 0,
    network: res.networkCount,
    redaction: res.redaction
  }, null, 2);
}

async function setMode(active) {
  const redaction = {
    maskPasswords: $('maskPasswords').checked,
    redactHeaders: $('redactHeaders').checked,
    redactQuery: $('redactQuery').checked
  };
  await send({ type: 'set_discovery_mode', active, redaction });
  await refreshStatus();
}

$('startBtn').addEventListener('click', () => setMode(true));
$('stopBtn').addEventListener('click', () => setMode(false));
$('clearBtn').addEventListener('click', async () => {
  await send({ type: 'clear_session' });
  await refreshStatus();
});
$('exportBtn').addEventListener('click', async () => {
  const res = await send({ type: 'export_session' });
  if (!res?.ok) return;
  downloadJson(`browser-parrot-${Date.now()}.json`, res);
});

['maskPasswords', 'redactHeaders', 'redactQuery'].forEach((id) => {
  $(id).addEventListener('change', async () => {
    const redaction = {
      maskPasswords: $('maskPasswords').checked,
      redactHeaders: $('redactHeaders').checked,
      redactQuery: $('redactQuery').checked
    };
    await send({ type: 'set_discovery_mode', active: undefined, redaction });
    await refreshStatus();
  });
});

refreshStatus();
