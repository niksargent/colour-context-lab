const fs = require('fs');

const source = fs.readFileSync('public/analytics.js', 'utf8');
const suspicious = source.split(/\r?\n/).filter(line => /(^|[^$])\$\([^)]*\)\.forEach/.test(line));
if (suspicious.length) {
  throw new Error(`Single-element selector used with forEach:\n${suspicious.join('\n')}`);
}

const requiredCollections = [
  '[data-atlas-scope]',
  '[data-compare]',
  '[data-resolution]',
  '[data-map-mode]',
  '[data-field]',
  '[data-quadrant-context]',
  '[data-comparison-context]'
];
for (const selector of requiredCollections) {
  if (!source.includes(`$$('${selector}')`)) throw new Error(`Missing collection selector: ${selector}`);
}

for (const renderer of ['renderInfluenceScatter', 'renderFamilyDiversity', 'renderConsistency', 'renderPerceptualField']) {
  if (!source.includes(`function ${renderer}`)) throw new Error(`Missing Atlas renderer: ${renderer}`);
}

console.log(`Validated Atlas event collections and ${requiredCollections.length} interaction selectors.`);