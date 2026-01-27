import { useEffect, useRef, useCallback } from 'react';
import { X, Download } from 'lucide-react';
import Plot from 'react-plotly.js';
import type { ParameterEstimate } from '../types';
import { generateKDE, getSummaryStatistics } from '../utils/statistics';
import { formatValue } from '../utils/formatters';

interface DistributionModalProps {
  estimate: ParameterEstimate | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DistributionModal({ estimate, isOpen, onClose }: DistributionModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const graphDivRef = useRef<HTMLElement | null>(null);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Close on click outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === modalRef.current) {
      onClose();
    }
  };

  if (!isOpen || !estimate) return null;

  const baselineKDE = generateKDE(estimate.baselineSamples);
  const upliftedKDE = generateKDE(estimate.upliftedSamples);
  const baselineStats = getSummaryStatistics(estimate.baselineSamples);
  const upliftedStats = getSummaryStatistics(estimate.upliftedSamples);

  const format = (value: number) => {
    if (estimate.nodeType === 'continuous') {
      return formatValue(value, undefined, 'continuous');
    }
    return formatValue(value, estimate.unit, estimate.nodeType);
  };

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

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
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

        {/* Chart */}
        <div className="flex-1 p-6 overflow-auto">
          <Plot
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
                fillcolor: 'rgba(91, 134, 181, 0.3)',
                line: { color: '#5B86B5', width: 2 },
              },
              {
                x: upliftedKDE.x,
                y: upliftedKDE.y,
                type: 'scatter',
                mode: 'lines',
                name: 'AI-Uplifted',
                fill: 'tozeroy',
                fillcolor: 'rgba(112, 12, 140, 0.3)',
                line: { color: '#700C8C', width: 2 },
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
            style={{ width: '100%', height: '350px' }}
          />

          {/* Statistics Panel */}
          <div className="mt-6 grid grid-cols-2 gap-6">
            <StatisticsPanel
              title="Baseline"
              stats={baselineStats}
              color="safer-blue"
              format={format}
            />
            <StatisticsPanel
              title="AI-Uplifted"
              stats={upliftedStats}
              color="safer-purple"
              format={format}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatisticsPanelProps {
  title: string;
  stats: ReturnType<typeof getSummaryStatistics>;
  color: string;
  format: (value: number) => string;
}

function StatisticsPanel({ title, stats, color, format }: StatisticsPanelProps) {
  const colorClass = color === 'safer-blue' ? 'text-safer-blue' : 'text-safer-purple';
  const bgClass = color === 'safer-blue' ? 'bg-safer-blue/5' : 'bg-safer-purple/5';

  return (
    <div className={`rounded-lg p-4 ${bgClass}`}>
      <h4 className={`font-medium mb-3 ${colorClass}`}>{title}</h4>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-gray-500">Mean:</span>
          <span className="ml-2 font-medium text-safer-charcoal">{format(stats.mean)}</span>
        </div>
        <div>
          <span className="text-gray-500">Median:</span>
          <span className="ml-2 font-medium text-safer-charcoal">{format(stats.median)}</span>
        </div>
        <div>
          <span className="text-gray-500">5th %:</span>
          <span className="ml-2 font-medium text-safer-charcoal">{format(stats.p5)}</span>
        </div>
        <div>
          <span className="text-gray-500">95th %:</span>
          <span className="ml-2 font-medium text-safer-charcoal">{format(stats.p95)}</span>
        </div>
        <div>
          <span className="text-gray-500">Std Dev:</span>
          <span className="ml-2 font-medium text-safer-charcoal">{format(stats.stdDev)}</span>
        </div>
        <div>
          <span className="text-gray-500">Range:</span>
          <span className="ml-2 font-medium text-safer-charcoal">
            {format(stats.min)} – {format(stats.max)}
          </span>
        </div>
      </div>
    </div>
  );
}
