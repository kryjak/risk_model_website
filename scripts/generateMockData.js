/**
 * Generate mock Monte Carlo simulation data for testing
 * Run with: node scripts/generateMockData.js
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Seeded random number generator for reproducibility
function seededRandom(seed) {
  let state = seed;
  return function() {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

// Generate samples from a Beta distribution (approximation using normal)
function generateBetaSamples(random, alpha, beta, n = 1000) {
  const samples = [];
  const mean = alpha / (alpha + beta);
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  const stdDev = Math.sqrt(variance);
  
  for (let i = 0; i < n; i++) {
    // Box-Muller transform for normal distribution
    const u1 = random();
    const u2 = random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    let sample = mean + z * stdDev;
    // Clamp to [0, 1]
    sample = Math.max(0.001, Math.min(0.999, sample));
    samples.push(sample);
  }
  return samples;
}

// Generate samples from a log-normal distribution (for monetary values)
function generateLogNormalSamples(random, logMean, logStdDev, n = 1000) {
  const samples = [];
  for (let i = 0; i < n; i++) {
    const u1 = random();
    const u2 = random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const sample = Math.exp(logMean + z * logStdDev);
    samples.push(sample);
  }
  return samples;
}

// Generate categorical samples
function generateCategoricalSamples(random, states, n = 1000) {
  const samples = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(random() * states.length);
    samples.push(states[idx]);
  }
  return samples;
}

function generateMockData(modelId, modelName, modelDescription, seed, upliftFactor = 1.0) {
  const random = seededRandom(seed);
  
  // Define nodes
  const nodes = [
    // Probability nodes (discrete)
    {
      id: `${modelId}-prob-1`,
      name: 'CyBench',
      nodeType: 'probability',
      description: 'Cybersecurity benchmark category',
      position: { x: 100, y: 100 },
      parents: [],
      states: ['None', 'LootStash', 'Urgent', 'Flag Command', 'Primary Knowledge'],
      distributionType: 'discrete'
    },
    {
      id: `${modelId}-prob-2`,
      name: 'BountyBench',
      nodeType: 'probability',
      description: 'Bug bounty benchmark category',
      position: { x: 100, y: 200 },
      parents: [],
      states: ['Easy', 'Medium', 'Hard', 'Expert'],
      distributionType: 'discrete'
    },
    // Continuous nodes (Beta distributions)
    {
      id: `${modelId}-cont-1`,
      name: 'Reconnaissance',
      nodeType: 'continuous',
      description: 'Probability of successful reconnaissance phase',
      position: { x: 300, y: 100 },
      parents: [`${modelId}-prob-1`],
      distributionType: 'conditionalBeta'
    },
    {
      id: `${modelId}-cont-2`,
      name: 'Resource Development',
      nodeType: 'continuous',
      description: 'Probability of successful resource development',
      position: { x: 300, y: 200 },
      parents: [`${modelId}-prob-1`],
      distributionType: 'conditionalBeta'
    },
    {
      id: `${modelId}-cont-3`,
      name: 'Initial Access',
      nodeType: 'continuous',
      description: 'Probability of gaining initial access to target systems',
      position: { x: 500, y: 150 },
      parents: [`${modelId}-cont-1`, `${modelId}-cont-2`],
      distributionType: 'conditionalBeta'
    },
    {
      id: `${modelId}-cont-4`,
      name: 'Execution',
      nodeType: 'continuous',
      description: 'Probability of successful code execution',
      position: { x: 700, y: 100 },
      parents: [`${modelId}-cont-3`],
      distributionType: 'conditionalBeta'
    },
    {
      id: `${modelId}-cont-5`,
      name: 'Privilege Escalation',
      nodeType: 'continuous',
      description: 'Probability of escalating privileges',
      position: { x: 700, y: 200 },
      parents: [`${modelId}-cont-3`],
      distributionType: 'conditionalBeta'
    },
    {
      id: `${modelId}-cont-6`,
      name: 'Lateral Movement',
      nodeType: 'continuous',
      description: 'Probability of successful lateral movement',
      position: { x: 900, y: 150 },
      parents: [`${modelId}-cont-4`, `${modelId}-cont-5`],
      distributionType: 'conditionalBeta'
    },
    {
      id: `${modelId}-cont-7`,
      name: 'Collection',
      nodeType: 'continuous',
      description: 'Probability of successful data collection',
      position: { x: 1100, y: 100 },
      parents: [`${modelId}-cont-6`],
      distributionType: 'conditionalBeta'
    },
    {
      id: `${modelId}-cont-8`,
      name: 'Exfiltration',
      nodeType: 'continuous',
      description: 'Probability of successful data exfiltration',
      position: { x: 1100, y: 200 },
      parents: [`${modelId}-cont-6`, `${modelId}-cont-7`],
      distributionType: 'conditionalBeta'
    },
    {
      id: `${modelId}-cont-9`,
      name: 'Impact',
      nodeType: 'continuous',
      description: 'Probability of achieving intended impact',
      position: { x: 1300, y: 150 },
      parents: [`${modelId}-cont-7`, `${modelId}-cont-8`],
      distributionType: 'conditionalBeta'
    },
    // Quantity nodes
    {
      id: `${modelId}-qty-1`,
      name: 'Number of Actors',
      nodeType: 'quantity',
      description: 'Estimated number of threat actors',
      position: { x: 100, y: 400 },
      parents: [],
      unit: 'actors',
      computationMode: 'direct',
      distributionType: null
    },
    {
      id: `${modelId}-qty-2`,
      name: 'Number of Attempts per Actor',
      nodeType: 'quantity',
      description: 'Average attack attempts per actor per year',
      position: { x: 300, y: 400 },
      parents: [],
      unit: 'attempts / year',
      computationMode: 'direct',
      distributionType: null
    },
    {
      id: `${modelId}-qty-3`,
      name: 'Damage per Attack',
      nodeType: 'quantity',
      description: 'Estimated damage per successful attack',
      position: { x: 500, y: 400 },
      parents: [],
      unit: '$ / attack',
      computationMode: 'direct',
      distributionType: null
    },
    {
      id: `${modelId}-qty-4`,
      name: 'Successful Attack Rate',
      nodeType: 'quantity',
      description: 'Overall probability of attack success',
      position: { x: 700, y: 400 },
      parents: [`${modelId}-cont-9`],
      unit: '',
      computationMode: 'multiply',
      distributionType: null
    },
    {
      id: `${modelId}-qty-5`,
      name: 'Total Risk',
      nodeType: 'quantity',
      description: 'Expected annual loss from this threat scenario',
      position: { x: 900, y: 400 },
      parents: [`${modelId}-qty-1`, `${modelId}-qty-2`, `${modelId}-qty-3`, `${modelId}-qty-4`],
      unit: '$ / year',
      computationMode: 'multiply',
      distributionType: null
    }
  ];

  // Generate links from parent relationships
  const links = [];
  for (const node of nodes) {
    for (const parentId of node.parents) {
      links.push({
        source: parentId,
        target: node.id,
        linkType: 'probability',
        parameterName: null
      });
    }
  }

  // Generate samples
  const samples = {};
  const marginals = {};
  const marginalProbabilities = {};
  const statistics = {};

  for (const node of nodes) {
    if (node.nodeType === 'probability') {
      // Discrete samples
      samples[node.id] = generateCategoricalSamples(random, node.states);
      
      // Calculate marginals
      const counts = {};
      for (const state of node.states) counts[state] = 0;
      for (const sample of samples[node.id]) counts[sample]++;
      
      marginals[node.id] = {};
      marginalProbabilities[node.id] = {};
      for (const state of node.states) {
        marginals[node.id][state] = counts[state] / 1000;
        // Create array of probabilities (simplified - all same value)
        marginalProbabilities[node.id][state] = Array(1000).fill(marginals[node.id][state]);
      }
    }
    else if (node.nodeType === 'continuous') {
      // Beta distribution parameters (vary by node for realism)
      let alpha, beta;
      
      switch (node.name) {
        case 'Reconnaissance':
          alpha = 8 * upliftFactor; beta = 2;
          break;
        case 'Resource Development':
          alpha = 6 * upliftFactor; beta = 3;
          break;
        case 'Initial Access':
          alpha = 3 * upliftFactor; beta = 4;
          break;
        case 'Execution':
          alpha = 4 * upliftFactor; beta = 3;
          break;
        case 'Privilege Escalation':
          alpha = 2 * upliftFactor; beta = 4;
          break;
        case 'Lateral Movement':
          alpha = 2.5 * upliftFactor; beta = 5;
          break;
        case 'Collection':
          alpha = 5 * upliftFactor; beta = 3;
          break;
        case 'Exfiltration':
          alpha = 3 * upliftFactor; beta = 4;
          break;
        case 'Impact':
          alpha = 2 * upliftFactor; beta = 5;
          break;
        default:
          alpha = 3 * upliftFactor; beta = 4;
      }
      
      samples[node.id] = generateBetaSamples(random, alpha, beta);
      marginalProbabilities[node.id] = null;
      
      // Calculate statistics
      const samps = samples[node.id];
      const mean = samps.reduce((a, b) => a + b, 0) / samps.length;
      const variance = samps.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / samps.length;
      statistics[node.id] = { mean, variance, count: 1000 };
    }
    else if (node.nodeType === 'quantity') {
      // Different distributions for quantity nodes
      let samps;
      
      switch (node.name) {
        case 'Number of Actors':
          samps = generateLogNormalSamples(random, Math.log(50 * upliftFactor), 0.5);
          break;
        case 'Number of Attempts per Actor':
          samps = generateLogNormalSamples(random, Math.log(5 * upliftFactor), 0.4);
          break;
        case 'Damage per Attack':
          samps = generateLogNormalSamples(random, Math.log(5e6), 0.8);
          break;
        case 'Successful Attack Rate':
          // This should be product of probabilities, but we'll approximate
          samps = generateBetaSamples(random, 1.5 * upliftFactor, 10);
          break;
        case 'Total Risk':
          // Generate as log-normal with high variance
          samps = generateLogNormalSamples(random, Math.log(1e8 * upliftFactor), 1.0);
          break;
        default:
          samps = generateLogNormalSamples(random, Math.log(1000), 0.5);
      }
      
      samples[node.id] = samps;
      marginalProbabilities[node.id] = samps; // For quantity nodes, same as samples
    }
  }

  return {
    exportTimestamp: new Date().toISOString(),
    modelName,
    modelDescription,
    totalSamples: 1000,
    cancelled: false,
    completed: true,
    metadata: { nodes, links },
    samples,
    marginals,
    marginalProbabilities,
    statistics
  };
}

// Generate and save files
const outputDir = join(__dirname, '..', 'public', 'data', 'monte_carlo');

try {
  mkdirSync(outputDir, { recursive: true });
} catch (e) {
  // Directory may already exist
}

const models = [
  { id: 'RM1', name: 'OC4 + Infrastructure (small) + Disruption', desc: 'State-sponsored APT targeting regional power utilities...' },
  { id: 'RM2', name: 'OC3 + SME + Ransomware', desc: 'Cyber syndicate conducting ransomware attacks...' },
];

for (const model of models) {
  // Baseline (seed based on model ID)
  const baselineSeed = model.id.charCodeAt(2) * 1000;
  const baselineData = generateMockData(model.id, model.name, model.desc, baselineSeed, 1.0);
  writeFileSync(
    join(outputDir, `${model.id}_distributions_baseline.json`),
    JSON.stringify(baselineData, null, 2)
  );
  console.log(`Generated ${model.id}_distributions_baseline.json`);
  
  // Uplifted (higher uplift factor)
  const upliftedData = generateMockData(model.id, model.name + ' (AI-Uplifted)', model.desc, baselineSeed + 1, 1.25);
  writeFileSync(
    join(outputDir, `${model.id}_distributions_uplifted.json`),
    JSON.stringify(upliftedData, null, 2)
  );
  console.log(`Generated ${model.id}_distributions_uplifted.json`);
}

console.log('Mock data generation complete!');
