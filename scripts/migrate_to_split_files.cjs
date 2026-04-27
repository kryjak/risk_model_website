#!/usr/bin/env node
/**
 * Migration script: Split monolithic Monte Carlo JSON files into
 * rationales / percentiles / samples.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const MC_DIR = path.join(DATA_DIR, 'monte_carlo');

// Read current index
const indexPath = path.join(DATA_DIR, 'risk_models_index.json');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

// Create output directories
for (const dir of ['rationales', 'percentiles', 'samples']) {
  fs.mkdirSync(path.join(DATA_DIR, dir), { recursive: true });
}

function getPercentiles(samples, percentiles = [5, 50, 95]) {
  if (samples.length === 0) return percentiles.map(() => 0);
  const sorted = [...samples].sort((a, b) => a - b);
  return percentiles.map(p => {
    const idx = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[idx];
  });
}

const newModels = [];

for (const model of index.models) {
  const baselinePath = path.join(DATA_DIR, model.baselineFile);
  if (!fs.existsSync(baselinePath)) {
    console.log(`Skipping ${model.id} (no source files)`);
    continue;
  }
  console.log(`Processing ${model.id}...`);

  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const sota = JSON.parse(fs.readFileSync(path.join(DATA_DIR, model.sotaFile), 'utf8'));
  const saturated = JSON.parse(fs.readFileSync(path.join(DATA_DIR, model.saturatedFile), 'utf8'));

  // Build node lookup for SOTA and saturated descriptions
  const sotaNodeMap = {};
  for (const n of sota.metadata.nodes) {
    sotaNodeMap[n.id] = n;
  }
  const saturatedNodeMap = {};
  for (const n of saturated.metadata.nodes) {
    saturatedNodeMap[n.id] = n;
  }

  // --- Rationales ---
  const rationaleNodes = [];
  for (const node of baseline.metadata.nodes) {
    if (node.nodeType === 'probability') continue;

    const rNode = {
      id: node.id,
      name: node.name,
      nodeType: node.nodeType,
    };
    if (node.unit) rNode.unit = node.unit;
    if (node.parentTactic) rNode.parentTactic = node.parentTactic;
    if (node.combinationMode) rNode.combinationMode = node.combinationMode;

    // Use description from each scenario file
    rNode.baselineRationale = node.description || '';
    rNode.sotaRationale = sotaNodeMap[node.id]?.description || node.description || '';
    rNode.saturatedRationale = saturatedNodeMap[node.id]?.description || node.description || '';

    rationaleNodes.push(rNode);
  }

  const rationalesFile = `rationales/${model.id}_rationales.json`;
  fs.writeFileSync(
    path.join(DATA_DIR, rationalesFile),
    JSON.stringify({
      modelId: model.id,
      modelDescription: baseline.modelDescription || model.description,
      benchmarkMappings: baseline.benchmarkMappings || undefined,
      nodes: rationaleNodes,
    }, null, 2)
  );

  // --- Percentiles ---
  const percentileNodes = {};
  for (const node of baseline.metadata.nodes) {
    if (node.nodeType === 'probability') continue;

    const bSamples = (baseline.samples[node.id] || []).map(Number);
    const sSamples = (sota.samples[node.id] || []).map(Number);
    const satSamples = (saturated.samples[node.id] || []).map(Number);

    const [bp5, bp50, bp95] = getPercentiles(bSamples);
    const [sp5, sp50, sp95] = getPercentiles(sSamples);
    const [satp5, satp50, satp95] = getPercentiles(satSamples);

    percentileNodes[node.id] = {
      baseline: { p5: bp5, p50: bp50, p95: bp95 },
      sota: { p5: sp5, p50: sp50, p95: sp95 },
      saturated: { p5: satp5, p50: satp50, p95: satp95 },
    };
  }

  const percentilesFile = `percentiles/${model.id}_percentiles.json`;
  fs.writeFileSync(
    path.join(DATA_DIR, percentilesFile),
    JSON.stringify({
      modelId: model.id,
      nodes: percentileNodes,
    }, null, 2)
  );

  // --- Samples (one per scenario, numeric only) ---
  const scenarioFiles = {};
  for (const [scenario, data] of [['baseline', baseline], ['sota', sota], ['saturated', saturated]]) {
    const sampleMap = {};
    for (const node of baseline.metadata.nodes) {
      if (node.nodeType === 'probability') continue;
      const raw = data.samples[node.id];
      if (raw) {
        sampleMap[node.id] = raw.map(Number);
      }
    }

    const samplesFile = `samples/${model.id}_samples_${scenario}.json`;
    fs.writeFileSync(
      path.join(DATA_DIR, samplesFile),
      JSON.stringify({
        modelId: model.id,
        scenario,
        samples: sampleMap,
      })  // No pretty print to keep size down
    );
    scenarioFiles[scenario] = samplesFile;
  }

  // --- Update index entry ---
  newModels.push({
    id: model.id,
    name: model.name,
    description: model.description,
    rationalesFile,
    percentilesFile,
    baselineSamplesFile: scenarioFiles.baseline,
    sotaSamplesFile: scenarioFiles.sota,
    saturatedSamplesFile: scenarioFiles.saturated,
  });

  console.log(`  -> rationales, percentiles, 3 samples files`);
}

// Write new index
fs.writeFileSync(
  indexPath,
  JSON.stringify({ models: newModels }, null, 2) + '\n'
);

console.log('\nDone! Updated risk_models_index.json');

// Show file sizes
for (const dir of ['rationales', 'percentiles', 'samples']) {
  const dirPath = path.join(DATA_DIR, dir);
  const files = fs.readdirSync(dirPath);
  for (const f of files) {
    const stat = fs.statSync(path.join(dirPath, f));
    console.log(`  ${dir}/${f}: ${(stat.size / 1024).toFixed(1)}KB`);
  }
}
