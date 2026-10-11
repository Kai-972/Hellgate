'use client';
import { useId, useState } from 'react';
import { chartTokens, chartFonts, formatDeltaBp, formatScorePct } from '@/lib/chartTokens';
import type { ChangeStatus } from '@/lib/types';
import StatusMark from './StatusMark';

export interface ScoreCurvePoint {
  label: string;
  scoreBp: number | null;
  status: ChangeStatus;
  vsBaseBp?: number | null;
  vsParentBp?: number | null;
}

interface ScoreCurveProps {
  points: ScoreCurvePoint[];
  baseLabel?: string;
  title?: string;
  caption?: string;
  selectedIndex?: number | null;
  onSelect?: (index: number) => void;
}

const W = 640;
const H = 240;
const PAD = { top: 28, right: 88, bottom: 36, left: 52 };

/**
 * A. Score-vs-base curve — stepped line (step-after), ink 2px.
 * Dashed baseline at genesis, faint ✕ for rejected, end pill ember.
 */
export default function ScoreCurve({
  points,
  baseLabel = 'BASE',
  title = 'Standardisation and Adam are the only steps that clear the noise band',
  caption = 'Stepped score along the gate path. Crosses are measured but rejected changes. Void shows —, never zero.',
  selectedIndex = null,
  onSelect,
}: ScoreCurveProps) {
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const titleId = useId();
  const descId = useId();
  const activeIdx = focusIdx ?? selectedIndex;

  const scored = points.filter((p) => p.scoreBp !== null) as (ScoreCurvePoint & { scoreBp: number })[];
  if (scored.length === 0) return null;

  const scores = scored.map((p) => p.scoreBp);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = Math.max(max - min, 500);
  const lo = min - span * 0.12;
  const hi = max + span * 0.18;

  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / Math.max(points.length - 1, 1)) * chartW;
  const y = (bp: number) => PAD.top + chartH - ((bp - lo) / (hi - lo)) * chartH;

  const baseBp = scored[0].scoreBp;

  // step-after path over scored points only, mapped to their indices
  const idxOf = points.map((p, i) => ({ p, i })).filter(({ p }) => p.scoreBp !== null);
  let d = '';
  idxOf.forEach(({ p, i }, k) => {
    const px = x(i);
    const py = y(p.scoreBp!);
    if (k === 0) d += `M ${px} ${py}`;
    else {
      const prevX = x(idxOf[k - 1].i);
      d += ` L ${prevX} ${py} L ${px} ${py}`;
    }
  });

  const last = idxOf[idxOf.length - 1];
  const lastVsBase = last.p.vsBaseBp ?? last.p.scoreBp! - baseBp;

  const ticks = [0, 1, 2, 3].map((t) => lo + ((hi - lo) * t) / 3);

  const hover = activeIdx !== null ? points[activeIdx] : null;

  return (
    <figure
      style={{ margin: 0, background: chartTokens.card, border: `1px solid ${chartTokens.line}`, borderRadius: 2, padding: '16px 16px 12px' }}
    >
      <h3 id={titleId} style={{ fontFamily: chartFonts.serif, fontSize: 17, color: chartTokens.ink, margin: '0 0 12px', fontWeight: 500 }}>
        {title}
      </h3>
      <div style={{ overflowX: 'auto', border: `1px solid ${chartTokens.line}`, borderRadius: 2 }}>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Score along the gate path, stepped line with rejected changes as crosses"
          aria-describedby={descId}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault();
            const dir = e.key === 'ArrowRight' ? 1 : -1;
            const next = ((activeIdx ?? 0) + dir + points.length) % points.length;
            setFocusIdx(next);
            onSelect?.(next);
          }}
          style={{ display: 'block', minWidth: W, background: chartTokens.card }}
        >
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={PAD.left} y1={y(t)} x2={W - PAD.right} y2={y(t)} stroke={chartTokens.grid} strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fill={chartTokens.muted} fontSize={11} fontFamily={chartFonts.mono}>
                {(t / 100).toFixed(0)}%
              </text>
            </g>
          ))}

          {/* genesis baseline */}
          <line x1={PAD.left} y1={y(baseBp)} x2={W - PAD.right} y2={y(baseBp)} stroke={chartTokens.muted} strokeWidth={1} strokeDasharray="4 3" />
          <text x={PAD.left} y={y(baseBp) - 6} fill={chartTokens.muted} fontSize={11} fontFamily={chartFonts.mono}>
            {baseLabel} {(baseBp / 100).toFixed(1)}%
          </text>

          {/* rejected faint crosses at measured score */}
          {points.map((p, i) =>
            p.status === 'rejected' && p.scoreBp !== null ? (
              <g key={`x-${i}`} opacity={0.4}>
                <line x1={x(i) - 4} y1={y(p.scoreBp) - 4} x2={x(i) + 4} y2={y(p.scoreBp) + 4} stroke={chartTokens.muted} strokeWidth={1.2} />
                <line x1={x(i) + 4} y1={y(p.scoreBp) - 4} x2={x(i) - 4} y2={y(p.scoreBp) + 4} stroke={chartTokens.muted} strokeWidth={1.2} />
              </g>
            ) : null
          )}

          <path d={d} fill="none" stroke={chartTokens.ink} strokeWidth={2} strokeLinejoin="round" />

          {idxOf.map(({ p, i }) => (
            <g
              key={i}
              tabIndex={-1}
              onMouseEnter={() => setFocusIdx(i)}
              onMouseLeave={() => setFocusIdx(null)}
              onFocus={() => setFocusIdx(i)}
              onBlur={() => setFocusIdx(null)}
              onClick={() => onSelect?.(i)}
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
            >
              <circle cx={x(i)} cy={0} r={14} fill="transparent" />
              <circle cx={x(i)} cy={y(p.scoreBp!)} r={activeIdx === i ? 5 : 3.5} fill={activeIdx === i ? chartTokens.ember : chartTokens.ink} />
              {activeIdx === i && <circle cx={x(i)} cy={y(p.scoreBp!)} r={8} fill="none" stroke={chartTokens.ember} strokeWidth={1.5} />}
              <text x={x(i)} y={H - 14} textAnchor="middle" fill={chartTokens.muted} fontSize={11} fontFamily={chartFonts.mono}>
                {p.label}
              </text>
              <text x={x(i)} y={y(p.scoreBp!) - 12} textAnchor="middle" fill={chartTokens.ink} fontSize={11} fontFamily={chartFonts.mono}>
                {p.vsParentBp !== null && p.vsParentBp !== undefined && i > 0 ? `${p.label} ${formatDeltaBp(p.vsParentBp)}` : formatScorePct(p.scoreBp)}
              </text>
            </g>
          ))}

          {/* end pill */}
          {last && (
            <g>
              <rect
                x={Math.min(x(last.i) + 10, W - PAD.right - 150)}
                y={Math.max(y(last.p.scoreBp!) - 34, 4)}
                width={148}
                height={22}
                rx={11}
                fill={chartTokens.card}
                stroke={chartTokens.ember}
                strokeWidth={1}
              />
              <text
                x={Math.min(x(last.i) + 10, W - PAD.right - 150) + 74}
                y={Math.max(y(last.p.scoreBp!) - 34, 4) + 11}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={chartTokens.ember}
                fontSize={11}
                fontFamily={chartFonts.mono}
              >
                {formatScorePct(last.p.scoreBp)} · {formatDeltaBp(lastVsBase)} vs base
              </text>
            </g>
          )}
        </svg>
      </div>
      <figcaption id={descId} style={{ fontFamily: chartFonts.sans, fontSize: 13, color: chartTokens.muted, marginTop: 8, lineHeight: 1.5 }}>
        {caption}
        {hover && hover.scoreBp !== null && (
          <span style={{ fontFamily: chartFonts.mono, fontSize: 11, color: chartTokens.ink }}>
            {' '}Hovering {hover.label}: {formatScorePct(hover.scoreBp)}
            {hover.vsBaseBp !== null && hover.vsBaseBp !== undefined ? ` (${formatDeltaBp(hover.vsBaseBp)} vs base)` : ''}.
          </span>
        )}
      </figcaption>
      <table style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }} aria-hidden={false}>
        <caption>Score curve data</caption>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <td>{p.label}</td>
              <td>{p.scoreBp === null ? '—' : formatScorePct(p.scoreBp)}</td>
              <td>{p.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
