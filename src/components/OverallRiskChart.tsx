import { useRef, useCallback } from 'react';
import { Download } from 'lucide-react';
import Plot from 'react-plotly.js';
import { generateKDE, getSummaryStatistics } from '../utils/statistics';
import { formatCurrency, formatChange } from '../utils/formatters';

interface OverallRiskChartProps {
  baselineSamples: number[];
  upliftedSamples: number[];
  title?: string;
}

export function OverallRiskChart({
  baselineSamples,
  upliftedSamples,
  title = 'Overall Risk Distribution',
}: OverallRiskChartProps) {
  const graphDivRef = useRef<HTMLElement | null>(null);

  const baselineKDE = generateKDE(baselineSamples);
  const upliftedKDE = generateKDE(upliftedSamples);
  const baselineStats = getSummaryStatistics(baselineSamples);
  const upliftedStats = getSummaryStatistics(upliftedSamples);

  const meanChange = formatChange(baselineStats.mean, upliftedStats.mean);
  const p95Change = formatChange(baselineStats.p95, upliftedStats.p95);

  const handlePlotInit = useCallback((_figure: any, graphDiv: HTMLElement) => {
    graphDivRef.current = graphDiv;
  }, []);

  const handleDownload = useCallback(() => {
    if (graphDivRef.current) {
      import('plotly.js').then((Plotly) => {
        Plotly.downloadImage(graphDivRef.current as HTMLElement, {
          format: 'png',
          filename: 'total_risk_distribution',
          width: 1400,
          height: 600,
        });
      });
    }
  }, []);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-serif font-medium text-safer-charcoal">
          {title}
        </h3>
        <button
          onClick={handleDownload}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Download as PNG"
        >
          <Download className="w-5 h-5 text-gray-500" />
        </button>
      </div>

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
            line: { color: '#5B86B5', width: 2.5 },
          },
          {
            x: upliftedKDE.x,
            y: upliftedKDE.y,
            type: 'scatter',
            mode: 'lines',
            name: 'AI-Uplifted',
            fill: 'tozeroy',
            fillcolor: 'rgba(112, 12, 140, 0.3)',
            line: { color: '#700C8C', width: 2.5 },
          },
        ]}
        layout={{
          autosize: true,
          margin: { t: 20, r: 40, b: 60, l: 80 },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          font: {
            family: 'Season Sans, system-ui, sans-serif',
            color: '#202137',
          },
          xaxis: {
            title: { text: 'Annual Risk ($ / year)' },
            gridcolor: '#E5E7EB',
            zerolinecolor: '#9CA3AF',
            tickformat: '$.2s',
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
          shapes: [
            // Baseline mean line
            {
              type: 'line',
              x0: baselineStats.mean,
              x1: baselineStats.mean,
              y0: 0,
              y1: 1,
              yref: 'paper',
              line: { color: '#5B86B5', width: 1.5, dash: 'dash' },
            },
            // Uplifted mean line
            {
              type: 'line',
              x0: upliftedStats.mean,
              x1: upliftedStats.mean,
              y0: 0,
              y1: 1,
              yref: 'paper',
              line: { color: '#700C8C', width: 1.5, dash: 'dash' },
            },
          ],
        }}
        config={{
          responsive: true,
          displayModeBar: true,
          modeBarButtonsToRemove: ['lasso2d', 'select2d'],
          displaylogo: false,
          scrollZoom: true,
        }}
        style={{ width: '100%', height: '400px' }}
      />

      {/* Summary Statistics */}
      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Expected Value (Baseline)"
          value={formatCurrency(baselineStats.mean)}
          color="safer-blue"
        />
        <StatCard
          label="Expected Value (AI-Uplifted)"
          value={formatCurrency(upliftedStats.mean)}
          color="safer-purple"
          change={meanChange}
        />
        <StatCard
          label="VaR 95% (Baseline)"
          value={formatCurrency(baselineStats.p95)}
          color="safer-blue"
          subtitle="Value at Risk"
        />
        <StatCard
          label="VaR 95% (AI-Uplifted)"
          value={formatCurrency(upliftedStats.p95)}
          color="safer-purple"
          change={p95Change}
          subtitle="Value at Risk"
        />
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  color: 'safer-blue' | 'safer-purple';
  change?: string;
  subtitle?: string;
}

function StatCard({ label, value, color, change, subtitle }: StatCardProps) {
  const bgClass = color === 'safer-blue' ? 'bg-safer-blue/5' : 'bg-safer-purple/5';
  const textClass = color === 'safer-blue' ? 'text-safer-blue' : 'text-safer-purple';

  return (
    <div className={`rounded-lg p-4 ${bgClass}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      {subtitle && <p className="text-xs text-gray-400 mb-1">{subtitle}</p>}
      <p className={`text-xl font-serif font-medium ${textClass}`}>{value}</p>
      {change && (
        <p className={`text-sm mt-1 ${
          change.startsWith('+') ? 'text-safer-red' : 'text-safer-green'
        }`}>
          {change} from baseline
        </p>
      )}
    </div>
  );
}

// Skeleton version
export function OverallRiskChartSkeleton() {
  return (
    <div className="card">
      <div className="skeleton h-8 w-64 mb-4" />
      <div className="skeleton w-full h-[400px] rounded-lg" />
      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-safer-grey rounded-lg p-4">
            <div className="skeleton h-3 w-24 mb-2" />
            <div className="skeleton h-6 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
