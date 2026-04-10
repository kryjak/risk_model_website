// Risk Model Index Types
export interface RiskModelIndexEntry {
  id: string;
  name: string;
  description: string;
  shortDescription?: string;
  rationalesFile: string;
  percentilesFile: string;
  baselineSamplesFile?: string;
  sotaSamplesFile?: string;
  saturatedSamplesFile?: string;
}

export interface RiskModelsIndex {
  models: RiskModelIndexEntry[];
}

// --- New split-file shapes ---

// Rationales file
export type NodeType = 'probability' | 'continuous' | 'quantity';
export type CombinationMode = 'AND' | 'OR' | 'XOR';

export interface RationaleNode {
  id: string;
  name: string;
  nodeType: NodeType;
  unit?: string;
  parentTactic?: string;
  combinationMode?: CombinationMode;
  baselineRationale: string;
  sotaRationale: string;
  saturatedRationale: string;
}

export interface ModelRationales {
  modelId: string;
  modelDescription: string;
  benchmarkMappings?: Record<string, string[]>;
  nodes: RationaleNode[];
}

// Percentiles file
export interface ScenarioPercentiles {
  p5: number;
  p50: number;
  p95: number;
}

export interface NodePercentiles {
  baseline: ScenarioPercentiles;
  sota: ScenarioPercentiles;
  saturated: ScenarioPercentiles;
}

export interface ModelPercentiles {
  modelId: string;
  nodes: Record<string, NodePercentiles>;
}

// Samples file (one per scenario)
export interface ModelSamples {
  modelId: string;
  scenario: string;
  samples: Record<string, number[]>;
}

// --- Computed types for UI ---

export interface PercentileData {
  p5: number;
  p50: number;
  p95: number;
}

export interface TechniqueChild {
  nodeId: string;
  name: string;
  combinationMode: CombinationMode;
  baseline: PercentileData;
  sota: PercentileData;
  saturated: PercentileData;
  baselineSamples: number[];
  sotaSamples: number[];
  saturatedSamples: number[];
  baselineRationale: string;
  sotaRationale: string;
  saturatedRationale: string;
  samplesAvailable: boolean;
}

export interface ParameterEstimate {
  nodeId: string;
  name: string;
  nodeType: NodeType;
  unit?: string;
  baseline: PercentileData;
  sota: PercentileData;
  saturated: PercentileData;
  baselineSamples: number[];
  sotaSamples: number[];
  saturatedSamples: number[];
  baselineRationale: string;
  sotaRationale: string;
  saturatedRationale: string;
  samplesAvailable: boolean;
  techniqueChildren?: TechniqueChild[];
}

// Benchmark/KRI Mappings
export type BenchmarkMappings = Record<string, string[]>;

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
