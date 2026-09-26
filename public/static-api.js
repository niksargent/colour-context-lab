// Read-only replacement for the local server's data endpoints on GitHub Pages.
const staticData = { runs: null, contexts: null, rows: new Map() };
async function staticFetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load published data (${response.status})`);
  return response.json();
}
window.staticApi = async (path, options) => {
  if (options?.method && options.method !== 'GET') throw new Error('This published demo is read-only.');
  const url = new URL(path, location.origin);
  const runs = staticData.runs ||= await staticFetchJson('./data/runs.json');
  if (url.pathname === '/api/runs') return runs;
  if (url.pathname === '/api/contexts') return staticData.contexts ||= await staticFetchJson('./data/contexts.json');
  const runMatch = url.pathname.match(/^\/api\/runs\/([a-f0-9-]+)$/i);
  if (runMatch) {
    const meta = runs.find(run => run.id === runMatch[1]);
    if (!meta) throw new Error('Run not found.');
    const observations = staticData.rows.get(meta.id) || await staticFetchJson(`./data/results/${meta.id}.json`);
    staticData.rows.set(meta.id, observations);
    return { meta, observations };
  }
  if (url.pathname === '/api/analytics') {
    const source = runs.find(run => run.id === url.searchParams.get('runId'));
    if (!source) throw new Error('Source run not found.');
    const scope = url.searchParams.get('scope') === 'question' ? 'question' : 'run';
    const compatible = (scope === 'question' ? runs.filter(run => run.settings?.question === source.settings?.question) : [source]).filter(run => run.succeeded > 0);
    const model = url.searchParams.get('model') || 'all';
    const effort = url.searchParams.get('reasoningEffort') || 'all';
    const selected = compatible.filter(run => (model === 'all' || run.settings?.model === model) && (effort === 'all' || (run.settings?.reasoningEffort || 'default') === effort));
    const observations = (await Promise.all(selected.map(async run => {
      const rows = staticData.rows.get(run.id) || await staticFetchJson(`./data/results/${run.id}.json`);
      staticData.rows.set(run.id, rows);
      return rows.map(row => ({ ...row, modelRequested: row.modelRequested || row.model || run.settings?.model, reasoningEffortRequested: row.reasoningEffortRequested || run.settings?.reasoningEffort || 'default' }));
    }))).flat();
    return { sourceRunId: source.id, scope, question: source.settings?.question, models: [...new Set(compatible.map(run => run.settings?.model).filter(Boolean))].sort(), reasoningEfforts: [...new Set(compatible.map(run => run.settings?.reasoningEffort || 'default'))].sort(), runs: selected, observations };
  }
  throw new Error('This endpoint is unavailable in the published demo.');
};
