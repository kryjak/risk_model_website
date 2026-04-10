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
import { FeedbackButton } from './components/FeedbackButton';
import { useRiskModelsIndex } from './hooks/useRiskModelsIndex';
import { useModelData } from './hooks/useModelData';
import type { SplitModelData } from './hooks/useModelData';
import { useUrlParams } from './hooks/useUrlParams';
import type { ViewMode, ParameterEstimate, ModelRationales, ModelPercentiles, ModelSamples } from './types';

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
    totalRiskSamples,
    modelDescription,
    isLoading: modelLoading,
    error: modelError,
    refetch: refetchModel,
  } = useModelData(selectedModel);

  // Cache of loaded models for ByParameterView
  const [loadedModelsCache, setLoadedModelsCache] = useState<
    Map<string, SplitModelData>
  >(new Map());

  // Modal states
  const [selectedEstimate, setSelectedEstimate] = useState<ParameterEstimate | null>(null);
  const [isDistModalOpen, setIsDistModalOpen] = useState(false);
  const [isKRIModalOpen, setIsKRIModalOpen] = useState(false);

  // Update cache when model data loads
  useEffect(() => {
    if (modelData.rationales && modelData.percentiles && selectedModelId) {
      setLoadedModelsCache(prev => {
        const newMap = new Map(prev);
        newMap.set(selectedModelId, modelData);
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
      // Fetch rationales + percentiles
      const [rationalesRes, percentilesRes] = await Promise.all([
        fetch(`/data/${model.rationalesFile}`),
        fetch(`/data/${model.percentilesFile}`),
      ]);

      if (!rationalesRes.ok || !percentilesRes.ok) {
        throw new Error(`Failed to load ${modelId}`);
      }

      const [rationales, percentiles] = await Promise.all([
        rationalesRes.json() as Promise<ModelRationales>,
        percentilesRes.json() as Promise<ModelPercentiles>,
      ]);

      // Optionally fetch samples
      let baselineSamples: ModelSamples | null = null;
      let sotaSamples: ModelSamples | null = null;
      let saturatedSamples: ModelSamples | null = null;

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
          }
        } catch {
          // Samples optional
        }
      }

      setLoadedModelsCache(prev => {
        const newMap = new Map(prev);
        newMap.set(modelId, {
          rationales,
          percentiles,
          samples: { baseline: baselineSamples, sota: sotaSamples, saturated: saturatedSamples },
        });
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

    for (const est of parameterEstimates) {
      if (est.name === 'Total Risk') continue;

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
    };
  }, [parameterEstimates]);

  const isLoading = indexLoading || modelLoading;
  const showContent = !isLoading && !modelError && modelData.rationales;
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

              {/* LLM Disclaimer — only for non-human-elicited models */}
              {showContent && selectedModel && !selectedModel.name.toLowerCase().includes('human') && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0 text-amber-500">⚠</span>
                  <p>
                    The LLM estimator used to produce these values is still under active development and has known limitations — in particular, LLMs tend to be overly conservative relative to human experts. These estimates should not be used to inform decision-making. We are actively working on improving the methodology; see our{' '}
                    <a
                      href="https://www.safer-ai.org/technical-report-llm-simulated-expert-judgement-for-quantitative-ai-risk-estimation"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-amber-900"
                    >
                      technical report on LLM-simulated expert judgement
                    </a>
                    {' '}for details.
                  </p>
                </div>
              )}

              {/* Scenario Description */}
              {isLoading ? (
                <ScenarioCardSkeleton />
              ) : showContent && selectedModel ? (
                <ScenarioCard
                  title={selectedModel.name}
                  description={modelDescription || selectedModel.description}
                  hasKRIMappings={Object.keys(benchmarkMappings).length > 0}
                  onShowKRIMappings={() => setIsKRIModalOpen(true)}
                />
              ) : null}

              {/* Overall Risk Chart — moved above tables */}
              {isLoading ? (
                <OverallRiskChartSkeleton />
              ) : showContent && totalRiskSamples.baseline.length > 0 ? (
                <OverallRiskChart
                  baselineSamples={totalRiskSamples.baseline}
                  sotaSamples={totalRiskSamples.sota}
                  saturatedSamples={totalRiskSamples.saturated}
                  title="Total Risk Distribution"
                />
              ) : null}

              {/* Bayesian Network Placeholder */}
              {showContent && (
                <BayesianNetworkPlaceholder modelId={selectedModelId} />
              )}

              {/* Divider */}
              {showContent && (
                <hr className="border-t-2 border-safer-charcoal/10 my-2" />
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

      {/* Feedback Button */}
      <FeedbackButton />

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
