import { FileText, Map } from 'lucide-react';

interface ScenarioCardProps {
  title: string;
  description: string;
  onShowKRIMappings?: () => void;
  hasKRIMappings?: boolean;
}

export function ScenarioCard({ title, description, onShowKRIMappings, hasKRIMappings }: ScenarioCardProps) {
  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <FileText className="w-5 h-5 text-safer-blue flex-shrink-0 mt-1" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-serif font-medium text-safer-charcoal mb-2">
            {title}
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            {description}
          </p>
          {hasKRIMappings && onShowKRIMappings && (
            <div className="mt-3">
              <button
                onClick={onShowKRIMappings}
                className="flex items-center gap-1.5 text-sm font-medium text-safer-purple border border-safer-purple/30 rounded-lg px-3 py-1.5 hover:bg-safer-purple/5 transition-colors"
              >
                <Map className="w-4 h-4" />
                Show KRI Mappings
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Skeleton version
export function ScenarioCardSkeleton() {
  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <div className="skeleton w-5 h-5 rounded flex-shrink-0" />
        <div className="flex-1">
          <div className="skeleton h-6 w-3/4 mb-3" />
          <div className="skeleton h-4 w-full mb-2" />
          <div className="skeleton h-4 w-5/6" />
        </div>
      </div>
    </div>
  );
}
