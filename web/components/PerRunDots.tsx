'use client';
import { Attestation } from '@/lib/types';
import { shortAddr } from '@/lib/types';

interface PerRunDotsProps {
  attestations: Attestation[];
}

const DOT_R = 5;
const ROW_H = 44;
const PAD = { top: 10, right: 20, bottom: 20, left: 160 };
const W = 560;

export default function PerRunDots({ attestations }: PerRunDotsProps) {
  const counted = attestations.filter((a) => a.counted);
  const H = PAD.top + counted.length * ROW_H * 2 + PAD.bottom;
  const chartW = W - PAD.left - PAD.right;

  const xScale = (bp: number) => (bp / 10000) * chartW;

  return (
    <svg width={W} height={H} style={{ display: 'block', maxWidth: '100%', overflow: 'visible' }}>
      {/* Axis */}
      <g transform={`translate(${PAD.left}, ${PAD.top})`}>
        {[0, 2500, 5000, 7500, 10000].map((v) => (
          <g key={v}>
            <line
              x1={xScale(v)} y1={0}
              x2={xScale(v)} y2={H - PAD.top - PAD.bottom}
              stroke="var(--grid)"
              strokeWidth={1}
            />
            <text
              x={xScale(v)}
              y={H - PAD.top - PAD.bottom + 14}
              textAnchor="middle"
              fill="var(--text-dim)"
              fontSize="9"
              fontFamily="var(--font-mono)"
            >
              {(v / 100).toFixed(0)}%
            </text>
          </g>
        ))}

        {counted.map((att, i) => {
          const baseY = i * ROW_H * 2 + ROW_H / 2;
          const parentMedian = [...att.parentRunsBp].sort((a, b) => a - b)[2];
          const candMedian = [...att.candidateRunsBp].sort((a, b) => a - b)[2];

          return (
            <g key={att.id}>
              {/* Verifier label */}
              <text
                x={-8}
                y={baseY + ROW_H / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--text-muted)"
                fontSize="10"
                fontFamily="var(--font-mono)"
              >
                {shortAddr(att.signer)}
              </text>

              {/* Parent row */}
              <text x={-8} y={baseY} textAnchor="end" dominantBaseline="middle"
                fill="var(--stone)" fontSize="9" fontFamily="var(--font-mono)">parent</text>
              {att.parentRunsBp.map((bp, j) => (
                <circle
                  key={j}
                  cx={xScale(bp)}
                  cy={baseY}
                  r={DOT_R}
                  fill="var(--stone)"
                  opacity={0.7}
                />
              ))}
              {parentMedian !== undefined && (
                <line
                  x1={xScale(parentMedian)} y1={baseY - 10}
                  x2={xScale(parentMedian)} y2={baseY + 10}
                  stroke="var(--stone-light)"
                  strokeWidth={2}
                />
              )}

              {/* Candidate row */}
              <text x={-8} y={baseY + ROW_H} textAnchor="end" dominantBaseline="middle"
                fill="var(--ember)" fontSize="9" fontFamily="var(--font-mono)">cand.</text>
              {att.candidateRunsBp.map((bp, j) => (
                <circle
                  key={j}
                  cx={xScale(bp)}
                  cy={baseY + ROW_H}
                  r={DOT_R}
                  fill="var(--ember-light)"
                  opacity={0.85}
                />
              ))}
              {candMedian !== undefined && (
                <line
                  x1={xScale(candMedian)} y1={baseY + ROW_H - 10}
                  x2={xScale(candMedian)} y2={baseY + ROW_H + 10}
                  stroke="var(--ember-light)"
                  strokeWidth={2}
                />
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
