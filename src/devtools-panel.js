const meta = document.getElementById('meta');
const timeline = document.getElementById('timeline');

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function renderStep(step) {
  const div = document.createElement('div');
  div.className = 'step';
  const sel = step.element?.selectors?.[0]?.value || '(no selector)';
  div.innerHTML = `
    <div><strong>${step.action}</strong> @ ${new Date(step.ts).toLocaleTimeString()}</div>
    <div>selector: <code>${sel}</code></div>
    <div>url: <code>${step.url_after || step.url_before || ''}</code></div>
    <div>network correlated: <strong>${(step.network || []).length}</strong></div>
  `;
  return div;
}

async function refresh() {
  const res = await send({ type: 'get_state' });
  if (!res?.ok) return;
  meta.textContent = `active=${res.active} steps=${res.steps.length} network=${res.networkCount}`;
  timeline.innerHTML = '';
  res.steps.slice(-100).reverse().forEach((s) => timeline.appendChild(renderStep(s)));
}

setInterval(refresh, 1000);
refresh();
