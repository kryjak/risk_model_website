import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronRight, ChevronUp, BarChart3, Copy, Check, Info } from 'lucide-react';
import type { ParameterEstimate, TechniqueChild, TableType } from '../types';
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
    <div className="card overflow-visible p-0">
      <h3 className="text-lg font-serif font-medium text-safer-charcoal p-4 pb-2">
        {title}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-safer-grey/50 border-b border-gray-100">
              <th className="text-left py-2 px-3 font-medium text-gray-500 w-8"></th>
              <th className="text-left py-2 px-3 font-medium text-gray-500 w-[12%] min-w-[120px]">Parameter</th>
              <th className="text-right py-2 px-3 font-medium text-gray-500 w-[18%] min-w-[9rem]">5th %</th>
              <th className="text-right py-2 px-3 font-medium text-gray-500 w-[18%] min-w-[9rem]">Mode</th>
              <th className="text-right py-2 px-3 font-medium text-gray-500 w-[18%] min-w-[9rem]">95th %</th>
              <th className="text-left py-2 px-3 font-medium text-gray-500">Rationale</th>
              <th className="text-center py-2 px-3 font-medium text-gray-500 w-12">Dist.</th>
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
  const hasTechniques = estimate.techniqueChildren && estimate.techniqueChildren.length > 0;

  const format = (value: number) => {
    if (tableType === 'probability' || estimate.nodeType === 'continuous') {
      return formatValue(value, undefined, 'continuous');
    }
    return formatValue(value, estimate.unit, estimate.nodeType);
  };

  // Scenarios
  const scenarios = [
    { name: 'Baseline', data: estimate.baseline, rationale: estimate.baselineRationale || '', color: 'safer-blue' as const },
    { name: 'SOTA', data: estimate.sota, rationale: estimate.sotaRationale || '', color: 'safer-purple' as const },
    { name: 'Saturated', data: estimate.saturated, rationale: estimate.saturatedRationale || '', color: 'safer-teal' as const },
  ];

  // Calculate ranges with dynamic colour assignment
  const getRange = (getValue: (s: typeof scenarios[0]) => number) => {
    const values = scenarios.map(s => ({ value: getValue(s), color: s.color }));
    const sorted = [...values].sort((a, b) => a.value - b.value);
    return {
      min: sorted[0].value,
      mid: sorted[1].value,
      max: sorted[2].value,
      minColor: sorted[0].color,
      midColor: sorted[1].color,
      maxColor: sorted[2].color,
      allSame: sorted[0].value === sorted[2].value,
    };
  };

  const rangeP5 = getRange(s => s.data.p5);
  const rangeP50 = getRange(s => s.data.p50);
  const rangeP95 = getRange(s => s.data.p95);

  return (
    <>
      {/* Collapsed summary row */}
      <tr
        className={`border-b border-gray-100 hover:bg-safer-grey/30 cursor-pointer transition-colors ${
          isExpanded ? 'bg-safer-grey/20' : ''
        }`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <td className="py-3 px-3">
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
        <td className="py-3 px-3">
          <div className="font-medium text-safer-charcoal">{estimate.name}</div>
        </td>
        <td className="py-3 px-3 text-right font-medium">
          <RangeDisplay range={rangeP5} format={format} />
        </td>
        <td className="py-3 px-3 text-right font-medium">
          <RangeDisplay range={rangeP50} format={format} />
        </td>
        <td className="py-3 px-3 text-right font-medium">
          <RangeDisplay range={rangeP95} format={format} />
        </td>
        <td className="py-3 px-3">
          <span className="text-gray-400 text-sm italic">
            {isExpanded ? '' : 'Toggle to view rationales'}
          </span>
        </td>
        <td className="py-3 px-3 text-center">
          {estimate.samplesAvailable && (
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
          )}
        </td>
      </tr>

      {/* Expanded content */}
      {isExpanded && hasTechniques && (
        <TechniqueGroup
          techniques={estimate.techniqueChildren!}
          parentFormat={format}
        />
      )}
      {isExpanded && !hasTechniques && scenarios.map((scenario) => (
        <ScenarioRow
          key={scenario.name}
          scenario={scenario}
          format={format}

        />
      ))}
    </>
  );
}

// Technique group with AND/OR connector
interface TechniqueGroupProps {
  techniques: TechniqueChild[];
  parentFormat: (v: number) => string;
}

