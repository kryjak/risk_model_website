import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, BarChart3, Copy, Check } from 'lucide-react';
import type { ParameterEstimate, TableType } from '../types';
import { formatValue, truncateText } from '../utils/formatters';

interface EstimatesTableProps {
  title: string;
  estimates: ParameterEstimate[];
  tableType: TableType;
  onShowDistribution: (estimate: ParameterEstimate) => void;
}

export function EstimatesTable({
  title,
  estimates,
  tableType,
  onShowDistribution,
}: EstimatesTableProps) {
  if (estimates.length === 0) {
    return null;
  }

  return (
    <div className="card overflow-hidden p-0">
      <h3 className="text-lg font-serif font-medium text-safer-charcoal p-4 pb-2">
        {title}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-safer-grey/50 border-b border-gray-100">
              <th className="text-left py-2 px-4 font-medium text-gray-500 w-8"></th>
              <th className="text-left py-2 px-4 font-medium text-gray-500">Parameter</th>
              <th className="text-right py-2 px-4 font-medium text-gray-500 w-36">5th %</th>
              <th className="text-right py-2 px-4 font-medium text-gray-500 w-36">50th %</th>
              <th className="text-right py-2 px-4 font-medium text-gray-500 w-36">95th %</th>
              <th className="text-left py-2 px-4 font-medium text-gray-500 min-w-[180px]">Rationale</th>
              <th className="text-center py-2 px-4 font-medium text-gray-500 w-12">Dist.</th>
            </tr>
          </thead>
          <tbody>
            {estimates.map((estimate) => (
              <ParameterRows
                key={estimate.nodeId}
                estimate={estimate}
                tableType={tableType}
                onShowDistribution={() => onShowDistribution(estimate)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface ParameterRowsProps {
  estimate: ParameterEstimate;
  tableType: TableType;
  onShowDistribution: () => void;
}

function ParameterRows({ estimate, tableType, onShowDistribution }: ParameterRowsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const format = (value: number) => {
    if (tableType === 'probability' || estimate.nodeType === 'continuous') {
      return formatValue(value, undefined, 'continuous');
    }
    return formatValue(value, estimate.unit, estimate.nodeType);
  };

  // Scenarios
  const scenarios = [
    { name: 'Baseline', data: estimate.baseline, rationale: estimate.rationale || '', color: 'safer-blue' as const },
    { name: 'AI-Uplifted', data: estimate.uplifted, rationale: 'LLM assistance increases capability', color: 'safer-purple' as const },
  ];

  // Calculate ranges with dynamic colour assignment based on which scenario has min/max
  const getRange = (getValue: (s: typeof scenarios[0]) => number) => {
    const values = scenarios.map(s => ({ value: getValue(s), color: s.color }));
    const min = Math.min(...values.map(v => v.value));
    const max = Math.max(...values.map(v => v.value));
    
    // Find which scenario has the min and max values
    const minScenario = values.find(v => v.value === min)!;
    const maxScenario = [...values].reverse().find((v: { value: number; color: string }) => v.value === max)!; // Use last match for max (latest scenario)
    
    return { 
      min, 
      max, 
      minColor: minScenario.color,
      maxColor: maxScenario.color,
      isSame: min === max 
    };
  };

  const rangeP5 = getRange(s => s.data.p5);
  const rangeP50 = getRange(s => s.data.p50);
  const rangeP95 = getRange(s => s.data.p95);

  const hasRationale = estimate.rationale && estimate.rationale.trim().length > 0;

  return (
    <>
      {/* Collapsed summary row */}
      <tr 
        className={`border-b border-gray-100 hover:bg-safer-grey/30 cursor-pointer transition-colors ${
          isExpanded ? 'bg-safer-grey/20' : ''
        }`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <td className="py-3 px-4">
          <button
            className="p-0.5"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </button>
        </td>
        <td className="py-3 px-4">
          <div className="font-medium text-safer-charcoal">{estimate.name}</div>
        </td>
        <td className="py-3 px-4 text-right font-medium">
          <RangeDisplay range={rangeP5} format={format} />
        </td>
        <td className="py-3 px-4 text-right font-medium">
          <RangeDisplay range={rangeP50} format={format} />
        </td>
        <td className="py-3 px-4 text-right font-medium">
          <RangeDisplay range={rangeP95} format={format} />
        </td>
        <td className="py-3 px-4">
          {hasRationale ? (
            <RationaleCell text={estimate.rationale} />
          ) : (
            <span className="text-no-rationale text-sm">No rationale available</span>
          )}
        </td>
        <td className="py-3 px-4 text-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShowDistribution();
            }}
            className="p-1.5 hover:bg-safer-blue/10 rounded-lg transition-colors"
            aria-label={`Show distribution for ${estimate.name}`}
            title="View distribution"
          >
            <BarChart3 className="w-4 h-4 text-safer-blue" />
          </button>
        </td>
      </tr>

      {/* Expanded scenario rows */}
      {isExpanded && scenarios.map((scenario, idx) => (
        <tr 
          key={scenario.name}
          className={`border-b border-gray-50 ${
            scenario.color === 'safer-blue' ? 'bg-safer-blue/5' : 'bg-safer-purple/5'
          }`}
        >
          <td className="py-2 px-4"></td>
          <td className="py-2 px-4 pl-8">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                scenario.color === 'safer-blue' ? 'bg-safer-blue' : 'bg-safer-purple'
              }`} />
              <span className={`text-sm font-medium ${
                scenario.color === 'safer-blue' ? 'text-safer-blue' : 'text-safer-purple'
              }`}>
                {scenario.name}
              </span>
            </div>
          </td>
          <td className={`py-2 px-4 text-right text-sm ${
            scenario.color === 'safer-blue' ? 'text-safer-blue' : 'text-safer-purple'
          }`}>
            {format(scenario.data.p5)}
          </td>
          <td className={`py-2 px-4 text-right text-sm font-medium ${
            scenario.color === 'safer-blue' ? 'text-safer-blue' : 'text-safer-purple'
          }`}>
            {format(scenario.data.p50)}
          </td>
          <td className={`py-2 px-4 text-right text-sm ${
            scenario.color === 'safer-blue' ? 'text-safer-blue' : 'text-safer-purple'
          }`}>
            {format(scenario.data.p95)}
          </td>
          <td className="py-2 px-4 text-sm text-gray-600">
            {idx === 0 ? (
              hasRationale ? (
                <RationaleCell text={scenario.rationale} />
              ) : (
                <span className="text-no-rationale">No rationale available</span>
              )
            ) : (
              <RationaleCell text={scenario.rationale} />
            )}
          </td>
          <td className="py-2 px-4"></td>
        </tr>
      ))}
    </>
  );
}

// Colour class mapping
const colorClasses: Record<string, string> = {
  'safer-blue': 'text-safer-blue',
  'safer-purple': 'text-safer-purple',
  'safer-teal': 'text-safer-teal',
  'safer-red': 'text-safer-red',
  'safer-green': 'text-safer-green',
};

// Range display with dynamically determined colours based on which scenario has min/max
function RangeDisplay({ 
  range, 
  format 
}: { 
  range: { min: number; max: number; minColor: string; maxColor: string; isSame: boolean }; 
  format: (v: number) => string;
}) {
  if (range.isSame) {
    return <span className={colorClasses[range.minColor] || 'text-gray-600'}>{format(range.min)}</span>;
  }

  return (
    <span className="whitespace-nowrap">
      <span className={colorClasses[range.minColor] || 'text-gray-600'}>{format(range.min)}</span>
      <span className="text-gray-400"> – </span>
      <span className={colorClasses[range.maxColor] || 'text-gray-600'}>{format(range.max)}</span>
    </span>
  );
}

// Rationale cell with truncation and copyable popup
function RationaleCell({ text }: { text: string }) {
  const [showPopup, setShowPopup] = useState(false);
  const [copied, setCopied] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const maxLength = 35;
  const needsTruncation = text.length > maxLength;

  // Close popup when clicking outside
  useEffect(() => {
    if (!showPopup) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popupRef.current && 
        !popupRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setShowPopup(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPopup]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (!needsTruncation) {
    return <span className="text-gray-600 text-sm">{text}</span>;
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setShowPopup(!showPopup);
        }}
        className="text-left text-gray-600 text-sm hover:text-safer-blue transition-colors"
        title="Click to see full rationale"
      >
        {truncateText(text, maxLength)}
      </button>

      {showPopup && (
        <div
          ref={popupRef}
          className="absolute z-50 left-0 top-full mt-1 w-80 bg-white rounded-lg shadow-lg border border-gray-200 p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Rationale
            </span>
            <button
              onClick={handleCopy}
              className="p-1 hover:bg-gray-100 rounded transition-colors flex items-center gap-1 text-xs text-gray-500 hover:text-safer-blue"
              title="Copy to clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-green-500" />
                  <span className="text-green-500">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
        </div>
      )}
    </div>
  );
}

// Skeleton version
export function EstimatesTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="skeleton h-6 w-48 m-4 mb-2" />
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-safer-grey/50 border-b border-gray-100">
            <th className="py-2 px-4 w-8"></th>
            <th className="py-2 px-4"><div className="skeleton h-4 w-20" /></th>
            <th className="py-2 px-4"><div className="skeleton h-4 w-12 ml-auto" /></th>
            <th className="py-2 px-4"><div className="skeleton h-4 w-12 ml-auto" /></th>
            <th className="py-2 px-4"><div className="skeleton h-4 w-12 ml-auto" /></th>
            <th className="py-2 px-4"><div className="skeleton h-4 w-24" /></th>
            <th className="py-2 px-4"><div className="skeleton h-4 w-8 mx-auto" /></th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} className="border-b border-gray-100">
              <td className="py-3 px-4"><div className="skeleton w-4 h-4" /></td>
              <td className="py-3 px-4">
                <div className="skeleton h-4 w-32" />
              </td>
              <td className="py-3 px-4"><div className="skeleton h-4 w-24 ml-auto" /></td>
              <td className="py-3 px-4"><div className="skeleton h-4 w-24 ml-auto" /></td>
              <td className="py-3 px-4"><div className="skeleton h-4 w-24 ml-auto" /></td>
              <td className="py-3 px-4"><div className="skeleton h-4 w-32" /></td>
              <td className="py-3 px-4"><div className="skeleton h-6 w-6 mx-auto rounded" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
