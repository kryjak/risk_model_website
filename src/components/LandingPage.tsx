import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { RiskModelsIndex } from '../types';

interface LandingPageProps {
  index: RiskModelsIndex;
  onSelectModel: (modelId: string) => void;
}

export function LandingPage({ index, onSelectModel }: LandingPageProps) {
  const [showGuide, setShowGuide] = useState(false);
  const modelsWithData = new Set(['RM1', 'RM2']);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-serif font-light text-safer-charcoal mb-3">
          Risk Model Explorer
        </h2>
        <p className="text-gray-500 max-w-2xl mx-auto">
          Explore quantitative risk models for AI-enabled cyber threats. Each model
          captures a specific attack scenario with Bayesian network analysis across
          baseline, SOTA, and saturated AI capability levels.
          {' '}
          <a
            href="https://forms.gle/rGr99QezryNVrnyH7"
            target="_blank"
            rel="noopener noreferrer"
            className="text-safer-purple hover:text-safer-purple/80 underline underline-offset-2"
          >
            We welcome your feedback.
          </a>
        </p>
      </div>

      {/* How to Use This Dashboard */}
      <div className="max-w-3xl mx-auto mb-10">
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="flex items-center gap-2 mx-auto text-sm font-medium text-safer-blue hover:text-safer-blue/80 transition-colors"
        >
          {showGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          How to use this dashboard
        </button>

        {showGuide && (
          <div className="mt-4 card text-sm text-gray-600 leading-relaxed space-y-3">
            <p>
              This dashboard presents results from{' '}
              <a
                href="https://arxiv.org/abs/2512.08864"
                target="_blank"
                rel="noopener noreferrer"
                className="text-safer-blue hover:underline"
              >
                quantitative risk models for AI-enabled cyber offense
              </a>
              . Each model decomposes a specific cyber attack scenario into four risk
              factors: the <strong>number of threat actors</strong>, the <strong>frequency
              of attack attempts</strong>, the <strong>probability of a successful
              attack</strong> (broken down into individual steps using the MITRE ATT&CK
              framework), and the <strong>resulting financial damage</strong>. These
              factors are combined in a Bayesian network and propagated via Monte Carlo
              simulation to produce an overall risk distribution.
            </p>
            <p>
              Three AI capability levels are compared: <strong>Baseline</strong> (no
              meaningful AI assistance), <strong>SOTA</strong> (current state-of-the-art
              AI capabilities), and <strong>Saturated</strong> (a hypothetical AI that
              can solve all tasks in the benchmarks we condition on). Estimates were
              produced through structured expert elicitation and LLM-simulated expert
              judgement, mapping cybersecurity benchmark performance (Cybench and
              BountyBench) to changes in each risk factor.
            </p>
            <p>
              <strong>To navigate:</strong> click any model card below to explore its
              risk estimates in detail. Once inside a model, use the{' '}
              <em>"By Risk Model"</em> view to examine all parameters for that scenario,
              or switch to <em>"By Parameter"</em> to compare a single factor across
              multiple models. Tables display the 5th percentile, mode, and 95th
              percentile of each estimate; click the chart icon on any row to view the
              full probability distribution.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {index.models.map((model) => {
          const hasData = modelsWithData.has(model.id);
          return (
            <div
              key={model.id}
              className={`card flex flex-col transition-shadow ${
                hasData ? 'hover:shadow-md cursor-pointer' : 'opacity-60'
              }`}
              onClick={hasData ? () => onSelectModel(model.id) : undefined}
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-mono text-safer-blue font-medium">
                  {model.id}
                </span>
                {!hasData && (
                  <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-medium">
                    No Data
                  </span>
                )}
              </div>
              <h3 className="text-lg font-serif font-medium text-safer-charcoal mb-2 leading-snug">
                {model.name}
              </h3>
              <p className="text-sm text-gray-500 flex-1 line-clamp-3">
                {model.description}
              </p>
              <div className="mt-4 pt-3 border-t border-gray-100">
                {hasData ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectModel(model.id);
                    }}
                    className="w-full text-sm font-medium text-white bg-safer-blue hover:bg-safer-blue/90 rounded-lg py-2 transition-colors"
                  >
                    Load Model
                  </button>
                ) : (
                  <button
                    disabled
                    className="w-full text-sm font-medium text-gray-400 bg-gray-100 rounded-lg py-2 cursor-not-allowed"
                  >
                    Coming Soon
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LandingPageSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="text-center mb-10">
        <div className="skeleton h-9 w-64 mx-auto mb-3" />
        <div className="skeleton h-5 w-96 mx-auto" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="card">
            <div className="skeleton h-4 w-12 mb-3" />
            <div className="skeleton h-6 w-3/4 mb-2" />
            <div className="skeleton h-4 w-full mb-1" />
            <div className="skeleton h-4 w-2/3 mb-4" />
            <div className="skeleton h-9 w-full rounded-lg mt-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
