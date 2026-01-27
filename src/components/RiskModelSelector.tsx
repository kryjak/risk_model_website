import type { RiskModelIndexEntry } from '../types';

interface RiskModelSelectorProps {
  models: RiskModelIndexEntry[];
  selectedModelId: string | null;
  onSelectModel: (modelId: string) => void;
  isLoading?: boolean;
}

export function RiskModelSelector({
  models,
  selectedModelId,
  onSelectModel,
  isLoading,
}: RiskModelSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Risk model selector">
      {models.map((model) => (
        <button
          key={model.id}
          onClick={() => onSelectModel(model.id)}
          disabled={isLoading}
          title={model.name}
          className={`
            relative px-4 py-2 rounded-full text-sm font-medium
            transition-all duration-200 min-w-[60px]
            ${
              selectedModelId === model.id
                ? 'bg-safer-purple text-white shadow-md ring-2 ring-safer-purple ring-offset-2'
                : 'bg-white text-safer-charcoal border border-gray-200 hover:border-safer-blue hover:bg-safer-grey'
            }
            ${isLoading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
          `}
          aria-pressed={selectedModelId === model.id}
        >
          {model.id}
          {selectedModelId === model.id && (
            <span className="sr-only"> (selected)</span>
          )}
        </button>
      ))}
    </div>
  );
}

// Skeleton version for loading state
export function RiskModelSelectorSkeleton() {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          className="skeleton w-[60px] h-[38px] rounded-full"
        />
      ))}
    </div>
  );
}
