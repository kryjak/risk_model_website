const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'public', 'data', 'monte_carlo');

// Generate saturated files by multiplying samples by ~1.25
['RM1', 'RM2'].forEach(model => {
  const sotaPath = path.join(dataDir, `${model}_distributions_sota.json`);
  const satPath = path.join(dataDir, `${model}_distributions_saturated.json`);

  const data = JSON.parse(fs.readFileSync(sotaPath, 'utf8'));

  // Update model name
  data.modelName = data.modelName.replace('(AI-Uplifted)', '(Saturated)').replace('(SOTA)', '(Saturated)');
  if (!data.modelName.includes('(Saturated)')) {
    data.modelName += ' (Saturated)';
  }

  // Multiply numeric samples by ~1.25 with some noise
  for (const [nodeId, samples] of Object.entries(data.samples)) {
    if (Array.isArray(samples) && samples.length > 0 && typeof samples[0] === 'number') {
      data.samples[nodeId] = samples.map(v => {
        const factor = 1.2 + (Math.random() * 0.1); // 1.2 to 1.3
        return v * factor;
      });
    }
  }

  fs.writeFileSync(satPath, JSON.stringify(data, null, 2));
  console.log(`Created: ${satPath}`);
});

// Update SOTA files - rename modelName
['RM1', 'RM2'].forEach(model => {
  const sotaPath = path.join(dataDir, `${model}_distributions_sota.json`);
  const data = JSON.parse(fs.readFileSync(sotaPath, 'utf8'));
  data.modelName = data.modelName.replace('(AI-Uplifted)', '(SOTA)');
  fs.writeFileSync(sotaPath, JSON.stringify(data, null, 2));
  console.log(`Updated SOTA: ${sotaPath}`);
});

// Add technique nodes and benchmark mappings to RM1 baseline and SOTA and saturated
['baseline', 'sota', 'saturated'].forEach(scenario => {
  const filePath = path.join(dataDir, `RM1_distributions_${scenario}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Add benchmark mappings
  data.benchmarkMappings = {
    "CyBench": ["Reconnaissance", "Initial Access", "Execution"],
    "BountyBench": ["Initial Access", "Privilege Escalation", "Defense Evasion"],
    "MITRE ATT&CK Evaluations": ["Persistence", "Lateral Movement", "Command and Control"],
    "NIST CSF": ["Number of Actors", "Total Damage per Incident", "Total Risk"]
  };

  // Update Number of Actors description to be longer (fixes bug #3)
  const actorsNode = data.metadata.nodes.find(n => n.name === 'Number of Actors');
  if (actorsNode) {
    actorsNode.description = "Estimated number of threat actors with sufficient capability and motivation to attempt this type of attack within a given year. This estimate accounts for the specific operational category, target sector attractiveness, and required technical sophistication. Higher values indicate a more broadly attempted attack vector with lower barriers to entry.";
  }

  // Add technique nodes for Initial Access
  const initialAccessNode = data.metadata.nodes.find(n => n.name === 'Initial Access');
  if (initialAccessNode) {
    // Check if techniques already exist
    const hasPhishing = data.metadata.nodes.some(n => n.name === 'Phishing');
    if (!hasPhishing) {
      // Get samples from Initial Access and split them into technique-level samples
      const iaSamples = data.samples[initialAccessNode.id];

      // Phishing technique
      const phishingNode = {
        id: 'RM1-tech-ia-1',
        name: 'Phishing',
        nodeType: 'continuous',
        description: 'Spear-phishing campaigns targeting utility employees with access to SCADA systems. Includes email, SMS, and social engineering variants tailored to the energy sector.',
        parentTactic: initialAccessNode.id,
        combinationMode: 'OR',
        position: { x: 350, y: 150 },
        parents: [initialAccessNode.id],
        distributionType: 'beta',
        alpha: 3.5,
        beta: 4.5
      };

      // Exploit Public-Facing Application technique
      const exploitNode = {
        id: 'RM1-tech-ia-2',
        name: 'Exploit Public-Facing Application',
        nodeType: 'continuous',
        description: 'Exploitation of vulnerabilities in internet-facing services such as VPNs, web portals, and remote access gateways commonly used by utility companies.',
        parentTactic: initialAccessNode.id,
        combinationMode: 'OR',
        position: { x: 350, y: 250 },
        parents: [initialAccessNode.id],
        distributionType: 'beta',
        alpha: 2.5,
        beta: 5.0
      };

      data.metadata.nodes.push(phishingNode, exploitNode);

      // Generate technique samples from the parent tactic's distribution, adjusted
      if (Array.isArray(iaSamples)) {
        data.samples['RM1-tech-ia-1'] = iaSamples.map(v => Math.min(1, Math.max(0, v * (0.9 + Math.random() * 0.2))));
        data.samples['RM1-tech-ia-2'] = iaSamples.map(v => Math.min(1, Math.max(0, v * (0.7 + Math.random() * 0.3))));
      }
    }
  }

  // Add technique nodes for Privilege Escalation
  const privEscNode = data.metadata.nodes.find(n => n.name === 'Privilege Escalation');
  if (privEscNode) {
    const hasCredDump = data.metadata.nodes.some(n => n.name === 'OS Credential Dumping');
    if (!hasCredDump) {
      const peSamples = data.samples[privEscNode.id];

      const credDumpNode = {
        id: 'RM1-tech-pe-1',
        name: 'OS Credential Dumping',
        nodeType: 'continuous',
        description: 'Extraction of credentials from operating system memory, registry, or credential stores to obtain higher-privilege access tokens.',
        parentTactic: privEscNode.id,
        combinationMode: 'AND',
        position: { x: 350, y: 450 },
        parents: [privEscNode.id],
        distributionType: 'beta',
        alpha: 4.0,
        beta: 3.0
      };

      const tokenManipNode = {
        id: 'RM1-tech-pe-2',
        name: 'Access Token Manipulation',
        nodeType: 'continuous',
        description: 'Manipulation of access tokens to operate under a different user or system security context, bypassing access controls.',
        parentTactic: privEscNode.id,
        combinationMode: 'AND',
        position: { x: 350, y: 550 },
        parents: [privEscNode.id],
        distributionType: 'beta',
        alpha: 3.0,
        beta: 4.0
      };

      data.metadata.nodes.push(credDumpNode, tokenManipNode);

      if (Array.isArray(peSamples)) {
        data.samples['RM1-tech-pe-1'] = peSamples.map(v => Math.min(1, Math.max(0, v * (0.85 + Math.random() * 0.15))));
        data.samples['RM1-tech-pe-2'] = peSamples.map(v => Math.min(1, Math.max(0, v * (0.75 + Math.random() * 0.25))));
      }
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`Updated ${scenario}: ${filePath}`);
});

// Clean up scripts/test.cjs if it exists
const testPath = path.join(__dirname, 'test.cjs');
if (fs.existsSync(testPath)) {
  fs.unlinkSync(testPath);
}

// Clean up scripts/transformData.cjs if it has no useful content
const transformPath = path.join(__dirname, 'transformData.cjs');
if (fs.existsSync(transformPath)) {
  fs.unlinkSync(transformPath);
}

console.log('Done!');
