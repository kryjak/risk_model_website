import { useState, useEffect, useCallback } from 'react';
import type {
  MonteCarloResults,
  LoadingState,
  RiskModelIndexEntry,
  ParameterEstimate,
  TechniqueChild,
  BenchmarkMappings,
  Node
} from '../types';
import { getPercentiles } from '../utils/statistics';

interface ModelDataTriple {
  baseline: MonteCarloResults | null;
  sota: MonteCarloResults | null;
  saturated: MonteCarloResults | null;
}

interface UseModelDataResult extends LoadingState {
  data: ModelDataTriple;
  parameterEstimates: ParameterEstimate[];
  benchmarkMappings: BenchmarkMappings;
  refetch: () => void;
}

export function useModelData(model: RiskModelIndexEntry | null): UseModelDataResult {
  const [data, setData] = useState<ModelDataTriple>({ baseline: null, sota: null, saturated: null });
  const [parameterEstimates, setParameterEstimates] = useState<ParameterEstimate[]>([]);
  const [benchmarkMappings, setBenchmarkMappings] = useState<BenchmarkMappings>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchModelData = useCallback(async () => {
    if (!model) {
      setData({ baseline: null, sota: null, saturated: null });
      setParameterEstimates([]);
      setBenchmarkMappings({});
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [baselineRes, sotaRes, saturatedRes] = await Promise.all([
        fetch(`/data/${model.baselineFile}`),
        fetch(`/data/${model.sotaFile}`),
        fetch(`/data/${model.saturatedFile}`),
      ]);

      if (!baselineRes.ok || !sotaRes.ok || !saturatedRes.ok) {
        throw new Error(`Error loading risk model ${model.name}. Please select another risk model.`);
      }

      const [baseline, sota, saturated] = await Promise.all([
        baselineRes.json() as Promise<MonteCarloResults>,
        sotaRes.json() as Promise<MonteCarloResults>,
        saturatedRes.json() as Promise<MonteCarloResults>,
      ]);

      setData({ baseline, sota, saturated });

      // Extract benchmark mappings if available
      const mappings = (baseline as any).benchmarkMappings || {};
      setBenchmarkMappings(mappings);

      // Compute parameter estimates from all three datasets
      const estimates = computeParameterEstimates(baseline, sota, saturated);
      setParameterEstimates(estimates);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Error loading risk model ${model?.name || 'unknown'}. Please select another risk model.`
      );
      setData({ baseline: null, sota: null, saturated: null });
      setParameterEstimates([]);
      setBenchmarkMappings({});
    } finally {
      setIsLoading(false);
    }
  }, [model]);

  useEffect(() => {
    fetchModelData();
  }, [fetchModelData]);

  return {
    data,
    parameterEstimates,
    benchmarkMappings,
    isLoading,
    error,
    refetch: fetchModelData,
  };
}

function computeParameterEstimates(
  baseline: MonteCarloResults,
  sota: MonteCarloResults,
  saturated: MonteCarloResults
): ParameterEstimate[] {
  const estimates: ParameterEstimate[] = [];

  // Build a map of technique nodes grouped by parent tactic
  const techniquesByTactic = new Map<string, Node[]>();
  for (const node of baseline.metadata.nodes) {
    if (node.parentTactic) {
      const existing = techniquesByTactic.get(node.parentTactic) || [];
      existing.push(node);
      techniquesByTactic.set(node.parentTactic, existing);
    }
  }

  // Track which nodes are techniques (so we skip them at the top level)
  const techniqueNodeIds = new Set<string>();
  for (const nodes of techniquesByTactic.values()) {
    for (const node of nodes) {
      techniqueNodeIds.add(node.id);
    }
  }

  for (const node of baseline.metadata.nodes) {
    // Skip probability nodes (categorical) and technique nodes (handled as children)
    if (node.nodeType === 'probability') continue;
    if (techniqueNodeIds.has(node.id)) continue;

    const baselineSamples = baseline.samples[node.id] as number[];
    const sotaSamples = sota.samples[node.id] as number[];
    const saturatedSamples = saturated.samples[node.id] as number[];

    if (!baselineSamples || !sotaSamples || !saturatedSamples) continue;

    const [bp5, bp50, bp95] = getPercentiles(baselineSamples);
    const [sp5, sp50, sp95] = getPercentiles(sotaSamples);
    const [satp5, satp50, satp95] = getPercentiles(saturatedSamples);

    const quantityNode = node as Node & { unit?: string };

    // Build technique children if this node is a tactic with techniques
    let techniqueChildren: TechniqueChild[] | undefined;
    const techniques = techniquesByTactic.get(node.id);
    if (techniques && techniques.length > 0) {
      techniqueChildren = techniques.map(techNode => {
        const techBaselineSamples = baseline.samples[techNode.id] as number[];
        const techSotaSamples = sota.samples[techNode.id] as number[];
        const techSaturatedSamples = saturated.samples[techNode.id] as number[];

        const [tbp5, tbp50, tbp95] = getPercentiles(techBaselineSamples || []);
        const [tsp5, tsp50, tsp95] = getPercentiles(techSotaSamples || []);
        const [tsatp5, tsatp50, tsatp95] = getPercentiles(techSaturatedSamples || []);

        return {
          nodeId: techNode.id,
          name: techNode.name,
          combinationMode: techNode.combinationMode || 'AND',
          baseline: { p5: tbp5, p50: tbp50, p95: tbp95 },
          sota: { p5: tsp5, p50: tsp50, p95: tsp95 },
          saturated: { p5: tsatp5, p50: tsatp50, p95: tsatp95 },
          baselineSamples: techBaselineSamples || [],
          sotaSamples: techSotaSamples || [],
          saturatedSamples: techSaturatedSamples || [],
          rationale: techNode.description || '',
        };
      });
    }

    estimates.push({
      nodeId: node.id,
      name: node.name,
      nodeType: node.nodeType,
      unit: quantityNode.unit,
      baseline: { p5: bp5, p50: bp50, p95: bp95 },
      sota: { p5: sp5, p50: sp50, p95: sp95 },
      saturated: { p5: satp5, p50: satp50, p95: satp95 },
      baselineSamples,
      sotaSamples,
      saturatedSamples,
      rationale: node.description || '',
      techniqueChildren,
    });
  }

  return estimates;
}

// Helper to get node by ID from metadata
export function getNodeById(
  data: MonteCarloResults | null,
  nodeId: string
): Node | undefined {
  return data?.metadata.nodes.find(n => n.id === nodeId);
}

// Helper to find Total Risk node
export function getTotalRiskNode(data: MonteCarloResults | null): Node | undefined {
  return data?.metadata.nodes.find(n => n.name === 'Total Risk');
}
