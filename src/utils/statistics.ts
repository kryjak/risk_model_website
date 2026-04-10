/**
 * Compute percentiles from an array of numeric samples
 */
export function getPercentiles(
  samples: number[],
  percentiles: number[] = [5, 50, 95]
): number[] {
  if (samples.length === 0) return percentiles.map(() => 0);
  
  const sorted = [...samples].sort((a, b) => a - b);
  
  return percentiles.map(p => {
    const idx = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[idx];
  });
}

/**
 * Compute mean of numeric samples
 */
export function getMean(samples: number[]): number {
  if (samples.length === 0) return 0;
  return samples.reduce((sum, val) => sum + val, 0) / samples.length;
}

/**
 * Compute standard deviation of numeric samples
 */
export function getStdDev(samples: number[]): number {
  if (samples.length === 0) return 0;
  const mean = getMean(samples);
  const squaredDiffs = samples.map(val => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / samples.length;
  return Math.sqrt(variance);
}

/**
 * Compute summary statistics for a set of samples
 */
export interface SummaryStatistics {
  mean: number;
  median: number;
  stdDev: number;
  p5: number;
  p50: number;
  p95: number;
  min: number;
  max: number;
}

export function getSummaryStatistics(samples: number[]): SummaryStatistics {
  if (samples.length === 0) {
    return {
      mean: 0,
      median: 0,
      stdDev: 0,
      p5: 0,
      p50: 0,
      p95: 0,
      min: 0,
      max: 0,
    };
  }
  
  const sorted = [...samples].sort((a, b) => a - b);
  const [p5, p50, p95] = getPercentiles(samples, [5, 50, 95]);
  
  return {
    mean: getMean(samples),
    median: p50,
    stdDev: getStdDev(samples),
    p5,
    p50,
    p95,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

/**
 * Generate histogram bins from samples
 */
export interface HistogramBin {
  x0: number;
  x1: number;
  count: number;
  density: number;
}

export function generateHistogramBins(
  samples: number[],
  numBins: number = 50
): HistogramBin[] {
  if (samples.length === 0) return [];

  let min = samples[0], max = samples[0];
  for (const v of samples) { if (v < min) min = v; if (v > max) max = v; }
  const binWidth = (max - min) / numBins;
  
  // Avoid division by zero for constant data
  if (binWidth === 0) {
    return [{
      x0: min,
      x1: max,
      count: samples.length,
      density: 1,
    }];
  }
  
  const bins: HistogramBin[] = Array.from({ length: numBins }, (_, i) => ({
    x0: min + i * binWidth,
    x1: min + (i + 1) * binWidth,
    count: 0,
    density: 0,
  }));
  
  for (const sample of samples) {
    const binIndex = Math.min(
      Math.floor((sample - min) / binWidth),
      numBins - 1
    );
    bins[binIndex].count++;
  }
  
  // Convert counts to density
  const totalArea = samples.length * binWidth;
  for (const bin of bins) {
    bin.density = bin.count / totalArea;
  }
  
  return bins;
}

/**
 * Compute a robust x-range for plotting from multiple sample arrays,
 * clipping to given percentiles so outliers don't stretch the axis.
 */
export function computeRobustRange(
  sampleArrays: number[][],
  lowerPct: number = 0,
  upperPct: number = 98,
): [number, number] {
  const all = sampleArrays.flat().filter(v => isFinite(v));
  if (all.length === 0) return [0, 1];

  const sorted = [...all].sort((a, b) => a - b);
  const lo = sorted[Math.floor((lowerPct / 100) * (sorted.length - 1))];
  const hi = sorted[Math.floor((upperPct / 100) * (sorted.length - 1))];
  const range = hi - lo;
  const padding = range * 0.05;
  return [lo - padding, hi + padding];
}

/**
 * Generate KDE (Kernel Density Estimate) for smooth distribution curves.
 * Pass an explicit xRange (from computeRobustRange) so multiple traces
 * share the same axis and outliers are clipped.
 */
export function generateKDE(
  samples: number[],
  numPoints: number = 200,
  xRange?: [number, number],
): { x: number[]; y: number[] } {
  if (samples.length === 0) return { x: [], y: [] };
  
  let min = samples[0], max = samples[0];
  for (const v of samples) { if (v < min) min = v; if (v > max) max = v; }
  const range = max - min;
  
  let xMin: number, xMax: number;
  if (xRange) {
    [xMin, xMax] = xRange;
  } else {
    const padding = range * 0.05;
    xMin = min - padding;
    xMax = max + padding;
  }
  
  // Silverman's rule of thumb for bandwidth
  const stdDev = getStdDev(samples);
  const iqr = getPercentiles(samples, [75])[0] - getPercentiles(samples, [25])[0];
  const rawBandwidth = 0.9 * Math.min(stdDev, iqr / 1.34) * Math.pow(samples.length, -0.2);
  // Fallback: if bandwidth is 0 or NaN (e.g., all samples identical), use range-based fallback
  const bandwidth = (rawBandwidth > 0 && isFinite(rawBandwidth))
    ? rawBandwidth
    : Math.max(range * 0.05, Math.abs(min) * 0.01, 0.001);
  
  const x: number[] = [];
  const y: number[] = [];
  
  for (let i = 0; i < numPoints; i++) {
    const xi = xMin + (i / (numPoints - 1)) * (xMax - xMin);
    x.push(xi);
    
    // Gaussian kernel — all samples contribute to density estimation
    let density = 0;
    for (const sample of samples) {
      const u = (xi - sample) / bandwidth;
      density += Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
    }
    density /= samples.length * bandwidth;
    y.push(density);
  }
  
  return { x, y };
}
