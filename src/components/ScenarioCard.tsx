import { useState } from 'react';
import { ChevronDown, ChevronUp, FileText, Map } from 'lucide-react';

interface ScenarioCardProps {
  title: string;
  description: string;
  onShowKRIMappings?: () => void;
  hasKRIMappings?: boolean;
}

export function ScenarioCard({ title, description, onShowKRIMappings, hasKRIMappings }: ScenarioCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Truncate description for collapsed view
  const maxLength = 200;
  const shouldTruncate = description.length > maxLength;
  const displayText = isExpanded || !shouldTruncate
    ? description
    : description.slice(0, maxLength) + '...';

  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <FileText className="w-5 h-5 text-safer-blue flex-shrink-0 mt-1" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-serif font-medium text-safer-charcoal mb-2">
            {title}
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            {displayText}
          </p>
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            {shouldTruncate && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 text-sm text-safer-blue hover:text-safer-purple transition-colors"
                aria-expanded={isExpanded}
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    Read more
                  </>
                )}
              </button>
            )}
            {hasKRIMappings && onShowKRIMappings && (
              <button
                onClick={onShowKRIMappings}
                className="flex items-center gap-1.5 text-sm font-medium text-safer-purple border border-safer-purple/30 rounded-lg px-3 py-1.5 hover:bg-safer-purple/5 transition-colors"
              >
                <Map className="w-4 h-4" />
                Show KRI Mappings
              </button>
            )}
          </div>
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
