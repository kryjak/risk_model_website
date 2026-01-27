import { useState, useEffect, useCallback } from 'react';
import type { 
  MonteCarloResults, 
  LoadingState, 
  RiskModelIndexEntry,
  ParameterEstimate,
  Node 
} from '../types';
import { getPercentiles } from '../utils/statistics';

interface ModelDataPair {
  baseline: MonteCarloResults | null;
  uplifted: MonteCarloResults | null;
}

interface UseModelDataResult extends LoadingState {
  data: ModelDataPair;
  parameterEstimates: ParameterEstimate[];
  refetch: () => void;
}

export function useModelData(model: RiskModelIndexEntry | null): UseModelDataResult {
  const [data, setData] = useState<ModelDataPair>({ baseline: null, uplifted: null });
  const [parameterEstimates, setParameterEstimates] = useState<ParameterEstimate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchModelData = useCallback(async () => {
    if (!model) {
      setData({ baseline: null, uplifted: null });
      setParameterEstimates([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [baselineRes, upliftedRes] = await Promise.all([
        fetch(`/data/${model.baselineFile}`),
        fetch(`/data/${model.upliftedFile}`),
      ]);

      if (!baselineRes.ok || !upliftedRes.ok) {
        throw new Error(`Error loading risk model ${model.name}. Please select another risk model.`);
      }

      const [baseline, uplifted] = await Promise.all([
        baselineRes.json() as Promise<MonteCarloResults>,
        upliftedRes.json() as Promise<MonteCarloResults>,
      ]);

      setData({ baseline, uplifted });
      
      // Compute parameter estimates from both datasets
      const estimates = computeParameterEstimates(baseline, uplifted);
      setParameterEstimates(estimates);
    } catch (err) {
      setError(
        err instanceof Error 
          ? err.message 
          : `Error loading risk model ${model?.name || 'unknown'}. Please select another risk model.`
      );
      setData({ baseline: null, uplifted: null });
      setParameterEstimates([]);
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
    isLoading,
    error,
    refetch: fetchModelData,
  };
}

function computeParameterEstimates(
  baseline: MonteCarloResults,
  uplifted: MonteCarloResults
): ParameterEstimate[] {
  const estimates: ParameterEstimate[] = [];

  for (const node of baseline.metadata.nodes) {
    // Skip probability nodes for percentile estimates (they're categorical)
    if (node.nodeType === 'probability') continue;

    const baselineSamples = baseline.samples[node.id] as number[];
    const upliftedSamples = uplifted.samples[node.id] as number[];

    if (!baselineSamples || !upliftedSamples) continue;

    const [bp5, bp50, bp95] = getPercentiles(baselineSamples);
    const [up5, up50, up95] = getPercentiles(upliftedSamples);

    const quantityNode = node as Node & { unit?: string };

    estimates.push({
      nodeId: node.id,
      name: node.name,
      nodeType: node.nodeType,
      unit: quantityNode.unit,
      baseline: { p5: bp5, p50: bp50, p95: bp95 },
      uplifted: { p5: up5, p50: up50, p95: up95 },
      baselineSamples,
      upliftedSamples,
      rationale: node.description || '',
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
