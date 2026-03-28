/**
 * Generates nice tick values and labels for currency axes,
 * using "$X Billion" / "$X Million" / "$X Thousand" format
 * instead of Plotly's default SI suffixes (G, M, K).
 */
export function generateCurrencyTicks(
  samples: number[][],
  numTicks = 6,
  xRange?: [number, number],
): { tickvals: number[]; ticktext: string[] } {
  const allValues = samples.flat();
  if (allValues.length === 0) return { tickvals: [], ticktext: [] };

  const min = xRange ? xRange[0] : Math.min(...allValues);
  const max = xRange ? xRange[1] : Math.max(...allValues);

  const range = max - min;
  if (range <= 0) return { tickvals: [min], ticktext: [formatTickLabel(min)] };
  const rawStep = range / (numTicks - 1);

  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceSteps = [1, 2, 2.5, 5, 10];
  let step = niceSteps[0] * magnitude;
  for (const ns of niceSteps) {
    if (ns * magnitude >= rawStep) {
      step = ns * magnitude;
      break;
    }
  }

  const start = Math.floor(min / step) * step;
  const tickvals: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) {
    tickvals.push(v);
  }

  const ticktext = tickvals.map(formatTickLabel);
  return { tickvals, ticktext };
}

function formatTickLabel(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (abs >= 1e12) {
    const n = abs / 1e12;
    return `${sign}$${stripTrailingZeros(n)} Trillion`;
  }
  if (abs >= 1e9) {
    const n = abs / 1e9;
    return `${sign}$${stripTrailingZeros(n)} Billion`;
  }
  if (abs >= 1e6) {
    const n = abs / 1e6;
    return `${sign}$${stripTrailingZeros(n)} Million`;
  }
  if (abs >= 1e3) {
    const n = abs / 1e3;
    return `${sign}$${stripTrailingZeros(n)} Thousand`;
  }
  return `${sign}$${stripTrailingZeros(abs)}`;
}

function stripTrailingZeros(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(1).replace(/\.0$/, '');
}
