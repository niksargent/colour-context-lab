const state = {
  dataset: null,
  selected: new Set(),
  runs: [],
  currentRunId: null,
  currentRun: null,
  distributionMode: 'all',
  polling: null,
  band: 'all',
  search: ''
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const GROUP_COLOURS = ['#0758E8','#F04438','#18A66A','#F2B91D','#8B5CF6','#F472B6','#12A7A1','#FA7A22'];
const PRESET = ['baseline-empty','baseline-helpful','name-amara','name-haruto','country-finland','country-brazil','persona-architect','persona-gardener','environment-office','environment-coast','memory-routine','memory-storm','activity-tax','activity-swim','weather-humid','weather-autumn','semantic-balance','semantic-urgency'];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function toast(message, error = false) {
  const el = $('#toast');
  el.textContent = message;
  el.style.borderLeftColor = error ? 'var(--red)' : 'var(--yellow)';
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3300);
}

async function api(path, options) {
  if (window.staticApi) return window.staticApi(path, options);
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function showView(name) {
  $$('.view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
  $$('.nav-link').forEach(link => link.classList.toggle('active', link.dataset.view === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'results') refreshRuns();
}

function groups() {
  return state.dataset.contexts.reduce((acc, item) => ((acc[item.group] ||= []).push(item), acc), {});
}

function renderGroupPicker() {
  $('#group-picker').innerHTML = Object.entries(groups()).map(([name, items], index) => {
    const checked = items.every(item => state.selected.has(item.id));
    const partial = !checked && items.some(item => state.selected.has(item.id));
    return `<label class="group-option ${checked || partial ? 'active' : ''}" style="--group-colour:${GROUP_COLOURS[index]}">
      <input type="checkbox" data-group="${name}" ${checked ? 'checked' : ''} ${partial ? 'data-partial="true"' : ''}>
      <i></i><span>${escapeHtml(name)}<small>${items.length} contexts · ${partial ? 'some selected' : checked ? 'all selected' : 'none selected'}</small></span>
    </label>`;
  }).join('');
  $$('[data-partial="true"]').forEach(input => { input.indeterminate = true; });
  $$('[data-group]').forEach(input => input.addEventListener('change', () => {
    for (const item of groups()[input.dataset.group]) input.checked ? state.selected.add(item.id) : state.selected.delete(item.id);
    syncSelection();
  }));
}

function syncSelection() {
  const iterations = Math.max(1, Number($('#iterations').value) || 1);
  const total = state.selected.size * iterations;
  $('#selected-count').textContent = state.selected.size;
  $('#request-total').textContent = total.toLocaleString();
  $('#run-button').disabled = !state.selected.size;
  const warning = $('#run-warning');
  warning.classList.toggle('expensive', total > 250);
  warning.textContent = !state.selected.size ? 'Select contexts to calculate run size.' : total > 250 ? `Large run: ${total.toLocaleString()} paid API requests. Consider a smaller pilot.` : `${iterations} independent observation${iterations === 1 ? '' : 's'} × ${state.selected.size} context${state.selected.size === 1 ? '' : 's'}.`;
  renderGroupPicker();
  renderContextTable();
}

function renderProfiles() {
  const bandCounts = state.dataset.contexts.reduce((acc, item) => ((acc[item.influence] = (acc[item.influence] || 0) + 1), acc), {});
  const max = Math.max(...Object.values(bandCounts));
  $('#profile-grid').innerHTML = `<article class="profile-card primary"><span>Total contexts</span><strong>${state.dataset.contexts.length}</strong><small>${Object.keys(groups()).length} families · capped below 50</small><div class="mini-bars">${Object.values(bandCounts).map(count => `<i style="height:${Math.round(count/max*100)}%"></i>`).join('')}</div></article>` +
    ['none','low','medium','high'].map(band => `<article class="profile-card"><span>${band} influence</span><strong>${bandCounts[band] || 0}</strong><small>${Math.round((bandCounts[band] || 0)/state.dataset.contexts.length*100)}% of dataset</small></article>`).join('');
}

function renderContextTable() {
  if (!state.dataset) return;
  const query = state.search.toLowerCase();
  const rows = state.dataset.contexts.filter(item => {
    const matchesBand = state.band === 'all' || item.influence === state.band;
    const haystack = [item.label,item.context,item.group,item.hypothesis,...item.tags].join(' ').toLowerCase();
    return matchesBand && haystack.includes(query);
  });
  $('#context-table-body').innerHTML = rows.map(item => `<tr>
    <td><input class="row-check" type="checkbox" data-context-id="${item.id}" ${state.selected.has(item.id) ? 'checked' : ''} aria-label="Use ${escapeHtml(item.label)}"></td>
    <td><div class="context-name">${escapeHtml(item.label)}</div><div class="context-copy">${escapeHtml(item.context || '∅ Empty control — no context supplied')}</div></td>
    <td><span class="family-tag">${escapeHtml(item.group)}</span></td>
    <td><span class="band band-${item.influence}"><i></i>${item.influence}</span></td>
    <td><div class="context-copy">${escapeHtml(item.hypothesis)}${item.direction.length ? `<br><small>Expected: ${item.direction.map(escapeHtml).join(', ')}</small>` : ''}</div></td>
  </tr>`).join('') || `<tr><td colspan="5">No contexts match this filter.</td></tr>`;
  $$('[data-context-id]').forEach(input => input.addEventListener('change', () => {
    input.checked ? state.selected.add(input.dataset.contextId) : state.selected.delete(input.dataset.contextId);
    syncSelection();
  }));
}

function normaliseColour(value) {
  let colour = String(value || 'unknown').toLowerCase().trim().replace(/gray/g, 'grey').replace(/\s+/g, ' ');
  const aliases = { 'navy blue':'navy', 'sky blue':'light blue', 'forest green':'dark green', 'turquoise blue':'turquoise', 'golden yellow':'gold', 'deep purple':'purple', 'royal blue':'blue' };
  return aliases[colour] || colour;
}

function colourHex(name, supplied) {
  if (/^#[0-9a-f]{6}$/i.test(supplied || '')) return supplied;
  const map = {blue:'#1464f4',navy:'#162c63','light blue':'#67b7ed',red:'#f04438',green:'#18a66a','dark green':'#176b45',yellow:'#ffd72e',orange:'#fa7a22',purple:'#8b5cf6',pink:'#f472b6',black:'#181c20',white:'#f7f7f2',grey:'#9aa3aa',brown:'#8b5a37',beige:'#dcccae',teal:'#12a7a1',turquoise:'#22c4bf',gold:'#d9a514'};
  return map[name] || '#bfc5cb';
}

function colourFamily(name) {
  if (/blue|navy|azure|cyan|teal|turquoise/.test(name)) return 'blue';
  if (/red|orange|pink|coral|scarlet|crimson|maroon/.test(name)) return 'red';
  if (/green|lime|olive|emerald/.test(name)) return 'green';
  return 'other';
}

function distribution(rows) {
  return rows.reduce((acc, row) => {
    const colour = normaliseColour(row.colour);
    acc[colour] = (acc[colour] || 0) + 1;
    return acc;
  }, {});
}

function distributionRows(rows) {
  if (state.distributionMode === 'without-baseline') return rows.filter(row => row.contextGroup !== 'baseline');
  if (state.distributionMode === 'baseline-only') return rows.filter(row => row.contextGroup === 'baseline');
  return rows;
}

function renderDistribution(ok) {
  const baselineCount = ok.filter(row => row.contextGroup === 'baseline').length;
  const filtered = distributionRows(ok);
  const sorted = Object.entries(distribution(filtered)).sort((a,b) => b[1]-a[1]);
  const titles = { all:'Overall colour choices', 'without-baseline':'Colour choices without baseline', 'baseline-only':'Baseline colour choices' };
  $('#distribution-title').textContent = titles[state.distributionMode];
  $('#dist-count-all').textContent = ok.length;
  $('#dist-count-without').textContent = ok.length - baselineCount;
  $('#dist-count-baseline').textContent = baselineCount;
  $$('[data-distribution]').forEach(button => button.classList.toggle('active', button.dataset.distribution === state.distributionMode));
  const max = Math.max(1, ...sorted.map(([,count]) => count));
  $('#colour-bars').innerHTML = sorted.slice(0,10).map(([name,count]) => {
    const sample = filtered.find(row => normaliseColour(row.colour) === name);
    const hex = colourHex(name, sample?.hex);
    return `<div class="colour-row"><span class="colour-label"><i class="swatch" style="background:${hex}"></i>${escapeHtml(name)}</span><span class="bar-track"><i style="width:${count/max*100}%;background:${hex}"></i></span><span class="colour-value">${count} · ${Math.round(count/filtered.length*100)}%</span></div>`;
  }).join('') || `<p class="context-copy">${state.distributionMode === 'baseline-only' ? 'This run contains no successful baseline observations.' : 'Waiting for successful observations…'}</p>`;
}

function totalVariation(aRows, bRows) {
  if (!aRows.length || !bRows.length) return null;
  const a = distribution(aRows), b = distribution(bRows);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].reduce((sum, key) => sum + Math.abs((a[key] || 0)/aRows.length - (b[key] || 0)/bRows.length), 0) / 2;
}

function renderResults(payload) {
  state.currentRun = payload;
  const meta = payload.meta;
  const ok = payload.observations.filter(row => row.status === 'ok');
  const errors = payload.observations.filter(row => row.status !== 'ok');
  $('#empty-results').classList.add('hidden');
  $('#results-dashboard').classList.remove('hidden');
  const dist = distribution(ok);
  const sorted = Object.entries(dist).sort((a,b) => b[1]-a[1]);
  const latencies = ok.map(row => row.latencyMs).sort((a,b) => a-b);
  const median = latencies.length ? latencies[Math.floor(latencies.length/2)] : null;
  $('#metric-observations').textContent = `${ok.length}/${meta.total}`;
  $('#metric-status').textContent = meta.status;
  $('#metric-colours').textContent = sorted.length;
  $('#metric-top').textContent = sorted[0]?.[0] || '—';
  $('#metric-top-share').textContent = sorted.length ? `${Math.round(sorted[0][1]/ok.length*100)}% of successful answers` : '—';
  $('#metric-latency').textContent = median == null ? '—' : median >= 1000 ? `${(median/1000).toFixed(1)}s` : `${median}ms`;
  $('#error-count').textContent = errors.length ? `${errors.length} error${errors.length === 1 ? '' : 's'}` : 'No errors';

  renderDistribution(ok);

  const baseline = ok.filter(row => row.contextGroup === 'baseline');
  const groupNames = Object.keys(groups());
  const effects = groupNames.map(group => ({ group, value: group === 'baseline' ? 0 : totalVariation(ok.filter(row => row.contextGroup === group), baseline) })).filter(item => item.value != null).sort((a,b) => b.value-a.value);
  $('#effect-chart').innerHTML = baseline.length ? effects.map(item => `<div class="effect-row"><span>${escapeHtml(item.group)}</span><span class="effect-track"><i style="width:${item.value*100}%"></i></span><b>${item.value.toFixed(2)}</b></div>`).join('') : '<p class="context-copy">Include at least one baseline context to calculate total variation distance.</p>';

  $('#family-chart').innerHTML = groupNames.map(group => {
    const rows = ok.filter(row => row.contextGroup === group);
    const counts = rows.reduce((acc,row) => ((acc[colourFamily(normaliseColour(row.colour))]++),acc), {blue:0,red:0,green:0,other:0});
    return `<div class="family-column"><div class="stack">${['blue','red','green','other'].map(key => `<i class="${key}" style="height:${rows.length ? counts[key]/rows.length*100 : 0}%" title="${key}: ${counts[key]}"></i>`).join('')}</div><span>${escapeHtml(group)}<br>${rows.length} votes</span></div>`;
  }).join('');

  $('#raw-results').innerHTML = [...payload.observations].reverse().slice(0,100).map(row => {
    const name = normaliseColour(row.colour);
    return `<tr><td>${row.requestOrder}</td><td>${escapeHtml(row.contextId)}</td><td class="answer-cell">${row.status === 'ok' ? `<i class="swatch" style="background:${colourHex(name,row.hex)}"></i>${escapeHtml(name)}` : escapeHtml(row.error || '—')}</td><td>${escapeHtml(row.hex || '—')}</td><td>${row.latencyMs}ms</td><td class="status-${row.status}">${row.status}</td></tr>`;
  }).join('');
  $('#download-run').onclick = () => { window.location.href = window.staticApi ? `./data/results/${meta.id}.jsonl` : `/api/runs/${meta.id}/download`; };
}
async function loadRun(id, quiet = false) {
  if (!id) return;
  try {
    const payload = await api(`/api/runs/${id}`);
    renderResults(payload);
    if (payload.meta.status === 'running') showLive(payload.meta);
    else if (state.currentRunId === id) finishLive(payload.meta);
  } catch (error) { if (!quiet) toast(error.message, true); }
}

function showLive(meta) {
  $('#live-panel').classList.remove('hidden');
  $('#live-title').textContent = `Collecting ${meta.settings.model} observations`;
  const pct = meta.total ? meta.completed/meta.total*100 : 0;
  $('#progress-bar').style.width = `${pct}%`;
  $('#progress-label').textContent = `${meta.completed} / ${meta.total}`;
}

function finishLive(meta) {
  const wasLive = !$('#live-panel').classList.contains('hidden') || state.polling !== null;
  if (!wasLive) return;
  toast(`Run ${meta.status}: ${meta.succeeded} successful, ${meta.failed} failed.`);
  $('#live-panel').classList.add('hidden');
  clearInterval(state.polling);
  state.polling = null;
  refreshRuns();
}

async function refreshRuns() {
  try {
    state.runs = await api('/api/runs');
    const select = $('#run-select');
    const previous = state.currentRunId || select.value;
    select.innerHTML = state.runs.length ? state.runs.map(run => `<option value="${run.id}">${new Date(run.createdAt).toLocaleString()} · ${escapeHtml(run.settings.model)} · ${run.status}</option>`).join('') : '<option value="">No runs yet</option>';
    const target = state.runs.some(run => run.id === previous) ? previous : state.runs[0]?.id;
    if (target) { select.value = target; state.currentRunId = target; await loadRun(target, true); }
  } catch (error) { toast(error.message, true); }
}

async function startRun() {
  const apiKey = $('#api-key').value.trim();
  const model = $('#model-select').value === 'custom' ? $('#custom-model').value.trim() : $('#model-select').value;
  const payload = { apiKey, model, reasoningEffort: $('#reasoning-effort').value, iterations: Number($('#iterations').value), concurrency: Number($('#concurrency').value), question: $('#question').value.trim(), randomize: $('#randomize').checked, contextIds: [...state.selected] };
  if (!apiKey) return toast('Enter your OpenAI API key to begin.', true);
  if (!model) return toast('Enter a model ID.', true);
  $('#run-button').disabled = true;
  $('#run-button span').textContent = 'Starting…';
  try {
    const result = await api('/api/runs', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    state.currentRunId = result.runId;
    showLive({ id:result.runId, total:result.total, completed:0, settings:{model} });
    toast(`Run started: ${result.total} independent requests.`);
    clearInterval(state.polling);
    state.polling = setInterval(() => loadRun(result.runId, true), 900);
    await refreshRuns();
  } catch (error) { toast(error.message, true); }
  finally { $('#run-button').disabled = !state.selected.size; $('#run-button span').textContent = 'Run experiment'; }
}

function bindEvents() {
  $$('.nav-link').forEach(link => link.addEventListener('click', () => showView(link.dataset.view)));
  $$('[data-go]').forEach(button => button.addEventListener('click', () => showView(button.dataset.go)));
  $('#open-contexts').addEventListener('click', () => showView('contexts'));
  $('#help-button').addEventListener('click', () => $('#about-dialog').showModal());
  $('.dialog-close').addEventListener('click', () => $('#about-dialog').close());
  $('#toggle-key').addEventListener('click', () => { const input=$('#api-key'); input.type=input.type==='password'?'text':'password'; $('#toggle-key').textContent=input.type==='password'?'Show':'Hide'; });
  $('#model-select').addEventListener('change', () => $('#custom-model').classList.toggle('hidden', $('#model-select').value !== 'custom'));
  $$('[data-step]').forEach(button => button.addEventListener('click', () => { const input=$('#iterations'); input.value=Math.min(100,Math.max(1,Number(input.value)+Number(button.dataset.step))); syncSelection(); }));
  $('#iterations').addEventListener('input', syncSelection);
  $('#balanced-preset').addEventListener('click', () => { state.selected = new Set(PRESET); syncSelection(); });
  $('#select-all').addEventListener('click', () => { state.selected = new Set(state.dataset.contexts.map(item=>item.id)); syncSelection(); });
  $('#clear-all').addEventListener('click', () => { state.selected.clear(); syncSelection(); });
  $('#context-search').addEventListener('input', event => { state.search=event.target.value; renderContextTable(); });
  $$('#influence-filters button').forEach(button => button.addEventListener('click', () => { state.band=button.dataset.band; $$('#influence-filters button').forEach(el=>el.classList.toggle('active',el===button)); renderContextTable(); }));
  $('#run-button').addEventListener('click', startRun);
  $('#stop-button').addEventListener('click', async () => { try { await api(`/api/runs/${state.currentRunId}/stop`,{method:'POST'}); toast('Stopping after in-flight requests finish…'); } catch(error){toast(error.message,true);} });
  $('#run-select').addEventListener('change', event => { state.currentRunId=event.target.value; loadRun(event.target.value); });
  $$('[data-distribution]').forEach(button => button.addEventListener('click', () => {
    state.distributionMode = button.dataset.distribution;
    if (state.currentRun) renderDistribution(state.currentRun.observations.filter(row => row.status === 'ok'));
  }));
}

async function init() {
  try {
    state.dataset = await api('/api/contexts');
    $('#context-count-pill').textContent = state.dataset.contexts.length;
    $('#hero-contexts').textContent = state.dataset.contexts.length;
    state.selected = new Set(PRESET);
    renderProfiles();
    renderContextTable();
    syncSelection();
    bindEvents();
    await refreshRuns();
  } catch (error) { toast(`Could not load the lab: ${error.message}`, true); }
}

init().then(() => {
  if (window.staticApi) {
    showView('analytics');
    initialiseAtlas();
  }
});
