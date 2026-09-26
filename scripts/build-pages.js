const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'pages-dist');
const results = path.join(root, 'data', 'results');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'data', 'results'), { recursive: true });

for (const name of ['app.js', 'analytics.js', 'styles.css', 'analytics.css', 'static-api.js']) {
  fs.copyFileSync(path.join(root, 'public', name), path.join(out, name));
}
fs.copyFileSync(path.join(root, 'data', 'contexts.json'), path.join(out, 'data', 'contexts.json'));
fs.writeFileSync(path.join(out, '.nojekyll'), '');

const runs = fs.readdirSync(results).filter(name => name.endsWith('.json')).flatMap(name => {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(results, name), 'utf8'));
    const source = path.join(results, `${meta.id}.jsonl`);
    const rows = fs.existsSync(source) ? fs.readFileSync(source, 'utf8').split(/\r?\n/).filter(Boolean).flatMap(line => {
      try { return [JSON.parse(line)]; } catch { return []; }
    }) : [];
    const safe = { ...meta, completed: rows.length, succeeded: rows.filter(row => row.status === 'ok').length, failed: rows.filter(row => row.status === 'error').length };
    fs.writeFileSync(path.join(out, 'data', 'results', `${meta.id}.json`), JSON.stringify(rows));
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(out, 'data', 'results', `${meta.id}.jsonl`));
    return [safe];
  } catch { return []; }
}).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
fs.writeFileSync(path.join(out, 'data', 'runs.json'), JSON.stringify(runs));

let html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
html = html.replaceAll('href="/styles.css"', 'href="./styles.css"').replaceAll('href="/analytics.css"', 'href="./analytics.css"');
html = html.replace('src="/app.js"', 'src="./app.js"').replace('src="/analytics.js?v=6"', 'src="./analytics.js?v=6"');
html = html.replace('<script src="./app.js" defer></script>', '<script src="./static-api.js" defer></script>\n  <script src="./app.js" defer></script>');
html = html.replace('<button class="nav-link active" data-view="experiment">Experiment</button>', '');
html = html.replace('<span class="privacy-note"><span class="status-dot"></span> Local &amp; private</span>', '<span class="privacy-note"><span class="status-dot"></span> Published results · read-only</span>');
html = html.replace('Configure an experiment, then start a run.', 'Explore the published experiment data.');
html = html.replaceAll('<button data-go="experiment">Set up experiment</button>', '');
html = html.replace('href="/api/contexts"', 'href="./data/contexts.json"');
html = html.replace('Complete a run, then return here to explore its colour landscape.', 'Explore the colour landscape from published runs.');
html = html.replace('<style>', '<style>');
html = html.replace('</head>', '  <style>#view-experiment{display:none!important}</style>\n</head>');
html = html.replace('<section class="view active" id="view-experiment">', '<section class="view" id="view-experiment">');
html = html.replace('<section class="view" id="view-analytics">', '<section class="view active" id="view-analytics">');
html = html.replace('<button class="nav-link" data-view="analytics">', '<button class="nav-link active" data-view="analytics">');
html = html.replace('<p>Every observation is a brand-new Responses API call:', '<p>This published version shows completed experiments. Every observation was a brand-new Responses API call:');
html = html.replace('<li>Your API key is never included in either file.</li>', '<li>The published data contains no API keys.</li>');
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log(`Built Pages demo with ${runs.length} runs in ${out}`);
