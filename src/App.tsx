import { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { ViewToggle } from './components/ViewToggle';
import { RiskModelSelector, RiskModelSelectorSkeleton } from './components/RiskModelSelector';
import { ScenarioCard, ScenarioCardSkeleton } from './components/ScenarioCard';
import { EstimatesTable, EstimatesTableSkeleton } from './components/EstimatesTable';
import { DistributionModal } from './components/DistributionModal';
import { OverallRiskChart, OverallRiskChartSkeleton } from './components/OverallRiskChart';
import { ByParameterView } from './components/ByParameterView';
import { ErrorMessage } from './components/ErrorMessage';
import { useRiskModelsIndex } from './hooks/useRiskModelsIndex';
import { useModelData, getTotalRiskNode } from './hooks/useModelData';
import { useUrlParams } from './hooks/useUrlParams';
import type { ViewMode, ParameterEstimate, MonteCarloResults } from './types';

function App() {
  const { params, updateParams } = useUrlParams();
  const { index, isLoading: indexLoading, error: indexError, refetch: refetchIndex } = useRiskModelsIndex();
  
  // Selected model from URL or default to first
  const selectedModelId = params.model || (index?.models[0]?.id ?? null);
  const selectedModel = index?.models.find(m => m.id === selectedModelId) ?? null;
  
  const {
    data: modelData,
    parameterEstimates,
    isLoading: modelLoading,
    error: modelError,
    refetch: refetchModel,
  } = useModelData(selectedModel);

  // Cache of loaded models for ByParameterView
  const [loadedModelsCache, setLoadedModelsCache] = useState<
    Map<string, { baseline: MonteCarloResults; uplifted: MonteCarloResults }>
  >(new Map());

  // Modal state
  const [selectedEstimate, setSelectedEstimate] = useState<ParameterEstimate | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Update cache when model data loads
  useEffect(() => {
    if (modelData.baseline && modelData.uplifted && selectedModelId) {
      setLoadedModelsCache(prev => {
        const newMap = new Map(prev);
        newMap.set(selectedModelId, {
          baseline: modelData.baseline!,
          uplifted: modelData.uplifted!,
        });
        return newMap;
      });
    }
  }, [modelData, selectedModelId]);

  // Handlers
  const handleModelSelect = useCallback((modelId: string) => {
    updateParams({ model: modelId });
  }, [updateParams]);

  const handleViewChange = useCallback((view: ViewMode) => {
    updateParams({ view });
  }, [updateParams]);

  const handleShowDistribution = useCallback((estimate: ParameterEstimate) => {
    setSelectedEstimate(estimate);
    setIsModalOpen(true);
  }, []);

  const handleLoadModelForComparison = useCallback(async (modelId: string) => {
    const model = index?.models.find(m => m.id === modelId);
    if (!model) return;

    try {
      const [baselineRes, upliftedRes] = await Promise.all([
        fetch(`/data/${model.baselineFile}`),
        fetch(`/data/${model.upliftedFile}`),
      ]);

      if (!baselineRes.ok || !upliftedRes.ok) {
        throw new Error(`Failed to load ${modelId}`);
      }

      const [baseline, uplifted] = await Promise.all([
        baselineRes.json(),
        upliftedRes.json(),
      ]);

      setLoadedModelsCache(prev => {
        const newMap = new Map(prev);
        newMap.set(modelId, { baseline, uplifted });
        return newMap;
      });
    } catch (error) {
      console.error(`Error loading model ${modelId}:`, error);
    }
  }, [index]);

  // Separate estimates by type
  const { quantityEstimates, probabilityEstimates, impactEstimates } = useMemo(() => {
    const quantity: ParameterEstimate[] = [];
    const probability: ParameterEstimate[] = [];
    const impact: ParameterEstimate[] = [];
    let totalRisk: ParameterEstimate | null = null;

    for (const est of parameterEstimates) {
      if (est.name === 'Total Risk') {
        totalRisk = est;
        continue;
      }

      if (est.nodeType === 'quantity') {
        // Separate damage/cost related quantities as "impact"
        if (est.name.toLowerCase().includes('damage') || 
            est.unit?.includes('$')) {
          impact.push(est);
        } else {
          quantity.push(est);
        }
      } else if (est.nodeType === 'continuous') {
        probability.push(est);
      }
    }

    return {
      quantityEstimates: quantity,
      probabilityEstimates: probability,
      impactEstimates: impact,
      totalRiskEstimate: totalRisk,
    };
  }, [parameterEstimates]);

  // Get Total Risk samples
  const totalRiskNode = getTotalRiskNode(modelData.baseline);
  const baselineTotalRiskSamples = totalRiskNode 
    ? (modelData.baseline?.samples[totalRiskNode.id] as number[]) ?? []
    : [];
  const upliftedTotalRiskSamples = totalRiskNode && modelData.uplifted
    ? (modelData.uplifted.samples[totalRiskNode.id] as number[]) ?? []
    : [];

  const isLoading = indexLoading || modelLoading;
  const showContent = !isLoading && !modelError && modelData.baseline;

  return (
    <div className="min-h-screen bg-safer-grey">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* View Toggle */}
        <div className="flex justify-center mb-6">
          <ViewToggle activeView={params.view} onViewChange={handleViewChange} />
        </div>

        {/* Error States */}
        {indexError && (
          <ErrorMessage message={indexError} onRetry={refetchIndex} />
        )}

        {modelError && !indexError && (
          <ErrorMessage message={modelError} onRetry={refetchModel} />
        )}

        {/* By Risk Model View */}
        {params.view === 'byModel' && (
          <div className="space-y-6">
            {/* Model Selector */}
            <div className="flex justify-center">
              {indexLoading ? (
                <RiskModelSelectorSkeleton />
              ) : index ? (
                <RiskModelSelector
                  models={index.models}
                  selectedModelId={selectedModelId}
                  onSelectModel={handleModelSelect}
                  isLoading={modelLoading}
                />
              ) : null}
            </div>

            {/* Scenario Description */}
            {isLoading ? (
              <ScenarioCardSkeleton />
            ) : showContent && selectedModel ? (
              <ScenarioCard
                title={selectedModel.name}
                description={modelData.baseline?.modelDescription || selectedModel.description}
              />
            ) : null}

            {/* Quantity Estimates Table */}
            {isLoading ? (
              <EstimatesTableSkeleton rows={3} />
            ) : showContent && quantityEstimates.length > 0 ? (
              <EstimatesTable
                title="Quantity Estimates"
                estimates={quantityEstimates}
                tableType="quantity"
                onShowDistribution={handleShowDistribution}
              />
            ) : null}

            {/* Probability Estimates Table */}
            {isLoading ? (
              <EstimatesTableSkeleton rows={6} />
            ) : showContent && probabilityEstimates.length > 0 ? (
              <EstimatesTable
                title="Probability Estimates (MITRE ATT&CK Tactics)"
                estimates={probabilityEstimates}
                tableType="probability"
                onShowDistribution={handleShowDistribution}
              />
            ) : null}

            {/* Impact Estimates Table */}
            {showContent && impactEstimates.length > 0 && (
              <EstimatesTable
                title="Impact Estimates"
                estimates={impactEstimates}
                tableType="impact"
                onShowDistribution={handleShowDistribution}
              />
            )}

            {/* Divider */}
            {showContent && baselineTotalRiskSamples.length > 0 && (
              <hr className="border-t-2 border-safer-charcoal/10 my-8" />
            )}

            {/* Overall Risk Chart */}
            {isLoading ? (
              <OverallRiskChartSkeleton />
            ) : showContent && baselineTotalRiskSamples.length > 0 ? (
              <OverallRiskChart
                baselineSamples={baselineTotalRiskSamples}
                upliftedSamples={upliftedTotalRiskSamples}
                title="Total Risk Distribution"
              />
            ) : null}
          </div>
        )}

        {/* By Parameter View */}
        {params.view === 'byParameter' && index && (
          <ByParameterView
            index={index}
            loadedModels={loadedModelsCache}
            onShowDistribution={handleShowDistribution}
            onLoadModel={handleLoadModelForComparison}
          />
        )}
      </main>

      {/* Distribution Modal */}
      <DistributionModal
        estimate={selectedEstimate}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}

export default App;
