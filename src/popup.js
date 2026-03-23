const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const isPanel = params.get('panel') === '1';

let selectedScenarioId = null;

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


function downloadText(name, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
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

function fmt(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function humanStep(step) {
  if (!step) return 'step';
  if (step.type === 'navigate') return `navigate → ${step.url || ''}`;
  const selector = step?.selectors?.[0]?.[0] || 'element';
  if (step.type === 'change') return `change → ${selector} = ${step.value ?? ''}`;
  return `${step.type || 'click'} → ${selector}`;
}

function renderSteps(steps) {
  const ul = $('scenarioStepsList');
  ul.innerHTML = '';
  if (!steps.length) {
    const li = document.createElement('li');
    li.textContent = 'No steps yet.';
    ul.appendChild(li);
    return;
  }
  steps.forEach((step) => {
    const li = document.createElement('li');
    li.textContent = humanStep(step);
    ul.appendChild(li);
  });
  ul.scrollTop = ul.scrollHeight;
}

function renderScenarios(scenarios, activeId) {
  const box = $('scenarioList');
  box.innerHTML = '';

  if (!scenarios.length) {
    box.innerHTML = '<div class="scenarioEmpty">No scenarios yet.</div>';
    return;
  }

  scenarios.forEach((s, i) => {
    const item = document.createElement('button');
    item.className = 'scenarioItem';
    if (s.id === selectedScenarioId) item.classList.add('selected');

    const activeBadge = s.id === activeId ? ' • recording' : '';
    item.innerHTML = `
      <div class="scenarioTop">
        <span class="scenarioTitle">${s.title || `Scenario ${i + 1}`}</span>
        <span class="scenarioCount">${s.step_count} steps</span>
      </div>
      <div class="scenarioMetaLine">${fmt(s.started_at)}${activeBadge}</div>
    `;

    item.addEventListener('click', async () => {
      selectedScenarioId = s.id;
      await send({ type: 'select_scenario', scenarioId: s.id });
      await refreshStatus();
    });

    box.appendChild(item);
  });
}

function setMeta(s) {
  if (!s) {
    $('scenarioMeta').textContent = 'No scenario selected.';
    $('renameInput').value = '';
    renderSteps([]);
    return;
  }

  $('renameInput').value = s.title || '';

  const lines = [
    `Title: ${s.title}`,
    `Started: ${fmt(s.started_at)}`,
    `Stopped: ${fmt(s.stopped_at)}`,
    `Steps: ${s.step_count}`,
    `Network: ${s.network_count}`,
    s.rerun_of ? `Re-recorded from: ${s.rerun_of}` : ''
  ].filter(Boolean);
  $('scenarioMeta').textContent = lines.join(' | ');
  renderSteps(s.steps || []);
}

async function refreshStatus() {
  const res = await send({ type: 'get_state' });
  if (!res?.ok) return;

  $('maskPasswords').checked = !!res.redaction?.maskPasswords;
  $('redactHeaders').checked = !!res.redaction?.redactHeaders;
  $('redactQuery').checked = !!res.redaction?.redactQuery;
  setVisualState(!!res.active);

  const scenarios = Array.isArray(res.scenarios) ? res.scenarios : [];
  if (!selectedScenarioId && scenarios.length) {
    selectedScenarioId = res.currentScenarioId || scenarios[scenarios.length - 1].id;
  }
  if (selectedScenarioId && !scenarios.find((s) => s.id === selectedScenarioId)) {
    selectedScenarioId = scenarios.length ? scenarios[scenarios.length - 1].id : null;
  }

  renderScenarios(scenarios, res.currentScenarioId);
  const selected = scenarios.find((s) => s.id === selectedScenarioId) || null;
  setMeta(selected);

  $('status').textContent = `active: ${!!res.active} | scenarios: ${scenarios.length} | current: ${res.currentScenarioId || '-'}`;
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
  selectedScenarioId = null;
  await refreshStatus();
});

$('renameBtn').addEventListener('click', async () => {
  if (!selectedScenarioId) return;
  await send({ type: 'rename_scenario', scenarioId: selectedScenarioId, title: $('renameInput').value.trim() });
  await refreshStatus();
});

$('moveUpBtn').addEventListener('click', async () => {
  if (!selectedScenarioId) return;
  await send({ type: 'move_scenario', scenarioId: selectedScenarioId, direction: 'up' });
  await refreshStatus();
});

$('moveDownBtn').addEventListener('click', async () => {
  if (!selectedScenarioId) return;
  await send({ type: 'move_scenario', scenarioId: selectedScenarioId, direction: 'down' });
  await refreshStatus();
});

$('exportBtn').addEventListener('click', async () => {
  const res = await send({ type: 'export_session' });
  if (!res?.ok) return;
  downloadJson(`browser-parrot-all-scenarios-${Date.now()}.json`, res);
});


$('exportCypressBtn').addEventListener('click', async () => {
  const res = await send({ type: 'export_cypress' });
  if (!res?.ok) return;
  downloadText(`browser-parrot-all-scenarios-${Date.now()}.cy.js`, res.script || '');
});

$('exportSelectedBtn').addEventListener('click', async () => {
  if (!selectedScenarioId) return;
  const res = await send({ type: 'export_scenario', scenarioId: selectedScenarioId });
  if (!res?.ok) return;
  const safeTitle = (res.title || 'scenario').replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();
  downloadJson(`browser-parrot-${safeTitle}-${Date.now()}.json`, res);
});


$('exportSelectedCypressBtn').addEventListener('click', async () => {
  if (!selectedScenarioId) return;
  const res = await send({ type: 'export_cypress_scenario', scenarioId: selectedScenarioId });
  if (!res?.ok) return;
  const safeTitle = (res.title || 'scenario').replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();
  downloadText(`browser-parrot-${safeTitle}-${Date.now()}.cy.js`, res.script || '');
});

$('deleteBtn').addEventListener('click', async () => {
  if (!selectedScenarioId) return;
  await send({ type: 'delete_scenario', scenarioId: selectedScenarioId });
  await refreshStatus();
});

$('rerecordBtn').addEventListener('click', async () => {
  if (!selectedScenarioId) return;
  await send({
    type: 'start_rerecord',
    scenarioId: selectedScenarioId,
    replaceOriginal: !!$('replaceOnRerecord').checked
  });
  await refreshStatus();
});

$('openPanelBtn').addEventListener('click', async () => {
  await chrome.windows.create({
    url: chrome.runtime.getURL('src/popup.html?panel=1'),
    type: 'popup',
    width: 500,
    height: 900,
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
