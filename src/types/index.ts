// Risk Model Index Types
export interface RiskModelIndexEntry {
  id: string;
  name: string;
  description: string;
  baselineFile: string;
  upliftedFile: string;
}

export interface RiskModelsIndex {
  models: RiskModelIndexEntry[];
}

// Node Types
export type NodeType = 'probability' | 'continuous' | 'quantity';
export type DistributionType = 'discrete' | 'conditionalBeta' | null;

export interface NodePosition {
  x: number;
  y: number;
}

export interface BaseNode {
  id: string;
  name: string;
  nodeType: NodeType;
  description: string;
  position: NodePosition;
  parents: string[];
}

export interface ProbabilityNode extends BaseNode {
  nodeType: 'probability';
  distributionType: 'discrete';
  states: string[];
}

export interface ContinuousNode extends BaseNode {
  nodeType: 'continuous';
  distributionType: 'conditionalBeta';
}

export interface QuantityNode extends BaseNode {
  nodeType: 'quantity';
  distributionType: null;
  unit: string;
  computationMode: string;
}

export type Node = ProbabilityNode | ContinuousNode | QuantityNode;

// Link Types
export interface Link {
  source: string;
  target: string;
  linkType: string;
  parameterName: string | null;
}

// Metadata
export interface Metadata {
  nodes: Node[];
  links: Link[];
}

// Marginals (for discrete probability nodes)
export type Marginals = Record<string, Record<string, number>>;

// Marginal Probabilities
// For probability nodes: { nodeId: { stateName: number[] } }
// For quantity nodes: { nodeId: number[] }
export type MarginalProbabilities = Record<string, Record<string, number[]> | number[] | null>;

// Statistics (for continuous nodes)
export interface NodeStatistics {
  mean: number;
  variance: number;
  count: number;
}

export type Statistics = Record<string, NodeStatistics>;

// Samples
// For probability nodes: string[]
// For continuous/quantity nodes: number[]
export type Samples = Record<string, (string | number)[]>;

// Complete Monte Carlo Results Structure
export interface MonteCarloResults {
  exportTimestamp: string;
  modelName: string;
  modelDescription: string;
  totalSamples: number;
  cancelled: boolean;
  completed: boolean;
  metadata: Metadata;
  samples: Samples;
  marginals: Marginals;
  marginalProbabilities: MarginalProbabilities;
  statistics: Statistics;
}

// Computed Types for UI
export interface PercentileData {
  p5: number;
  p50: number;
  p95: number;
}

export interface ParameterEstimate {
  nodeId: string;
  name: string;
  nodeType: NodeType;
  unit?: string;
  baseline: PercentileData;
  uplifted: PercentileData;
  baselineSamples: number[];
  upliftedSamples: number[];
  rationale: string;
}

// View Types
export type ViewMode = 'byModel' | 'byParameter';

// Loading States
export interface LoadingState {
  isLoading: boolean;
  error: string | null;
}

// Table Row Types
export type TableType = 'quantity' | 'probability' | 'impact';

// URL Query Params
export interface QueryParams {
  model?: string;
  view?: ViewMode;
}
