'use client';
import { useId, useState } from 'react';
import { chartTokens, chartFonts, formatScorePct } from '@/lib/chartTokens';

interface RunDotsProps {
  parentRunsBp: number[];
  candidateRunsBp: number[];
  title?: string;
  caption?: string;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * C. Run-by-run dot strip — two rows, 5 dots each, 2px median tick.
 * Parent muted, candidate ink. No connecting lines.
 */
export default function RunDots({
  parentRunsBp,
  candidateRunsBp,
  title = 'Run-by-run scores show the shift, not just the mean',
  caption = 'Each dot is one run score. The tick is the median. Parent is muted, candidate is ink.',
}: RunDotsProps) {
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const titleId = useId();
  const descId = useId();

  const W = 620;
  const ROW_H = 44;
  const PAD = { top: 16, right: 70, bottom: 28, left: 96 };
  const H = PAD.top + ROW_H * 2 + PAD.bottom;
  const chartW = W - PAD.left - PAD.right;

  const all = [...parentRunsBp, ...candidateRunsBp];
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 10000;
  const spanPad = Math.max((hi - lo) * 0.15, 200);
  const dMin = Math.max(lo - spanPad, 0);
  const dMax = Math.min(hi + spanPad, 10000);
  const x = (bp: number) => PAD.left + ((bp - dMin) / Math.max(dMax - dMin, 1)) * chartW;

  const pMed = median(parentRunsBp);
  const cMed = median(candidateRunsBp);

  const rows = [
    { label: 'Parent', values: parentRunsBp, med: pMed, color: chartTokens.muted },
    { label: 'Candidate', values: candidateRunsBp, med: cMed, color: chartTokens.ink },
  ];

  return (
    <figure style={{ margin: 0, background: chartTokens.card, border: `1px solid ${chartTokens.line}`, borderRadius: 2, padding: '16px 16px 12px' }}>
      <h3 id={titleId} style={{ fontFamily: chartFonts.serif, fontSize: 17, color: chartTokens.ink, margin: '0 0 12px', fontWeight: 500 }}>{title}</h3>
      <div style={{ overflowX: 'auto', border: `1px solid ${chartTokens.line}`, borderRadius: 2 }}>
        <svg
          width={W} height={H} viewBox={`0 0 ${W} ${H}`}
          role="img" aria-label={`Run dots. Parent ${parentRunsBp.length} runs, candidate ${candidateRunsBp.length} runs`}
          aria-describedby={descId} tabIndex={0}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            setFocusRow((v) => (v === null ? 0 : (v + (e.key === 'ArrowDown' ? 1 : 1)) % 2));
          }}
          style={{ display: 'block', minWidth: W, background: chartTokens.card }}
        >
          {[0, 1, 2, 3, 4].map((k) => {
            const v = dMin + ((dMax - dMin) * k) / 4;
            return (
              <g key={k}>
                <line x1={x(v)} y1={PAD.top} x2={x(v)} y2={PAD.top + ROW_H * 2} stroke={chartTokens.grid} strokeWidth={1} />
                <text x={x(v)} y={H - 8} textAnchor="middle" fill={chartTokens.muted} fontSize={11} fontFamily={chartFonts.mono}>
                  {(v / 100).toFixed(0)}%
                </text>
              </g>
            );
          })}
          {rows.map((row, ri) => {
            const cy = PAD.top + ri * ROW_H + ROW_H / 2;
            return (
              <g
                key={row.label}
                tabIndex={-1}
                onMouseEnter={() => setFocusRow(ri)}
                onMouseLeave={() => setFocusRow(null)}
                style={{ opacity: focusRow === null || focusRow === ri ? 1 : 0.55, transition: 'opacity 150ms' }}
              >
                <text x={PAD.left - 10} y={cy} textAnchor="end" dominantBaseline="middle" fill={chartTokens.muted} fontSize={11} fontFamily={chartFonts.mono}>
                  {row.label}
                </text>
                {row.values.map((bp, i) => (
                  <circle key={i} cx={x(bp)} cy={cy} r={4} fill={row.color} stroke={chartTokens.card} strokeWidth={1}>
                    <title>{`${row.label} run ${i + 1}: ${formatScorePct(bp)}`}</title>
                  </circle>
                ))}
                {row.med !== null && (
                  <line x1={x(row.med)} y1={cy - 11} x2={x(row.med)} y2={cy + 11} stroke={row.color} strokeWidth={2} />
                )}
                {row.med !== null && (
                  <text x={Math.min(x(row.med) + 8, W - PAD.right - 40)} y={cy} dominantBaseline="middle" fill={chartTokens.muted} fontSize={11} fontFamily={chartFonts.mono}>
                    {formatScorePct(row.med)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption id={descId} style={{ fontFamily: chartFonts.sans, fontSize: 13, color: chartTokens.muted, marginTop: 8 }}>{caption}</figcaption>
      <table style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        <caption>Run scores</caption>
        <tbody>
          <tr><td>parent</td><td>{parentRunsBp.join(', ')}</td></tr>
          <tr><td>candidate</td><td>{candidateRunsBp.join(', ')}</td></tr>
        </tbody>
      </table>
    </figure>
  );
}
