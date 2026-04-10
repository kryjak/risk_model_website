import { useRef, useCallback, useMemo } from 'react';
import { Download } from 'lucide-react';
import Plot from 'react-plotly.js';
import { generateKDE, getSummaryStatistics, computeRobustRange } from '../utils/statistics';
import { formatCurrency, formatChange } from '../utils/formatters';
import { generateCurrencyTicks } from '../utils/tickFormatter';

interface OverallRiskChartProps {
  baselineSamples: number[];
  sotaSamples: number[];
  saturatedSamples: number[];
  title?: string;
}

export function OverallRiskChart({
  baselineSamples,
  sotaSamples,
  saturatedSamples,
  title = 'Overall Risk Distribution',
}: OverallRiskChartProps) {
  const graphDivRef = useRef<HTMLElement | null>(null);

  const xRange = computeRobustRange([baselineSamples, sotaSamples, saturatedSamples]);
  const baselineKDE = generateKDE(baselineSamples, 200, xRange);
  const sotaKDE = generateKDE(sotaSamples, 200, xRange);
  const saturatedKDE = generateKDE(saturatedSamples, 200, xRange);
  const baselineStats = getSummaryStatistics(baselineSamples);
  const sotaStats = getSummaryStatistics(sotaSamples);
  const saturatedStats = getSummaryStatistics(saturatedSamples);

  const sotaMeanChange = formatChange(baselineStats.mean, sotaStats.mean);
  const sotaP95Change = formatChange(baselineStats.p95, sotaStats.p95);
  const satMeanChange = formatChange(baselineStats.mean, saturatedStats.mean);
  const satP95Change = formatChange(baselineStats.p95, saturatedStats.p95);

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

  const xTicks = useMemo(
    () => generateCurrencyTicks([baselineSamples, sotaSamples, saturatedSamples], 6, xRange),
    [baselineSamples, sotaSamples, saturatedSamples, xRange]
  );

  const hasValidData = baselineKDE.x.length > 0;

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

      {hasValidData ? (
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
              fillcolor: 'rgba(43, 108, 176, 0.25)',
              line: { color: '#2B6CB0', width: 2.5 },
            },
            {
              x: sotaKDE.x,
              y: sotaKDE.y,
              type: 'scatter',
              mode: 'lines',
              name: 'SOTA',
              fill: 'tozeroy',
              fillcolor: 'rgba(112, 12, 140, 0.25)',
              line: { color: '#700C8C', width: 2.5 },
            },
            {
              x: saturatedKDE.x,
              y: saturatedKDE.y,
              type: 'scatter',
              mode: 'lines',
              name: 'Saturated',
              fill: 'tozeroy',
              fillcolor: 'rgba(45, 106, 79, 0.25)',
              line: { color: '#2D6A4F', width: 2.5 },
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
              tickvals: xTicks.tickvals,
              ticktext: xTicks.ticktext,
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
              {
                type: 'line',
                x0: baselineStats.mean,
                x1: baselineStats.mean,
                y0: 0,
                y1: 1,
                yref: 'paper',
                line: { color: '#2B6CB0', width: 1.5, dash: 'dash' },
              },
              {
                type: 'line',
                x0: sotaStats.mean,
                x1: sotaStats.mean,
                y0: 0,
                y1: 1,
                yref: 'paper',
                line: { color: '#700C8C', width: 1.5, dash: 'dash' },
              },
              {
                type: 'line',
                x0: saturatedStats.mean,
                x1: saturatedStats.mean,
                y0: 0,
                y1: 1,
                yref: 'paper',
                line: { color: '#2D6A4F', width: 1.5, dash: 'dash' },
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
      ) : (
        <div className="flex items-center justify-center h-[400px] bg-safer-grey/30 rounded-lg">
          <p className="text-gray-500">No distribution data available</p>
        </div>
      )}

      {/* Summary Statistics */}
      <div className="mt-4 grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Mean (Baseline)"
          value={formatCurrency(baselineStats.mean)}
          color="safer-blue"
        />
        <StatCard
          label="Mean (SOTA)"
          value={formatCurrency(sotaStats.mean)}
          color="safer-purple"
          change={sotaMeanChange}
        />
        <StatCard
          label="Mean (Saturated)"
          value={formatCurrency(saturatedStats.mean)}
          color="safer-teal"
          change={satMeanChange}
        />
        <StatCard
          label="95th Percentile Risk (Baseline)"
          value={formatCurrency(baselineStats.p95)}
          color="safer-blue"
        />
        <StatCard
          label="95th Percentile Risk (SOTA)"
          value={formatCurrency(sotaStats.p95)}
          color="safer-purple"
          change={sotaP95Change}
        />
        <StatCard
          label="95th Percentile Risk (Saturated)"
          value={formatCurrency(saturatedStats.p95)}
          color="safer-teal"
          change={satP95Change}
        />
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  color: 'safer-blue' | 'safer-purple' | 'safer-teal';
  change?: string;
  subtitle?: string;
}

function StatCard({ label, value, color, change, subtitle }: StatCardProps) {
  const bgClass = color === 'safer-blue' ? 'bg-safer-blue/5' : color === 'safer-purple' ? 'bg-safer-purple/5' : 'bg-safer-teal/5';
  const textClass = color === 'safer-blue' ? 'text-safer-blue' : color === 'safer-purple' ? 'text-safer-purple' : 'text-safer-teal';

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

export function OverallRiskChartSkeleton() {
  return (
    <div className="card">
      <div className="skeleton h-8 w-64 mb-4" />
      <div className="skeleton w-full h-[400px] rounded-lg" />
      <div className="mt-6 grid grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-safer-grey rounded-lg p-4">
            <div className="skeleton h-3 w-24 mb-2" />
            <div className="skeleton h-6 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
