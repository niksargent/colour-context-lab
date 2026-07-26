const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const RESULTS_DIR = path.join(DATA_DIR, 'results');
const CONTEXTS_FILE = path.join(DATA_DIR, 'contexts.json');
const activeRuns = new Map();

fs.mkdirSync(RESULTS_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > limit) reject(new Error('Request body is too large.'));
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('Request body must be valid JSON.')); }
    });
    req.on('error', reject);
  });
}

function loadContexts() {
  return JSON.parse(fs.readFileSync(CONTEXTS_FILE, 'utf8'));
}

function safeError(error) {
  const message = String(error?.message || error || 'Unknown error');
  return message.replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 500);
}

function runPaths(runId) {
  return {
    meta: path.join(RESULTS_DIR, `${runId}.json`),
    rows: path.join(RESULTS_DIR, `${runId}.jsonl`)
  };
}

function writeMeta(meta) {
  const { meta: target } = runPaths(meta.id);
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, target);
}

function appendRow(runId, row) {
  fs.appendFileSync(runPaths(runId).rows, `${JSON.stringify(row)}\n`, 'utf8');
}

function listRuns() {
  return fs.readdirSync(RESULTS_DIR)
    .filter(name => name.endsWith('.json') && !name.endsWith('.tmp'))
    .map(name => {
      try { return JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, name), 'utf8')); }
      catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function parseOutput(payload) {
  if (payload.output_text) return payload.output_text;
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) return content.text;
    }
  }
  return '';
}