function TechniqueGroup({ techniques, parentFormat }: TechniqueGroupProps) {
  const combinationMode = techniques[0]?.combinationMode || 'AND';
  const connectorColor =
    combinationMode === 'AND' ? '#2B6CB0' :
    combinationMode === 'XOR' ? '#D97706' :
    '#BC4B51';

  const tooltipText =
    combinationMode === 'AND'
      ? 'AND: all techniques must succeed for the tactic to succeed (probabilities multiply).'
      : combinationMode === 'XOR'
        ? 'XOR: the actor commits to a single technique (exclusive choice — only one is attempted).'
        : 'OR: success in any one technique is sufficient for the tactic to succeed (combined via inclusion-exclusion).';

  return (
    <>
      {/* AND/OR explanation row — only meaningful with 2+ techniques */}
      {techniques.length > 1 && (
        <tr className="border-b border-gray-50 bg-safer-light-purple/10">
          <td className="py-1.5 px-3" />
          <td className="py-1.5 px-3 pl-8" colSpan={6}>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Info className="w-3.5 h-3.5 flex-shrink-0" style={{ color: connectorColor }} />
              <span>{tooltipText}</span>
            </div>
          </td>
        </tr>
      )}
      {techniques.map((technique, idx) => (
        <TechniqueRow
          key={technique.nodeId}
          technique={technique}
          parentFormat={parentFormat}
          isFirst={idx === 0}
          isLast={idx === techniques.length - 1}
          combinationMode={combinationMode}
          connectorColor={connectorColor}
          totalTechniques={techniques.length}
        />
      ))}
    </>
  );
}

// Individual technique row
interface TechniqueRowProps {
  technique: TechniqueChild;
  parentFormat: (v: number) => string;
  isFirst: boolean;
  isLast: boolean;
  combinationMode: string;
  connectorColor: string;
  totalTechniques: number;
}

function TechniqueRow({
  technique,
  parentFormat,
  isFirst,
  isLast,
  combinationMode,
  connectorColor,
  totalTechniques,
}: TechniqueRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const scenarios = [
    { name: 'Baseline', data: technique.baseline, rationale: technique.baselineRationale || '', color: 'safer-blue' as const },
    { name: 'SOTA', data: technique.sota, rationale: technique.sotaRationale || '', color: 'safer-purple' as const },
    { name: 'Saturated', data: technique.saturated, rationale: technique.saturatedRationale || '', color: 'safer-teal' as const },
  ];

  const getRange = (getValue: (s: typeof scenarios[0]) => number) => {
    const values = scenarios.map(s => ({ value: getValue(s), color: s.color }));
    const sorted = [...values].sort((a, b) => a.value - b.value);
    return {
      min: sorted[0].value,
      mid: sorted[1].value,
      max: sorted[2].value,
      minColor: sorted[0].color,
      midColor: sorted[1].color,
      maxColor: sorted[2].color,
      allSame: sorted[0].value === sorted[2].value,
    };
  };

  const rangeP5 = getRange(s => s.data.p5);
  const rangeP50 = getRange(s => s.data.p50);
  const rangeP95 = getRange(s => s.data.p95);

  return (
    <>
      <tr
        className="border-b border-gray-50 bg-safer-light-purple/20 hover:bg-safer-light-purple/40 cursor-pointer transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <td className="py-2 px-3">
          <button className="p-0.5" aria-expanded={isExpanded}>
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-gray-400" />
            ) : (
              <ChevronRight className="w-3 h-3 text-gray-400" />
            )}
          </button>
        </td>
        <td className="py-2 px-3 pl-8">
          <div className="flex items-center gap-1">
            <svg
              width="20"
              height="24"
              className="flex-shrink-0 -ml-2"
              style={{ overflow: 'visible' }}
            >
              <line
                x1="10" y1={isFirst ? 12 : 0}
                x2="10" y2={isLast ? 12 : 24}
                stroke={connectorColor}
                strokeWidth="2"
              />
              <line
                x1="10" y1="12"
                x2="20" y2="12"
                stroke={connectorColor}
                strokeWidth="2"
              />
              {isFirst && totalTechniques > 1 && (
                <text
                  x="10"
                  y="-4"
                  textAnchor="middle"
                  fill={connectorColor}
                  fontSize="9"
                  fontWeight="bold"
                >
                  {combinationMode}
                </text>
              )}
            </svg>
            <span className="text-sm font-medium text-safer-charcoal/80">{technique.name}</span>
          </div>
        </td>
        <td className="py-2 px-3 text-right text-sm">
          <RangeDisplay range={rangeP5} format={parentFormat} />
        </td>
        <td className="py-2 px-3 text-right text-sm font-medium">
          <RangeDisplay range={rangeP50} format={parentFormat} />
        </td>
        <td className="py-2 px-3 text-right text-sm">
          <RangeDisplay range={rangeP95} format={parentFormat} />
        </td>
        <td className="py-2 px-3">
          <span className="text-gray-400 text-sm italic">
            {isExpanded ? '' : 'Toggle to view rationales'}
          </span>
        </td>
        <td className="py-2 px-3"></td>
      </tr>

      {isExpanded && scenarios.map((scenario) => (
        <ScenarioRow
          key={scenario.name}
          scenario={scenario}
          format={parentFormat}

          indent="pl-16"
        />
      ))}
    </>
  );
}

