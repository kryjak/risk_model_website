import { useState, useEffect, useCallback } from 'react';
import type {
  LoadingState,
  RiskModelIndexEntry,
  ParameterEstimate,
  TechniqueChild,
  BenchmarkMappings,
  ModelRationales,
  ModelPercentiles,
  ModelSamples,
  RationaleNode,
} from '../types';

export interface SplitModelData {
  rationales: ModelRationales | null;
  percentiles: ModelPercentiles | null;
  samples: {
    baseline: ModelSamples | null;
    sota: ModelSamples | null;
    saturated: ModelSamples | null;
  };
}

interface UseModelDataResult extends LoadingState {
  data: SplitModelData;
  parameterEstimates: ParameterEstimate[];
  benchmarkMappings: BenchmarkMappings;
  totalRiskSamples: { baseline: number[]; sota: number[]; saturated: number[] };
  modelDescription: string;
  samplesAvailable: boolean;
  refetch: () => void;
}

export function useModelData(model: RiskModelIndexEntry | null): UseModelDataResult {
  const [data, setData] = useState<SplitModelData>({
    rationales: null,
    percentiles: null,
    samples: { baseline: null, sota: null, saturated: null },
  });
  const [parameterEstimates, setParameterEstimates] = useState<ParameterEstimate[]>([]);
  const [benchmarkMappings, setBenchmarkMappings] = useState<BenchmarkMappings>({});
  const [totalRiskSamples, setTotalRiskSamples] = useState<{ baseline: number[]; sota: number[]; saturated: number[] }>({ baseline: [], sota: [], saturated: [] });
  const [modelDescription, setModelDescription] = useState('');
  const [samplesAvailable, setSamplesAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchModelData = useCallback(async () => {
    if (!model) {
      setData({ rationales: null, percentiles: null, samples: { baseline: null, sota: null, saturated: null } });
      setParameterEstimates([]);
      setBenchmarkMappings({});
      setTotalRiskSamples({ baseline: [], sota: [], saturated: [] });
      setModelDescription('');
      setSamplesAvailable(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Phase 1: fetch rationales + percentiles (fast, ~13KB)
      const [rationalesRes, percentilesRes] = await Promise.all([
        fetch(`/data/${model.rationalesFile}`),
        fetch(`/data/${model.percentilesFile}`),
      ]);

      if (!rationalesRes.ok || !percentilesRes.ok) {
        throw new Error(`Error loading risk model ${model.name}. Please select another risk model.`);
      }

      const [rationales, percentiles, nameOverrides] = await Promise.all([
        rationalesRes.json() as Promise<ModelRationales>,
        percentilesRes.json() as Promise<ModelPercentiles>,
        fetch('/data/display_name_overrides.json')
          .then(r => r.ok ? r.json() as Promise<Record<string, Record<string, string>>> : ({} as Record<string, Record<string, string>>))
          .catch(() => ({} as Record<string, Record<string, string>>)),
      ]);

      // Apply display name overrides if any exist for this model
      const overrides = nameOverrides[rationales.modelId];
      if (overrides) {
        for (const node of rationales.nodes) {
          if (overrides[node.name]) {
            node.name = overrides[node.name];
          }
        }
      }

      setBenchmarkMappings(rationales.benchmarkMappings || {});
      setModelDescription(rationales.modelDescription || model.description);

      // Phase 2: fetch samples (optional, ~1MB)
      let baselineSamples: ModelSamples | null = null;
      let sotaSamples: ModelSamples | null = null;
      let saturatedSamples: ModelSamples | null = null;
      let hasSamples = false;

      if (model.baselineSamplesFile && model.sotaSamplesFile && model.saturatedSamplesFile) {
        try {
          const [bRes, sRes, satRes] = await Promise.all([
            fetch(`/data/${model.baselineSamplesFile}`),
            fetch(`/data/${model.sotaSamplesFile}`),
            fetch(`/data/${model.saturatedSamplesFile}`),
          ]);

          if (bRes.ok && sRes.ok && satRes.ok) {
            [baselineSamples, sotaSamples, saturatedSamples] = await Promise.all([
              bRes.json() as Promise<ModelSamples>,
              sRes.json() as Promise<ModelSamples>,
              satRes.json() as Promise<ModelSamples>,
            ]);
            hasSamples = true;
          }
        } catch {
          // Samples are optional — degrade gracefully
          console.warn(`Could not load samples for ${model.id}`);
        }
      }

      const splitData: SplitModelData = {
        rationales,
        percentiles,
        samples: { baseline: baselineSamples, sota: sotaSamples, saturated: saturatedSamples },
      };
      setData(splitData);
      setSamplesAvailable(hasSamples);

      // Compute estimates
      const estimates = computeParameterEstimates(rationales, percentiles, baselineSamples, sotaSamples, saturatedSamples);
      setParameterEstimates(estimates);

      // Total Risk samples
      const totalRiskNode = rationales.nodes.find(n => n.name === 'Total Risk');
      if (totalRiskNode && hasSamples) {
        setTotalRiskSamples({
          baseline: baselineSamples?.samples[totalRiskNode.id] || [],
          sota: sotaSamples?.samples[totalRiskNode.id] || [],
          saturated: saturatedSamples?.samples[totalRiskNode.id] || [],
        });
      } else {
        setTotalRiskSamples({ baseline: [], sota: [], saturated: [] });
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Error loading risk model ${model?.name || 'unknown'}. Please select another risk model.`
      );
      setData({ rationales: null, percentiles: null, samples: { baseline: null, sota: null, saturated: null } });
      setParameterEstimates([]);
      setBenchmarkMappings({});
      setTotalRiskSamples({ baseline: [], sota: [], saturated: [] });
      setModelDescription('');
      setSamplesAvailable(false);
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
    totalRiskSamples,
    modelDescription,
    samplesAvailable,
    isLoading,
    error,
    refetch: fetchModelData,
  };
}

function computeParameterEstimates(
  rationales: ModelRationales,
  percentiles: ModelPercentiles,
  baselineSamples: ModelSamples | null,
  sotaSamples: ModelSamples | null,
  saturatedSamples: ModelSamples | null,
): ParameterEstimate[] {
  const estimates: ParameterEstimate[] = [];
  const hasSamples = !!(baselineSamples && sotaSamples && saturatedSamples);

  // Build technique lookup by parent tactic
  const techniquesByTactic = new Map<string, RationaleNode[]>();
  const techniqueNodeIds = new Set<string>();

  for (const node of rationales.nodes) {
    if (node.parentTactic) {
      const existing = techniquesByTactic.get(node.parentTactic) || [];
      existing.push(node);
      techniquesByTactic.set(node.parentTactic, existing);
      techniqueNodeIds.add(node.id);
    }
  }

  for (const node of rationales.nodes) {
    if (node.nodeType === 'probability') continue;
    if (techniqueNodeIds.has(node.id)) continue;

    const pctls = percentiles.nodes[node.id];
    if (!pctls) continue;

    // Build technique children
    let techniqueChildren: TechniqueChild[] | undefined;
    const techniques = techniquesByTactic.get(node.id);
    if (techniques && techniques.length > 0) {
      techniqueChildren = techniques.map(techNode => {
        const techPctls = percentiles.nodes[techNode.id] || {
          baseline: { p5: 0, p50: 0, p95: 0 },
          sota: { p5: 0, p50: 0, p95: 0 },
          saturated: { p5: 0, p50: 0, p95: 0 },
        };
        return {
          nodeId: techNode.id,
          name: techNode.name,
          combinationMode: techNode.combinationMode || 'AND',
          baseline: techPctls.baseline,
          sota: techPctls.sota,
          saturated: techPctls.saturated,
          baselineSamples: hasSamples ? (baselineSamples.samples[techNode.id] || []) : [],
          sotaSamples: hasSamples ? (sotaSamples.samples[techNode.id] || []) : [],
          saturatedSamples: hasSamples ? (saturatedSamples.samples[techNode.id] || []) : [],
          baselineRationale: techNode.baselineRationale || '',
          sotaRationale: techNode.sotaRationale || '',
          saturatedRationale: techNode.saturatedRationale || '',
          samplesAvailable: hasSamples,
        };
      });
    }

    estimates.push({
      nodeId: node.id,
      name: node.name,
      nodeType: node.nodeType,
      unit: node.unit,
      baseline: pctls.baseline,
      sota: pctls.sota,
      saturated: pctls.saturated,
      baselineSamples: hasSamples ? (baselineSamples.samples[node.id] || []) : [],
      sotaSamples: hasSamples ? (sotaSamples.samples[node.id] || []) : [],
      saturatedSamples: hasSamples ? (saturatedSamples.samples[node.id] || []) : [],
      baselineRationale: node.baselineRationale || '',
      sotaRationale: node.sotaRationale || '',
      saturatedRationale: node.saturatedRationale || '',
      samplesAvailable: hasSamples,
      techniqueChildren,
    });
  }

  return estimates;
}