async function callOpenAI({ apiKey, model, reasoningEffort, context, question, signal }) {
  const prompt = context.context
    ? `${context.context}\n\n${question}`
    : question;
  const body = {
    model,
    instructions: 'You are a participant in a behavioural experiment. Respond to the question from the supplied context. Choose one colour, not a list. Do not discuss the experiment or explain causal influences.',
    input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
    text: {
      verbosity: 'low',
      format: {
        type: 'json_schema',
        name: 'colour_preference',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            colour: { type: 'string', description: 'One concise common colour name.' },
            hex: { type: 'string', description: 'A best-fit six-digit hexadecimal sRGB value beginning with #.' }
          },
          required: ['colour', 'hex']
        }
      }
    },
    max_output_tokens: 220,
    store: false
  };
  if (reasoningEffort !== 'default') body.reasoning = { effort: reasoningEffort };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI returned HTTP ${response.status}.`);

  const raw = parseOutput(payload);
  let answer;
  try { answer = JSON.parse(raw); }
  catch { throw new Error(`The model returned an unreadable structured response: ${raw.slice(0, 120)}`); }

  return {
    responseId: payload.id,
    colour: String(answer.colour || '').trim(),
    hex: /^#[0-9a-f]{6}$/i.test(answer.hex || '') ? answer.hex.toUpperCase() : null,
    raw,
    usage: payload.usage || null
  };
}

function shuffled(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function validateRun(body) {
  const dataset = loadContexts();
  const byId = new Map(dataset.contexts.map(item => [item.id, item]));
  const contextIds = Array.isArray(body.contextIds) ? [...new Set(body.contextIds)] : [];
  const contexts = contextIds.map(id => byId.get(id)).filter(Boolean);
  const iterations = Number(body.iterations);
  const concurrency = Number(body.concurrency);
  const model = String(body.model || '').trim();
  const question = String(body.question || '').trim();
  const reasoningEffort = String(body.reasoningEffort || 'default');
  if (!String(body.apiKey || '').trim()) throw new Error('Enter an OpenAI API key.');
  if (!model || !/^[a-zA-Z0-9._:-]+$/.test(model)) throw new Error('Enter a valid model ID.');
  if (!contexts.length || contexts.length !== contextIds.length) throw new Error('Select at least one valid context.');
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100) throw new Error('Iterations must be between 1 and 100.');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error('Concurrency must be between 1 and 8.');
  if (!question || question.length > 300) throw new Error('Question must be between 1 and 300 characters.');
  if (!['default', 'none', 'low', 'medium', 'high'].includes(reasoningEffort)) throw new Error('Invalid reasoning effort.');
  if (contexts.length * iterations > 2000) throw new Error('A run is capped at 2,000 requests. Reduce contexts or iterations.');
  return { apiKey: String(body.apiKey).trim(), model, question, reasoningEffort, iterations, concurrency, contexts, randomize: body.randomize !== false };
}

async function executeRun(run, secret) {
  const jobs = [];
  for (const context of run.contexts) {
    for (let iteration = 1; iteration <= run.settings.iterations; iteration++) jobs.push({ context, iteration });
  }
  const queue = run.settings.randomize ? shuffled(jobs) : jobs;
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length && !run.stopped) {
      const jobIndex = cursor++;
      const job = queue[jobIndex];
      const controller = new AbortController();
      run.controllers.add(controller);
      const started = Date.now();
      let row;
      try {
        const output = await callOpenAI({
          apiKey: secret,
          model: run.settings.model,
          reasoningEffort: run.settings.reasoningEffort,
          context: job.context,
          question: run.settings.question,
          signal: controller.signal
        });
        row = {
          schemaVersion: 1,
          runId: run.id,
          observationId: crypto.randomUUID(),
          recordedAt: new Date().toISOString(),
          requestOrder: jobIndex + 1,
          iteration: job.iteration,
          model: run.settings.model,
          contextId: job.context.id,
          contextGroup: job.context.group,
          influence: job.context.influence,
          context: job.context.context,
          question: run.settings.question,
          status: 'ok',
          latencyMs: Date.now() - started,
          ...output
        };
        run.succeeded++;
      } catch (error) {
        row = {
          schemaVersion: 1,
          runId: run.id,
          observationId: crypto.randomUUID(),
          recordedAt: new Date().toISOString(),
          requestOrder: jobIndex + 1,
          iteration: job.iteration,
          model: run.settings.model,
          contextId: job.context.id,
          contextGroup: job.context.group,
          influence: job.context.influence,
          context: job.context.context,
          question: run.settings.question,
          status: run.stopped ? 'cancelled' : 'error',
          latencyMs: Date.now() - started,
          error: safeError(error)
        };
        if (row.status === 'error') run.failed++;
      } finally {
        run.controllers.delete(controller);
      }
      appendRow(run.id, row);
      run.completed++;
      run.updatedAt = new Date().toISOString();
    }
  }

  await Promise.all(Array.from({ length: Math.min(run.settings.concurrency, queue.length) }, worker));
  run.status = run.stopped ? 'stopped' : (run.failed === run.total ? 'failed' : 'completed');
  run.completedAt = new Date().toISOString();
  run.updatedAt = run.completedAt;
  delete run.controllers;
  delete run.contexts;
  delete run.stopped;
  writeMeta(run);
  activeRuns.delete(run.id);
}

function publicRun(run) {
  const { controllers, contexts, stopped, ...safe } = run;
  return safe;
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/contexts') return sendJson(res, 200, loadContexts());
  if (req.method === 'GET' && url.pathname === '/api/runs') {
    const persisted = listRuns();
    const active = [...activeRuns.values()].map(publicRun);
    return sendJson(res, 200, [...active, ...persisted.filter(item => !activeRuns.has(item.id))]);
  }
  if (req.method === 'GET' && /^\/api\/runs\/[^/]+\/download$/.test(url.pathname)) {
    const id = url.pathname.split('/')[3];
    if (!/^[a-f0-9-]+$/i.test(id)) return sendJson(res, 400, { error: 'Invalid run ID.' });
    const target = runPaths(id).rows;
    if (!fs.existsSync(target)) return sendJson(res, 404, { error: 'Run data not found.' });
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Content-Disposition': `attachment; filename="colour-run-${id}.jsonl"`, 'Cache-Control': 'no-store' });
    return fs.createReadStream(target).pipe(res);
  }  if (req.method === 'GET' && /^\/api\/runs\/[^/]+$/.test(url.pathname)) {
    const id = path.basename(url.pathname);
    if (!/^[a-f0-9-]+$/i.test(id)) return sendJson(res, 400, { error: 'Invalid run ID.' });
    const paths = runPaths(id);
    const live = activeRuns.get(id);
    let meta = live ? publicRun(live) : null;
    if (!meta && fs.existsSync(paths.meta)) meta = JSON.parse(fs.readFileSync(paths.meta, 'utf8'));
    if (!meta) return sendJson(res, 404, { error: 'Run not found.' });
    const observations = fs.existsSync(paths.rows)
      ? fs.readFileSync(paths.rows, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
      : [];
    return sendJson(res, 200, { meta, observations });
  }
  if (req.method === 'POST' && url.pathname === '/api/runs') {
    try {
      const input = validateRun(await readBody(req));
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const run = {
        schemaVersion: 1,
        id,
        status: 'running',
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        completed: 0,
        succeeded: 0,
        failed: 0,
        total: input.contexts.length * input.iterations,
        contextIds: input.contexts.map(item => item.id),
        datasetSchemaVersion: loadContexts().schemaVersion,
        promptFingerprint: crypto.createHash('sha256').update(JSON.stringify({ question: input.question, contexts: input.contexts.map(c => [c.id, c.context]) })).digest('hex').slice(0, 16),
        settings: { model: input.model, question: input.question, reasoningEffort: input.reasoningEffort, iterations: input.iterations, concurrency: input.concurrency, randomize: input.randomize },
        contexts: input.contexts,
        controllers: new Set(),
        stopped: false
      };
      fs.writeFileSync(runPaths(id).rows, '', { flag: 'wx' });
      writeMeta(publicRun(run));
      activeRuns.set(id, run);
      executeRun(run, input.apiKey).catch(error => {
        run.status = 'failed';
        run.fatalError = safeError(error);
        run.updatedAt = new Date().toISOString();
        writeMeta(publicRun(run));
        activeRuns.delete(id);
      });
      return sendJson(res, 202, { runId: id, total: run.total });
    } catch (error) { return sendJson(res, 400, { error: safeError(error) }); }
  }
  if (req.method === 'POST' && /^\/api\/runs\/[^/]+\/stop$/.test(url.pathname)) {
    const id = url.pathname.split('/')[3];
    const run = activeRuns.get(id);
    if (!run) return sendJson(res, 404, { error: 'No active run found.' });
    run.stopped = true;
    for (const controller of run.controllers) controller.abort();
    return sendJson(res, 202, { status: 'stopping' });
  }
  return sendJson(res, 404, { error: 'Not found.' });
}

function serveStatic(res, url) {
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const target = path.resolve(PUBLIC_DIR, `.${decodeURIComponent(requested)}`);
  if (!target.startsWith(`${path.resolve(PUBLIC_DIR)}${path.sep}`) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    return sendJson(res, 404, { error: 'Not found.' });
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(target).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(res, url);
  } catch (error) {
    if (!res.headersSent) sendJson(res, 500, { error: safeError(error) });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Colour Context Lab is running at http://localhost:${PORT}`);
  console.log(`Results are stored in ${RESULTS_DIR}`);
});
