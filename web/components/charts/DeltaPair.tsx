'use client';
import { chartTokens, chartFonts, formatDeltaBp } from '@/lib/chartTokens';

interface DeltaPairProps {
  vsBaseBp: number | null | undefined;
  vsParentBp: number | null | undefined;
  baseLabel?: string;
  parentLabel?: string;
}

/**
 * E. Dual-delta pair — green for up, red for down, never swapped.
 */
export default function DeltaPair({ vsBaseBp, vsParentBp, baseLabel = 'VS BASE', parentLabel = 'VS PARENT' }: DeltaPairProps) {
  const render = (bp: number | null | undefined, label: string) => {
    const up = (bp ?? 0) >= 0;
    const color = bp === null || bp === undefined ? chartTokens.muted : up ? chartTokens.accept : chartTokens.reject;
    return (
      <div style={{ flex: 1, background: chartTokens.card, border: `1px solid ${chartTokens.line}`, borderRadius: 2, padding: '10px 14px' }}>
        <div style={{ fontFamily: chartFonts.mono, fontSize: 11, color: chartTokens.muted, letterSpacing: '0.06em' }}>{label}</div>
        <div style={{ fontFamily: chartFonts.mono, fontSize: 15, color, marginTop: 4 }} aria-label={`${label} ${formatDeltaBp(bp ?? null)}`}>
          {formatDeltaBp(bp ?? null)}
        </div>
      </div>
    );
  };
  return (
    <div role="img" aria-label={`Deltas vs base ${formatDeltaBp(vsBaseBp ?? null)}, vs parent ${formatDeltaBp(vsParentBp ?? null)}`} style={{ display: 'flex', gap: 12 }}>
      {render(vsBaseBp, baseLabel)}
      {render(vsParentBp, parentLabel)}
    </div>
  );
}
