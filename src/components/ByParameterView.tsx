import { useState, useMemo } from 'react';
import { ChevronDown, BarChart3 } from 'lucide-react';
import type { RiskModelsIndex, MonteCarloResults, ParameterEstimate } from '../types';
import { formatValue } from '../utils/formatters';
import { getPercentiles } from '../utils/statistics';

interface ByParameterViewProps {
  index: RiskModelsIndex;
  loadedModels: Map<string, { baseline: MonteCarloResults; uplifted: MonteCarloResults }>;
  onShowDistribution: (estimate: ParameterEstimate) => void;
  onLoadModel: (modelId: string) => Promise<void>;
}

export function ByParameterView({
  index,
  loadedModels,
  onShowDistribution,
  onLoadModel,
}: ByParameterViewProps) {
  const [selectedParameter, setSelectedParameter] = useState<string | null>(null);

  // Extract all unique parameter names from loaded models
  const allParameters = useMemo(() => {
    const params = new Set<string>();
    loadedModels.forEach(({ baseline }) => {
      baseline.metadata.nodes.forEach((node) => {
        if (node.nodeType !== 'probability') {
          params.add(node.name);
        }
      });
    });
    return Array.from(params).sort();
  }, [loadedModels]);

  // Get data for selected parameter across all loaded models
  const parameterData = useMemo(() => {
    if (!selectedParameter) return [];

    const data: Array<{
      modelId: string;
      modelName: string;
      estimate: ParameterEstimate;
    }> = [];

    loadedModels.forEach(({ baseline, uplifted }, modelId) => {
      const node = baseline.metadata.nodes.find((n) => n.name === selectedParameter);
      if (!node) return;

      const baselineSamples = baseline.samples[node.id] as number[];
      const upliftedSamples = uplifted.samples[node.id] as number[];

      if (!baselineSamples || !upliftedSamples) return;

      const [bp5, bp50, bp95] = getPercentiles(baselineSamples);
      const [up5, up50, up95] = getPercentiles(upliftedSamples);

      const modelEntry = index.models.find((m) => m.id === modelId);

      data.push({
        modelId,
        modelName: modelEntry?.name || modelId,
        estimate: {
          nodeId: node.id,
          name: node.name,
          nodeType: node.nodeType,
          unit: 'unit' in node ? node.unit : undefined,
          baseline: { p5: bp5, p50: bp50, p95: bp95 },
          uplifted: { p5: up5, p50: up50, p95: up95 },
          baselineSamples,
          upliftedSamples,
          rationale: node.description || '',
        },
      });
    });

    return data;
  }, [selectedParameter, loadedModels, index]);

  const format = (value: number, estimate: ParameterEstimate) => {
    if (estimate.nodeType === 'continuous') {
      return formatValue(value, undefined, 'continuous');
    }
    return formatValue(value, estimate.unit, estimate.nodeType);
  };

  // Check which models still need loading
  const unloadedModels = index.models.filter((m) => !loadedModels.has(m.id));

  return (
    <div className="space-y-6">
      {/* Parameter Selector */}
      <div className="card">
        <div className="flex items-center gap-4 flex-wrap">
          <label htmlFor="parameter-select" className="font-medium text-safer-charcoal">
            Select Parameter:
          </label>
          <div className="relative">
            <select
              id="parameter-select"
              value={selectedParameter || ''}
              onChange={(e) => setSelectedParameter(e.target.value || null)}
              className="appearance-none bg-white border border-gray-200 rounded-lg px-4 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-safer-blue focus:border-transparent min-w-[250px]"
            >
              <option value="">Choose a parameter...</option>
              {allParameters.map((param) => (
                <option key={param} value={param}>
                  {param}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {unloadedModels.length > 0 && (
          <div className="mt-4 p-3 bg-safer-grey rounded-lg">
            <p className="text-sm text-gray-600 mb-2">
              Load additional models to compare:
            </p>
            <div className="flex flex-wrap gap-2">
              {unloadedModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => onLoadModel(model.id)}
                  className="px-3 py-1 text-sm bg-white border border-gray-200 rounded-full hover:border-safer-blue transition-colors"
                >
                  {model.id}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Comparison Table */}
      {selectedParameter && parameterData.length > 0 && (
        <div className="card overflow-hidden">
          <h3 className="text-lg font-serif font-medium text-safer-charcoal mb-4 px-2">
            {selectedParameter} — Cross-Model Comparison
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-safer-grey border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-safer-charcoal">
                    Risk Model
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-safer-blue whitespace-nowrap">
                    Baseline 5th %
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-safer-blue whitespace-nowrap">
                    Baseline 50th %
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-safer-blue whitespace-nowrap">
                    Baseline 95th %
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-safer-purple whitespace-nowrap">
                    AI 5th %
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-safer-purple whitespace-nowrap">
                    AI 50th %
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-safer-purple whitespace-nowrap">
                    AI 95th %
                  </th>
                  <th className="text-center py-3 px-4 font-medium text-safer-charcoal">
                    Dist.
                  </th>
                </tr>
              </thead>
              <tbody>
                {parameterData.map(({ modelId, modelName, estimate }) => (
                  <tr
                    key={modelId}
                    className="border-b border-gray-100 hover:bg-safer-grey/50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <span className="font-medium text-safer-charcoal">{modelId}</span>
                      <span className="text-gray-400 ml-2 text-xs" title={modelName}>
                        {modelName.length > 30 ? modelName.slice(0, 30) + '...' : modelName}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-safer-blue">
                      {format(estimate.baseline.p5, estimate)}
                    </td>
                    <td className="py-3 px-4 text-right text-safer-blue font-medium">
                      {format(estimate.baseline.p50, estimate)}
                    </td>
                    <td className="py-3 px-4 text-right text-safer-blue">
                      {format(estimate.baseline.p95, estimate)}
                    </td>
                    <td className="py-3 px-4 text-right text-safer-purple">
                      {format(estimate.uplifted.p5, estimate)}
                    </td>
                    <td className="py-3 px-4 text-right text-safer-purple font-medium">
                      {format(estimate.uplifted.p50, estimate)}
                    </td>
                    <td className="py-3 px-4 text-right text-safer-purple">
                      {format(estimate.uplifted.p95, estimate)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => onShowDistribution(estimate)}
                        className="p-1.5 hover:bg-safer-blue/10 rounded-lg transition-colors"
                        aria-label={`Show distribution for ${modelId}`}
                        title="View distribution"
                      >
                        <BarChart3 className="w-4 h-4 text-safer-blue" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedParameter && parameterData.length === 0 && (
        <div className="card text-center py-8">
          <p className="text-gray-500">
            No data available for "{selectedParameter}" in loaded models.
          </p>
        </div>
      )}

      {!selectedParameter && (
        <div className="card text-center py-12">
          <p className="text-gray-500">
            Select a parameter above to compare values across risk models.
          </p>
        </div>
      )}
    </div>
  );
}
