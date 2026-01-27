/**
 * Format a number as currency (e.g., "$145M", "$2.3B")
 */
export function formatCurrency(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  
  if (absValue >= 1e12) {
    return `${sign}$${(absValue / 1e12).toFixed(1)}T`;
  }
  if (absValue >= 1e9) {
    return `${sign}$${(absValue / 1e9).toFixed(1)}B`;
  }
  if (absValue >= 1e6) {
    return `${sign}$${(absValue / 1e6).toFixed(1)}M`;
  }
  if (absValue >= 1e3) {
    return `${sign}$${(absValue / 1e3).toFixed(1)}K`;
  }
  return `${sign}$${absValue.toFixed(0)}`;
}

/**
 * Format a probability/percentage value (e.g., "65%", "65.2%")
 */
export function formatPercentage(value: number, decimalPlaces: number = 1): string {
  // Value is expected to be in [0, 1] range
  const percent = value * 100;
  
  // Use 0 decimal places if the value is a round number
  if (Math.abs(percent - Math.round(percent)) < 0.01) {
    return `${Math.round(percent)}%`;
  }
  
  return `${percent.toFixed(decimalPlaces)}%`;
}

/**
 * Format a large number with locale separators (e.g., "1,234,567")
 */
export function formatNumber(value: number, decimalPlaces: number = 0): string {
  return value.toLocaleString('en-GB', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });
}

/**
 * Format a value based on its unit type
 */
export function formatValue(
  value: number,
  unit?: string,
  nodeType?: string
): string {
  if (unit?.includes('$') || unit?.includes('dollar')) {
    return formatCurrency(value);
  }
  
  if (nodeType === 'probability' || nodeType === 'continuous') {
    // Probability values are in [0, 1]
    return formatPercentage(value);
  }
  
  // For quantity nodes without dollar units, format as regular number
  if (value >= 1000) {
    return formatNumber(value, 0);
  }
  
  return formatNumber(value, 2);
}

/**
 * Format a percentile range for display (e.g., "5th-95th: 30%-70%")
 */
export function formatPercentileRange(
  p5: number,
  p95: number,
  unit?: string,
  nodeType?: string
): string {
  const format = (v: number) => formatValue(v, unit, nodeType);
  return `${format(p5)} – ${format(p95)}`;
}

/**
 * Calculate and format the percentage change between two values
 */
export function formatChange(baseline: number, uplifted: number): string {
  if (baseline === 0) {
    return uplifted > 0 ? '+∞' : '0%';
  }
  
  const change = ((uplifted - baseline) / baseline) * 100;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
