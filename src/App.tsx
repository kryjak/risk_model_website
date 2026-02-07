import { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { ViewToggle } from './components/ViewToggle';
import { RiskModelSelector, RiskModelSelectorSkeleton } from './components/RiskModelSelector';
import { ScenarioCard, ScenarioCardSkeleton } from './components/ScenarioCard';
import { EstimatesTable, EstimatesTableSkeleton } from './components/EstimatesTable';
import { DistributionModal } from './components/DistributionModal';
import { OverallRiskChart, OverallRiskChartSkeleton } from './components/OverallRiskChart';
import { BayesianNetworkPlaceholder } from './components/BayesianNetworkPlaceholder';
import { KRIMappingsModal } from './components/KRIMappingsModal';
import { LandingPage, LandingPageSkeleton } from './components/LandingPage';
import { ByParameterView } from './components/ByParameterView';
import { ErrorMessage } from './components/ErrorMessage';
import { useRiskModelsIndex } from './hooks/useRiskModelsIndex';
import { useModelData, getTotalRiskNode } from './hooks/useModelData';
import { useUrlParams } from './hooks/useUrlParams';
import type { ViewMode, ParameterEstimate, MonteCarloResults } from './types';

function App() {
  const { params, updateParams } = useUrlParams();
  const { index, isLoading: indexLoading, error: indexError, refetch: refetchIndex } = useRiskModelsIndex();

  // Selected model from URL — null means show landing page
  const selectedModelId = params.model;
  const selectedModel = index?.models.find(m => m.id === selectedModelId) ?? null;

  const {
    data: modelData,
    parameterEstimates,
    benchmarkMappings,
    isLoading: modelLoading,
    error: modelError,
    refetch: refetchModel,
  } = useModelData(selectedModel);

  // Cache of loaded models for ByParameterView
  const [loadedModelsCache, setLoadedModelsCache] = useState<
    Map<string, { baseline: MonteCarloResults; sota: MonteCarloResults; saturated: MonteCarloResults }>
  >(new Map());

  // Modal states
  const [selectedEstimate, setSelectedEstimate] = useState<ParameterEstimate | null>(null);
  const [isDistModalOpen, setIsDistModalOpen] = useState(false);
  const [isKRIModalOpen, setIsKRIModalOpen] = useState(false);

  // Update cache when model data loads
  useEffect(() => {
    if (modelData.baseline && modelData.sota && modelData.saturated && selectedModelId) {
      setLoadedModelsCache(prev => {
        const newMap = new Map(prev);
        newMap.set(selectedModelId, {
          baseline: modelData.baseline!,
          sota: modelData.sota!,
          saturated: modelData.saturated!,
        });
        return newMap;
      });
    }
  }, [modelData, selectedModelId]);

  // Handlers
  const handleModelSelect = useCallback((modelId: string) => {
    updateParams({ model: modelId });
  }, [updateParams]);

  const handleBackToHome = useCallback(() => {
    updateParams({ model: null });
  }, [updateParams]);

  const handleViewChange = useCallback((view: ViewMode) => {
    updateParams({ view });
  }, [updateParams]);

  const handleShowDistribution = useCallback((estimate: ParameterEstimate) => {
    setSelectedEstimate(estimate);
    setIsDistModalOpen(true);
  }, []);

  const handleLoadModelForComparison = useCallback(async (modelId: string) => {
    const model = index?.models.find(m => m.id === modelId);
    if (!model) return;

    try {
      const [baselineRes, sotaRes, saturatedRes] = await Promise.all([
        fetch(`/data/${model.baselineFile}`),
        fetch(`/data/${model.sotaFile}`),
        fetch(`/data/${model.saturatedFile}`),
      ]);

      if (!baselineRes.ok || !sotaRes.ok || !saturatedRes.ok) {
        throw new Error(`Failed to load ${modelId}`);
      }

      const [baseline, sota, saturated] = await Promise.all([
        baselineRes.json(),
        sotaRes.json(),
        saturatedRes.json(),
      ]);

      setLoadedModelsCache(prev => {
        const newMap = new Map(prev);
        newMap.set(modelId, { baseline, sota, saturated });
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

  // Get Total Risk samples for all three scenarios
  const totalRiskNode = getTotalRiskNode(modelData.baseline);
  const baselineTotalRiskSamples = totalRiskNode
    ? (modelData.baseline?.samples[totalRiskNode.id] as number[]) ?? []
    : [];
  const sotaTotalRiskSamples = totalRiskNode && modelData.sota
    ? (modelData.sota.samples[totalRiskNode.id] as number[]) ?? []
    : [];
  const saturatedTotalRiskSamples = totalRiskNode && modelData.saturated
    ? (modelData.saturated.samples[totalRiskNode.id] as number[]) ?? []
    : [];

  const isLoading = indexLoading || modelLoading;
  const showContent = !isLoading && !modelError && modelData.baseline;
  const isLandingPage = !selectedModelId;

  return (
    <div className="min-h-screen bg-safer-grey">
      <Header
        showBack={!isLandingPage}
        onBack={handleBackToHome}
      />

      {/* Landing Page */}
      {isLandingPage && (
        indexLoading ? (
          <LandingPageSkeleton />
        ) : index ? (
          <LandingPage index={index} onSelectModel={handleModelSelect} />
        ) : indexError ? (
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <ErrorMessage message={indexError} onRetry={refetchIndex} />
          </main>
        ) : null
      )}

      {/* Model View */}
      {!isLandingPage && (
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

              {/* Overall Risk Chart — moved above tables */}
              {isLoading ? (
                <OverallRiskChartSkeleton />
              ) : showContent && baselineTotalRiskSamples.length > 0 ? (
                <OverallRiskChart
                  baselineSamples={baselineTotalRiskSamples}
                  sotaSamples={sotaTotalRiskSamples}
                  saturatedSamples={saturatedTotalRiskSamples}
                  title="Total Risk Distribution"
                />
              ) : null}

              {/* Bayesian Network Placeholder */}
              {showContent && (
                <BayesianNetworkPlaceholder />
              )}

              {/* Divider */}
              {showContent && (
                <hr className="border-t-2 border-safer-charcoal/10 my-2" />
              )}

              {/* KRI Mappings Button */}
              {showContent && Object.keys(benchmarkMappings).length > 0 && (
                <div className="flex justify-end">
                  <button
                    onClick={() => setIsKRIModalOpen(true)}
                    className="text-sm font-medium text-safer-purple hover:text-safer-purple/80 transition-colors px-3 py-1.5 rounded-lg hover:bg-safer-purple/5"
                  >
                    Show KRI Mappings
                  </button>
                </div>
              )}

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
      )}

      {/* Distribution Modal */}
      <DistributionModal
        estimate={selectedEstimate}
        isOpen={isDistModalOpen}
        onClose={() => setIsDistModalOpen(false)}
      />

      {/* KRI Mappings Modal */}
      <KRIMappingsModal
        mappings={benchmarkMappings}
        isOpen={isKRIModalOpen}
        onClose={() => setIsKRIModalOpen(false)}
      />
    </div>
  );
}

export default App;
