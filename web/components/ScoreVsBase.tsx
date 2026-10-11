'use client';
import { Change, formatBp } from '@/lib/types';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

interface ScoreVsBaseProps {
  changes: Change[];
  gatePathOnly?: boolean;
  gatePath: string[];
  baseBp: number;
}

const PAD = { top: 30, right: 20, bottom: 50, left: 70 };
const H = 280;
const W = 680;

export default function ScoreVsBase({ changes, gatePathOnly, gatePath, baseBp }: ScoreVsBaseProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tree = searchParams.get('tree') ?? '';
  const treeParam = tree ? `?tree=${tree}` : '';
  const [hovered, setHovered] = useState<string | null>(null);

  const verified = changes.filter(
    (c) => c.vsBaseBp !== null && c.effectBp !== null
  );
  const visible = gatePathOnly ? verified.filter((c) => gatePath.includes(c.id)) : verified;

  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const allVs = visible.map((c) => c.vsBaseBp!);
  const maxAbs = Math.max(Math.abs(Math.min(...allVs, -300)), Math.abs(Math.max(...allVs, 300)));
  const yRange = maxAbs * 1.15;

  const xScale = (i: number) =>
    (i / Math.max(visible.length - 1, 1)) * chartW;
  const yScale = (bp: number) =>
    chartH / 2 - (bp / yRange) * (chartH / 2);

  const zeroY = chartH / 2;

  const hoveredChange = hovered ? visible.find((c) => c.id === hovered) : null;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        width={W}
        height={H}
        style={{ display: 'block', maxWidth: '100%', overflow: 'visible' }}
      >
        <g transform={`translate(${PAD.left}, ${PAD.top})`}>
          {/* Zero line */}
          <line
            x1={0} y1={zeroY} x2={chartW} y2={zeroY}
            stroke="var(--border)"
            strokeWidth={1}
          />
          <text x={-8} y={zeroY} textAnchor="end" dominantBaseline="middle"
            fill="var(--text-dim)" fontSize="9" fontFamily="var(--font-mono)">
            base
          </text>

          {/* Grid */}
          {[0.5, 1].map((f) =>
            [1, -1].map((sign) => {
              const bp = sign * f * yRange;
              const y = yScale(bp);
              return (
                <g key={`${f}-${sign}`}>
                  <line x1={0} y1={y} x2={chartW} y2={y}
                    stroke="var(--grid)" strokeWidth={1} />
                  <text x={-8} y={y} textAnchor="end" dominantBaseline="middle"
                    fill="var(--text-dim)" fontSize="9" fontFamily="var(--font-mono)">
                    {formatBp(bp)}
                  </text>
                </g>
              );
            })
          )}

          {/* Dots */}
          {visible.map((c, i) => {
            const x = xScale(i);
            const y = yScale(c.vsBaseBp!);
            const up = c.vsBaseBp! >= 0;
            const onGate = gatePath.includes(c.id);
            const isHovered = hovered === c.id;

            return (
              <g
                key={c.id}
                style={{ cursor: 'pointer' }}
                onClick={() => router.push(`/change/${c.id}${treeParam}`)}
                onMouseEnter={() => setHovered(c.id)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Hover zone */}
                <circle cx={x} cy={y} r={16} fill="transparent" />
                {/* Dot */}
                <circle
                  cx={x} cy={y}
                  r={isHovered ? 8 : 6}
                  fill={up ? 'var(--ember)' : 'var(--stone)'}
                  opacity={onGate ? 1 : 0.5}
                  style={{ transition: 'opacity 150ms' }}
                />
                {/* Arrow indicator */}
                <text
                  x={x} y={y - 12}
                  textAnchor="middle"
                  fontSize="10"
                  fill={up ? 'var(--ember-light)' : 'var(--stone-light)'}
                >
                  {up ? '▲' : '▼'}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Tooltip */}
      {hoveredChange && (
        <div style={{
          position: 'absolute',
          top: 0,
          right: 0,
          background: 'var(--bg-3)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '10px 14px',
          maxWidth: '260px',
          fontSize: '12px',
          color: 'var(--text-muted)',
          lineHeight: 1.5,
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', fontSize: '10px', marginBottom: '4px' }}>
            {hoveredChange.claim.motif}
          </div>
          <div style={{ marginBottom: '4px' }}>
            vs base: <span style={{
              fontFamily: 'var(--font-mono)',
              color: hoveredChange.vsBaseBp! >= 0 ? 'var(--ember-light)' : 'var(--stone-light)',
            }}>
              {formatBp(hoveredChange.vsBaseBp)}
            </span>
          </div>
          {hoveredChange.slots.map((s) => (
            <div key={s} style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{s} model</div>
          ))}
        </div>
      )}
    </div>
  );
}
