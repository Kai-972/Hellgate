'use client';
import { useId, useState } from 'react';
import { chartTokens, chartFonts, formatDeltaBp } from '@/lib/chartTokens';

interface NoiseBandGaugeProps {
  effectBp: number | null;
  ciLowBp: number | null;
  ciHighBp: number | null;
  minEffectBp?: number;
  title?: string;
  claimLabel?: string;
}

/**
 * B. Noise-band gauge — thick 6px interval bar in ink, 10px effect dot,
 * band fill noise zone, dashed MIN line, generated caption.
 */
export default function NoiseBandGauge({
  effectBp,
  ciLowBp,
  ciHighBp,
  minEffectBp = 300,
  title = 'Measured effect against the noise band',
  claimLabel,
}: NoiseBandGaugeProps) {
  const [focused, setFocused] = useState(false);
  const titleId = useId();
  const descId = useId();

  const W = 620;
  const H = 132;
  const PAD = { top: 24, right: 60, bottom: 30, left: 60 };

  const hasData = effectBp !== null && ciLowBp !== null && ciHighBp !== null;
  const lo = hasData ? Math.min(ciLowBp!, -minEffectBp, effectBp!) : -minEffectBp;
  const hi = hasData ? Math.max(ciHighBp!, minEffectBp, effectBp!) : minEffectBp;
  const pad = Math.max((hi - lo) * 0.2, 200);
  const dMin = lo - pad;
  const dMax = hi + pad;

  const chartW = W - PAD.left - PAD.right;
  const x = (bp: number) => PAD.left + ((bp - dMin) / (dMax - dMin)) * chartW;
  const midY = PAD.top + 34;

  const passes = hasData && ciLowBp! > 0 && effectBp! >= minEffectBp;
  const dotFill = !hasData ? chartTokens.muted : passes ? chartTokens.accept : chartTokens.reject;

  const caption = !hasData
    ? 'No verified measurement yet. Void changes show —, never zero.'
    : passes
      ? `Measured ${formatDeltaBp(effectBp)}, with the 95% interval entirely above zero and above the minimum, so the gain counts.`
      : ciLowBp! <= 0 && ciHighBp! >= 0
        ? `Measured ${formatDeltaBp(effectBp)}, but the 95% interval crosses zero, so the effect is not distinguishable from noise.`
        : `Measured ${formatDeltaBp(effectBp)}, inside the ±${(minEffectBp / 100).toFixed(1)} noise zone, so it does not count even though the interval clears zero.`;

  return (
    <figure style={{ margin: 0, background: chartTokens.card, border: `1px solid ${chartTokens.line}`, borderRadius: 2, padding: '16px 16px 12px' }}>
      <h3 id={titleId} style={{ fontFamily: chartFonts.serif, fontSize: 17, color: chartTokens.ink, margin: '0 0 12px', fontWeight: 500 }}>
        {title}
        {claimLabel ? <span style={{ fontFamily: chartFonts.mono, fontSize: 11, color: chartTokens.muted }}> — {claimLabel}</span> : null}
      </h3>
      <div style={{ overflowX: 'auto', border: `1px solid ${chartTokens.line}`, borderRadius: 2 }}>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Noise band gauge. Effect ${effectBp ?? 'none'}, interval ${ciLowBp ?? 'none'} to ${ciHighBp ?? 'none'}`}
          aria-describedby={descId}
          tabIndex={0}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ display: 'block', minWidth: W, background: chartTokens.card, outline: focused ? `2px solid ${chartTokens.ink}` : 'none', outlineOffset: 2 }}
        >
          {/* noise zone */}
          <rect x={x(-minEffectBp)} y={midY - 22} width={Math.max(x(minEffectBp) - x(-minEffectBp), 2)} height={44} fill={chartTokens.band} />
          <text x={(x(-minEffectBp) + x(minEffectBp)) / 2} y={midY + 34} textAnchor="middle" fill={chartTokens.muted} fontSize={11} fontFamily={chartFonts.mono}>
            noise zone
          </text>

          {/* gridlines horizontal only — axis ticks */}
          {[-600, -300, 0, 300, 600, 900].filter((v) => v >= dMin && v <= dMax).map((v) => (
            <g key={v}>
              <line x1={x(v)} y1={midY - 22} x2={x(v)} y2={midY + 22} stroke={chartTokens.grid} strokeWidth={1} />
              <text x={x(v)} y={H - 8} textAnchor="middle" fill={chartTokens.muted} fontSize={11} fontFamily={chartFonts.mono}>
                {v === 0 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v / 100).toFixed(1)}`}
              </text>
            </g>
          ))}

          {/* solid zero line */}
          <line x1={x(0)} y1={midY - 26} x2={x(0)} y2={midY + 26} stroke={chartTokens.ink} strokeWidth={1.5} />

          {/* dashed MIN line */}
          <line x1={x(minEffectBp)} y1={midY - 26} x2={x(minEffectBp)} y2={midY + 26} stroke={chartTokens.muted} strokeWidth={1} strokeDasharray="4 3" />
          <text x={x(minEffectBp)} y={PAD.top - 8} textAnchor="middle" fill={chartTokens.muted} fontSize={11} fontFamily={chartFonts.mono}>
            MIN +{(minEffectBp / 100).toFixed(1)}
          </text>

          {hasData && (
            <g tabIndex={-1}>
              <line x1={x(ciLowBp!)} y1={midY} x2={x(ciHighBp!)} y2={midY} stroke={chartTokens.ink} strokeWidth={6} strokeLinecap="round" />
              <circle cx={x(effectBp!)} cy={midY} r={5} fill={dotFill} stroke={chartTokens.card} strokeWidth={1.5} />
              <text x={x(effectBp!) + 12} y={midY} dominantBaseline="middle" fill={chartTokens.ink} fontSize={11} fontFamily={chartFonts.mono}>
                {formatDeltaBp(effectBp)}
              </text>
            </g>
          )}
          {!hasData && (
            <text x={(PAD.left + W - PAD.right) / 2} y={midY} textAnchor="middle" dominantBaseline="middle" fill={chartTokens.muted} fontSize={11} fontFamily={chartFonts.mono}>
              —
            </text>
          )}
        </svg>
      </div>
      <figcaption id={descId} style={{ fontFamily: chartFonts.sans, fontSize: 13, color: chartTokens.muted, marginTop: 8, lineHeight: 1.5 }}>
        {caption}
      </figcaption>
      <p style={{ fontFamily: chartFonts.mono, fontSize: 11, color: chartTokens.muted, margin: '6px 0 0' }}>
        Accepted if and only if ciLow &gt; 0 and effect ≥ +{(minEffectBp / 100).toFixed(1)}.
      </p>
      <table style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        <caption>Noise band data</caption>
        <tbody>
          <tr><td>effect</td><td>{effectBp ?? '—'}</td></tr>
          <tr><td>ciLow</td><td>{ciLowBp ?? '—'}</td></tr>
          <tr><td>ciHigh</td><td>{ciHighBp ?? '—'}</td></tr>
        </tbody>
      </table>
    </figure>
  );
}
