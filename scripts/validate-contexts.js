const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'contexts.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const allowed = new Set(['none', 'low', 'medium', 'high']);
const ids = new Set();
const errors = [];

if (!Array.isArray(data.contexts) || data.contexts.length > 50) errors.push('contexts must be an array of at most 50 items');
for (const [index, item] of data.contexts.entries()) {
  for (const key of ['id', 'group', 'label', 'context', 'influence', 'hypothesis', 'direction', 'tags']) {
    if (!(key in item)) errors.push(`context ${index} missing ${key}`);
  }
  if (ids.has(item.id)) errors.push(`duplicate id: ${item.id}`);
  ids.add(item.id);
  if (!allowed.has(item.influence)) errors.push(`invalid influence: ${item.id}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const groups = Object.groupBy ? Object.groupBy(data.contexts, item => item.group) : data.contexts.reduce((acc, item) => ((acc[item.group] ||= []).push(item), acc), {});
const bands = data.contexts.reduce((acc, item) => ((acc[item.influence] = (acc[item.influence] || 0) + 1), acc), {});
console.log(`Validated ${data.contexts.length} contexts across ${Object.keys(groups).length} groups.`);
console.log('Influence bands:', bands);
