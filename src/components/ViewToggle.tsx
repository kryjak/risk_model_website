import type { ViewMode } from '../types';

interface ViewToggleProps {
  activeView: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export function ViewToggle({ activeView, onViewChange }: ViewToggleProps) {
  return (
    <div className="flex bg-safer-grey rounded-lg p-1 gap-1">
      <button
        onClick={() => onViewChange('byModel')}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
          activeView === 'byModel'
            ? 'bg-safer-blue text-white shadow-sm'
            : 'text-safer-charcoal hover:bg-white/50'
        }`}
        aria-pressed={activeView === 'byModel'}
      >
        By Risk Model
      </button>
      <button
        onClick={() => onViewChange('byParameter')}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
          activeView === 'byParameter'
            ? 'bg-safer-blue text-white shadow-sm'
            : 'text-safer-charcoal hover:bg-white/50'
        }`}
        aria-pressed={activeView === 'byParameter'}
      >
        By Parameter
      </button>
    </div>
  );
}
