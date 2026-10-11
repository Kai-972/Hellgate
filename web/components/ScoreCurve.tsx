'use client';
import { CurvePoint, formatScore } from '@/lib/types';

interface ScoreCurveProps {
  curve: CurvePoint[];
}

const PAD = { top: 20, right: 20, bottom: 40, left: 60 };
const H = 160;

export default function ScoreCurve({ curve }: ScoreCurveProps) {
  if (!curve.length) return null;
  const W = Math.max(300, curve.length * 120 + PAD.left + PAD.right);
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const minScore = Math.min(...curve.map((p) => p.scoreBp)) * 0.9;
  const maxScore = Math.max(...curve.map((p) => p.scoreBp)) * 1.05;

  const xScale = (i: number) => (i / Math.max(curve.length - 1, 1)) * chartW;
  const yScale = (bp: number) =>
    chartH - ((bp - minScore) / (maxScore - minScore)) * chartH;

  const points = curve.map((p, i) => ({ x: xScale(i), y: yScale(p.scoreBp), ...p }));
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  // Area fill
  const areaD = `${pathD} L ${points[points.length - 1].x} ${chartH} L 0 ${chartH} Z`;

  const gridLines = 4;

  return (
    <svg width={W} height={H} style={{ overflow: 'visible', display: 'block', maxWidth: '100%' }}>
      <g transform={`translate(${PAD.left}, ${PAD.top})`}>
        {/* Grid lines */}
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const y = (i / gridLines) * chartH;
          const val = maxScore - (i / gridLines) * (maxScore - minScore);
          return (
            <g key={i}>
              <line x1={0} y1={y} x2={chartW} y2={y}
                stroke="var(--border)" strokeWidth={1} />
              <text x={-8} y={y} textAnchor="end" dominantBaseline="middle"
                fill="var(--text-dim)" fontSize="10" fontFamily="var(--font-mono)">
                {formatScore(val)}
              </text>
            </g>
          );
        })}

        {/* Area */}
        <path d={areaD} fill="var(--band)" />

        {/* Line */}
        <path d={pathD} fill="none" stroke="var(--ember)" strokeWidth={2} />

        {/* Points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={5} fill="var(--ember-light)"
              stroke="var(--bg)" strokeWidth={2} />
            <text x={p.x} y={chartH + 20} textAnchor="middle"
              fill="var(--text-dim)" fontSize="9" fontFamily="var(--font-mono)">
              gen {p.depth}
            </text>
            <text x={p.x} y={p.y - 10} textAnchor="middle"
              fill="var(--ember-light)" fontSize="10" fontFamily="var(--font-mono)">
              {formatScore(p.scoreBp)}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
