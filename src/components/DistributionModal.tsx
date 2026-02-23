import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { X, Download } from 'lucide-react';
import Plot from 'react-plotly.js';
import type { ParameterEstimate } from '../types';
import { generateKDE, getSummaryStatistics } from '../utils/statistics';
import { formatValue } from '../utils/formatters';
import { generateCurrencyTicks } from '../utils/tickFormatter';

interface DistributionModalProps {
  estimate: ParameterEstimate | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DistributionModal({ estimate, isOpen, onClose }: DistributionModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const graphDivRef = useRef<HTMLElement | null>(null);
  const [plotKey, setPlotKey] = useState(0);

  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      // Force re-render of plot when modal opens to ensure proper sizing
      setPlotKey(prev => prev + 1);
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const handlePlotInit = useCallback((_figure: any, graphDiv: HTMLElement) => {
    graphDivRef.current = graphDiv;
  }, []);

  const handleDownload = useCallback(() => {
    if (graphDivRef.current && estimate) {
      import('plotly.js').then((Plotly) => {
        Plotly.downloadImage(graphDivRef.current as HTMLElement, {
          format: 'png',
          filename: `${estimate.name.replace(/\s+/g, '_')}_distribution`,
          width: 1200,
          height: 600,
        });
      });
    }
  }, [estimate]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === modalRef.current) {
      onClose();
    }
  }, [onClose]);

  const isCurrencyAxis = estimate?.unit?.includes('$') ?? false;
  const xTicks = useMemo(() => {
    if (!estimate || !isCurrencyAxis) return null;
    return generateCurrencyTicks([estimate.baselineSamples, estimate.sotaSamples, estimate.saturatedSamples]);
  }, [estimate, isCurrencyAxis]);

  if (!isOpen || !estimate) return null;

  const baselineKDE = generateKDE(estimate.baselineSamples);
  const sotaKDE = generateKDE(estimate.sotaSamples);
  const saturatedKDE = generateKDE(estimate.saturatedSamples);
  const baselineStats = getSummaryStatistics(estimate.baselineSamples);
  const sotaStats = getSummaryStatistics(estimate.sotaSamples);
  const saturatedStats = getSummaryStatistics(estimate.saturatedSamples);

  const hasValidData = baselineKDE.x.length > 0;

  const format = (value: number) => {
    if (estimate.nodeType === 'continuous') {
      return formatValue(value, undefined, 'continuous');
    }
    return formatValue(value, estimate.unit, estimate.nodeType);
  };

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 id="modal-title" className="text-xl font-serif font-medium text-safer-charcoal">
            {estimate.name} Distribution
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Download as PNG"
            >
              <Download className="w-5 h-5 text-gray-500" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 p-6 overflow-auto" style={{ minHeight: '500px' }}>
          {hasValidData ? (
            <div style={{ width: '100%', height: '400px' }}>
              <Plot
                key={plotKey}
                onInitialized={handlePlotInit}
                onUpdate={handlePlotInit}
                data={[
                {
                  x: baselineKDE.x,
                  y: baselineKDE.y,
                  type: 'scatter',
                  mode: 'lines',
                  name: 'Baseline',
                  fill: 'tozeroy',
                  fillcolor: 'rgba(43, 108, 176, 0.25)',
                  line: { color: '#2B6CB0', width: 2 },
                },
                {
                  x: sotaKDE.x,
                  y: sotaKDE.y,
                  type: 'scatter',
                  mode: 'lines',
                  name: 'SOTA',
                  fill: 'tozeroy',
                  fillcolor: 'rgba(112, 12, 140, 0.25)',
                  line: { color: '#700C8C', width: 2 },
                },
                {
                  x: saturatedKDE.x,
                  y: saturatedKDE.y,
                  type: 'scatter',
                  mode: 'lines',
                  name: 'Saturated',
                  fill: 'tozeroy',
                  fillcolor: 'rgba(45, 106, 79, 0.25)',
                  line: { color: '#2D6A4F', width: 2 },
                },
              ]}
              layout={{
                autosize: true,
                margin: { t: 40, r: 40, b: 60, l: 60 },
                paper_bgcolor: 'transparent',
                plot_bgcolor: 'transparent',
                font: {
                  family: 'Season Sans, system-ui, sans-serif',
                  color: '#202137',
                },
                xaxis: {
                  title: { text: estimate.unit || 'Value' },
                  gridcolor: '#E5E7EB',
                  zerolinecolor: '#9CA3AF',
                  ...(xTicks ? { tickvals: xTicks.tickvals, ticktext: xTicks.ticktext } : {}),
                },
                yaxis: {
                  title: { text: 'Density' },
                  gridcolor: '#E5E7EB',
                  zerolinecolor: '#9CA3AF',
                },
                legend: {
                  orientation: 'h',
                  yanchor: 'bottom',
                  y: 1.02,
                  xanchor: 'right',
                  x: 1,
                },
                hovermode: 'x unified',
              }}
              config={{
                responsive: true,
                displayModeBar: true,
                modeBarButtonsToRemove: ['lasso2d', 'select2d'],
                displaylogo: false,
                scrollZoom: true,
              }}
              style={{ width: '100%', height: '100%' }}
            />
            </div>
          ) : (
            <div className="flex items-center justify-center h-[350px] bg-safer-grey/30 rounded-lg">
              <p className="text-gray-500">No distribution data available</p>
            </div>
          )}

          <div className="mt-6 grid grid-cols-3 gap-4">
            <StatisticsPanel title="Baseline" stats={baselineStats} color="safer-blue" format={format} />
            <StatisticsPanel title="SOTA" stats={sotaStats} color="safer-purple" format={format} />
            <StatisticsPanel title="Saturated" stats={saturatedStats} color="safer-teal" format={format} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatisticsPanel({ title, stats, color, format }: {
  title: string;
  stats: ReturnType<typeof getSummaryStatistics>;
  color: string;
  format: (value: number) => string;
}) {
  const colorClass = color === 'safer-blue' ? 'text-safer-blue' : color === 'safer-purple' ? 'text-safer-purple' : 'text-safer-teal';
  const bgClass = color === 'safer-blue' ? 'bg-safer-blue/5' : color === 'safer-purple' ? 'bg-safer-purple/5' : 'bg-safer-teal/5';

  return (
    <div className={`rounded-lg p-4 ${bgClass}`}>
      <h4 className={`font-medium mb-3 ${colorClass}`}>{title}</h4>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div><span className="text-gray-500">Mean:</span> <span className="font-medium text-safer-charcoal">{format(stats.mean)}</span></div>
        <div><span className="text-gray-500">Median:</span> <span className="font-medium text-safer-charcoal">{format(stats.median)}</span></div>
        <div><span className="text-gray-500">5th %:</span> <span className="font-medium text-safer-charcoal">{format(stats.p5)}</span></div>
        <div><span className="text-gray-500">95th %:</span> <span className="font-medium text-safer-charcoal">{format(stats.p95)}</span></div>
        <div><span className="text-gray-500">Std Dev:</span> <span className="font-medium text-safer-charcoal">{format(stats.stdDev)}</span></div>
        <div><span className="text-gray-500">Range:</span> <span className="font-medium text-safer-charcoal">{format(stats.min)} – {format(stats.max)}</span></div>
      </div>
    </div>
  );
}
