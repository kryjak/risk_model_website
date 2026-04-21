const fs = require('fs');

const baseline = JSON.parse(fs.readFileSync('public/data/monte_carlo/RM1_distributions_baseline.json', 'utf8'));
const sota = JSON.parse(fs.readFileSync('public/data/monte_carlo/RM1_distributions_sota.json', 'utf8'));
const saturated = JSON.parse(fs.readFileSync('public/data/monte_carlo/RM1_distributions_saturated.json', 'utf8'));

let problems = 0;

for (const node of baseline.metadata.nodes) {
  if (node.nodeType === 'probability') continue;
  const bLen = Array.isArray(baseline.samples[node.id]) ? baseline.samples[node.id].length : 'MISSING';
  const sLen = Array.isArray(sota.samples[node.id]) ? sota.samples[node.id].length : 'MISSING';
  const satLen = Array.isArray(saturated.samples[node.id]) ? saturated.samples[node.id].length : 'MISSING';
  if (bLen !== 1000 || sLen !== 1000 || satLen !== 1000) {
    console.log('PROBLEM:', node.id, node.name, '| b:', bLen, '| s:', sLen, '| sat:', satLen);
    problems++;
  }
}

// Check technique nodes
const techIds = ['RM1-tech-ia-1', 'RM1-tech-ia-2', 'RM1-tech-pe-1', 'RM1-tech-pe-2'];
console.log('Technique nodes in sota metadata:', sota.metadata.nodes.filter(n => n.parentTactic).length);
console.log('Technique nodes in sat metadata:', saturated.metadata.nodes.filter(n => n.parentTactic).length);
for (const id of techIds) {
  const sLen = Array.isArray(sota.samples[id]) ? sota.samples[id].length : 'MISSING';
  const satLen = Array.isArray(saturated.samples[id]) ? saturated.samples[id].length : 'MISSING';
  if (sLen !== 1000 || satLen !== 1000) {
    console.log('TECHNIQUE PROBLEM:', id, '| sota:', sLen, '| sat:', satLen);
    problems++;
  }
}

// Check for NaN/Infinity in samples
for (const [nodeId, samples] of Object.entries(baseline.samples)) {
  if (Array.isArray(samples) && typeof samples[0] === 'number') {
    const hasNaN = samples.some(v => isNaN(v) || !isFinite(v));
    if (hasNaN) {
      console.log('NaN/Inf in baseline:', nodeId);
      problems++;
    }
  }
}

for (const [nodeId, samples] of Object.entries(saturated.samples)) {
  if (Array.isArray(samples) && typeof samples[0] === 'number') {
    const hasNaN = samples.some(v => isNaN(v) || !isFinite(v));
    if (hasNaN) {
      console.log('NaN/Inf in saturated:', nodeId);
      problems++;
    }
  }
}

if (problems === 0) {
  console.log('All data checks passed - no problems found');
} else {
  console.log('Found', problems, 'problems');
}