// Scenario row (Baseline / SOTA / Saturated)
function ScenarioRow({ scenario, format, indent = 'pl-8' }: {
  scenario: {
    name: string;
    data: { p5: number; p50: number; p95: number };
    rationale: string;
    color: 'safer-blue' | 'safer-purple' | 'safer-teal';
  };
  format: (v: number) => string;
  indent?: string;
}) {
  const bgClass = scenario.color === 'safer-blue'
    ? 'bg-safer-blue/5'
    : scenario.color === 'safer-purple'
      ? 'bg-safer-purple/5'
      : 'bg-safer-teal/5';

  const textClass = scenario.color === 'safer-blue'
    ? 'text-safer-blue'
    : scenario.color === 'safer-purple'
      ? 'text-safer-purple'
      : 'text-safer-teal';

  const dotClass = scenario.color === 'safer-blue'
    ? 'bg-safer-blue'
    : scenario.color === 'safer-purple'
      ? 'bg-safer-purple'
      : 'bg-safer-teal';

  return (
    <tr className={`border-b border-gray-50 ${bgClass}`}>
      <td className="py-2 px-3"></td>
      <td className={`py-2 px-3 ${indent}`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
          <span className={`text-sm font-medium ${textClass}`}>
            {scenario.name}
          </span>
        </div>
      </td>
      <td className={`py-2 px-3 text-right text-sm ${textClass}`}>
        {format(scenario.data.p5)}
      </td>
      <td className={`py-2 px-3 text-right text-sm font-medium ${textClass}`}>
        {format(scenario.data.p50)}
      </td>
      <td className={`py-2 px-3 text-right text-sm ${textClass}`}>
        {format(scenario.data.p95)}
      </td>
      <td className="py-2 px-3 text-sm text-gray-600">
        <RationaleCell text={scenario.rationale} />
      </td>
      <td className="py-2 px-3"></td>
    </tr>
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

// Range display with 3 values
function RangeDisplay({
  range,
  format
}: {
  range: { min: number; mid: number; max: number; minColor: string; midColor: string; maxColor: string; allSame: boolean };
  format: (v: number) => string;
}) {
  if (range.allSame) {
    return <span className={colorClasses[range.minColor] || 'text-gray-600'}>{format(range.min)}</span>;
  }

  if (range.min === range.mid) {
    return (
      <span className="whitespace-nowrap">
        <span className={colorClasses[range.minColor] || 'text-gray-600'}>{format(range.min)}</span>
        <span className="text-gray-400"> – </span>
        <span className={colorClasses[range.maxColor] || 'text-gray-600'}>{format(range.max)}</span>
      </span>
    );
  }

  return (
    <span className="whitespace-nowrap text-sm">
      <span className={colorClasses[range.minColor] || 'text-gray-600'}>{format(range.min)}</span>
      <span className="text-gray-400">–</span>
      <span className={`font-semibold ${colorClasses[range.midColor] || 'text-gray-600'}`}>{format(range.mid)}</span>
      <span className="text-gray-400">–</span>
      <span className={colorClasses[range.maxColor] || 'text-gray-600'}>{format(range.max)}</span>
    </span>
  );
}

// Rationale cell with inline expandable dropdown and copy button
function RationaleCell({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const maxLength = 35;
  const needsTruncation = text.length > maxLength;

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

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  // Only allow safe inline elements — links, bold, italic, code
  const allowedElements = ['a', 'strong', 'em', 'code', 'p'];
  const markdownComponents = {
    // Render <p> as inline <span> to keep rationale compact in table cells
    p: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-safer-blue underline hover:text-safer-purple">
        {children}
      </a>
    ),
  };

  if (!needsTruncation) {
    return (
      <span className="text-gray-600 text-sm">
        <ReactMarkdown allowedElements={allowedElements} components={markdownComponents} unwrapDisallowed>
          {text}
        </ReactMarkdown>
      </span>
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      {/* Controls row: copy (only when expanded) + toggle, right-aligned */}
      <div className="flex items-center justify-end gap-1">
        {isExpanded && (
          <button
            onClick={handleCopy}
            className="p-0.5 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="w-3 h-3 text-green-500" />
            ) : (
              <Copy className="w-3 h-3 text-gray-400 hover:text-safer-blue" />
            )}
          </button>
        )}
        <button
          onClick={toggleExpand}
          className="p-0.5 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
          aria-label={isExpanded ? 'Collapse rationale' : 'Expand rationale'}
          title={isExpanded ? 'Show less' : 'Show full rationale'}
        >
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-safer-blue" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-safer-blue" />
          )}
        </button>
      </div>

      {/* Collapsed: truncated text. Expanded: full markdown text */}
      {isExpanded ? (
        <div className="mt-1 text-sm text-gray-700 leading-relaxed bg-safer-grey/50 rounded p-2">
          <ReactMarkdown allowedElements={allowedElements} components={markdownComponents} unwrapDisallowed>
            {text}
          </ReactMarkdown>
        </div>
      ) : (
        <span className="text-gray-600 text-sm">{truncateText(text, maxLength)}</span>
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
              <td className="py-3 px-4"><div className="skeleton h-4 w-32" /></td>
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
