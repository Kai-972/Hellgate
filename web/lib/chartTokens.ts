/**
 * chartTokens.ts — single source of truth for every colour and font in charts.
 * Sage stone paper so white cards stand out. Flat colours only.
 * No blue / indigo / violet. No gradients. No shadows.
 */

export const chartTokens = {
  paper: '#E7EAE2',
  card: '#F8F9F4',
  card2: '#EFF1EA',
  ink: '#171A16',
  muted: '#5E655C',
  line: '#CBD0C4',
  grid: '#D9DDD2',
  ember: '#C2410C',
  accept: '#1F6F5C',
  reject: '#B3261E',
  contest: '#B7791F',
  void: '#4A5568',
  pending: '#8A8F85',
  band: '#EFF1EA',
  acceptTint: '#DCEBE5',
  rejectTint: '#F3DCD9',
} as const;

export type ChartTokenKey = keyof typeof chartTokens;

export const chartFonts = {
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  serif: "'Instrument Serif', Georgia, serif",
  sans: "'DM Sans', 'Geist', system-ui, sans-serif",
} as const;

export const chartSizes = {
  tickFont: 11,
  titleFontMin: 16,
  titleFontMax: 18,
  captionFont: 13,
  statusInChart: 10,
  statusInLegend: 14,
  dotStrip: 8,
  intervalBar: 6,
  effectDot: 10,
  radius: 2,
} as const;

/** Format bp (basis points, 100bp = 1pt) as signed points with true minus. */
export function formatDeltaBp(bp: number | null | undefined): string {
  if (bp === null || bp === undefined) return '—';
  const pts = bp / 100;
  if (Object.is(pts, -0) || pts === 0) return '+0.0';
  const sign = pts > 0 ? '▲ +' : '▼ −';
  return `${sign}${Math.abs(pts).toFixed(1)}`;
}

/** Format bp score as percent, void-safe (never zero for void). */
export function formatScorePct(bp: number | null | undefined): string {
  if (bp === null || bp === undefined) return '—';
  return `${(bp / 100).toFixed(1)}%`;
}

/** Intensity bucket for heat strip: at most 3 steps, flat tints only. */
export function heatLevel(deltaBp: number | null | undefined): 0 | 1 | 2 {
  if (deltaBp === null || deltaBp === undefined) return 0;
  const a = Math.abs(deltaBp);
  if (a < 100) return 0; // roughly zero
  if (a < 500) return 1;
  return 2;
}

export function heatFill(deltaBp: number | null | undefined): string {
  const lvl = heatLevel(deltaBp);
  if (lvl === 0 || deltaBp === null || deltaBp === undefined) return chartTokens.card;
  // Same flat tint for both steps (spec: at most 3 steps, no continuous gradient).
  // We use opacity-free flat tints only.
  return deltaBp > 0 ? chartTokens.acceptTint : chartTokens.rejectTint;
}
