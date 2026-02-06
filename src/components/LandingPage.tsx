import type { RiskModelsIndex } from '../types';

interface LandingPageProps {
  index: RiskModelsIndex;
  onSelectModel: (modelId: string) => void;
}

export function LandingPage({ index, onSelectModel }: LandingPageProps) {
  // Models with actual data files (RM1 and RM2 based on current mock data)
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
        </p>
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
