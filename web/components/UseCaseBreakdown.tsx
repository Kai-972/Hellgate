'use client';
import { PerGroup, SuiteGroup, formatScore } from '@/lib/types';

interface UseCaseBreakdownProps {
  perGroup: PerGroup[];
  groups: SuiteGroup[];
}

const BAR_H = 10;
const ROW_H = 36;
const PAD = { top: 10, right: 20, bottom: 10, left: 160 };
const W = 500;

export default function UseCaseBreakdown({ perGroup, groups }: UseCaseBreakdownProps) {
  const chartW = W - PAD.left - PAD.right;

  const groupName = (id: string) =>
    groups.find((g) => g.id === id)?.name ?? id;

  return (
    <svg
      width={W}
      height={PAD.top + perGroup.length * ROW_H + PAD.bottom}
      style={{ display: 'block', maxWidth: '100%' }}
    >
      <g transform={`translate(${PAD.left}, ${PAD.top})`}>
        {perGroup.map((g, i) => {
          const y = i * ROW_H;
          const parentW = (g.parentBp / 10000) * chartW;
          const candW = (g.candidateBp / 10000) * chartW;
          const diff = g.candidateBp - g.parentBp;

          return (
            <g key={g.group}>
              {/* Group name */}
              <text
                x={-8}
                y={y + ROW_H / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--text-muted)"
                fontSize="11"
                fontFamily="var(--font-sans)"
              >
                {groupName(g.group)}
              </text>

              {/* Parent bar */}
              <rect
                x={0} y={y + 4}
                width={parentW} height={BAR_H}
                rx={2} fill="var(--stone)"
                opacity={0.4}
              />

              {/* Candidate bar */}
              <rect
                x={0} y={y + 18}
                width={candW} height={BAR_H}
                rx={2}
                fill={diff >= 0 ? 'var(--accept)' : 'var(--reject)'}
                opacity={0.8}
              />

              {/* Score labels */}
              <text
                x={Math.max(parentW + 4, 4)}
                y={y + 10}
                dominantBaseline="middle"
                fill="var(--stone-light)"
                fontSize="9"
                fontFamily="var(--font-mono)"
              >
                {formatScore(g.parentBp)}
              </text>
              <text
                x={Math.max(candW + 4, 4)}
                y={y + 24}
                dominantBaseline="middle"
                fill={diff >= 0 ? 'var(--accept)' : 'var(--reject)'}
                fontSize="9"
                fontFamily="var(--font-mono)"
              >
                {formatScore(g.candidateBp)}
                {' '}
                <tspan fill={diff >= 0 ? 'var(--accept)' : 'var(--reject)'}>
                  ({diff >= 0 ? '+' : '−'}{Math.abs(diff / 100).toFixed(1)}pts)
                </tspan>
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
