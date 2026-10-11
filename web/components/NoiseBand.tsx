'use client';
import { Attestation, formatBp } from '@/lib/types';
import { shortAddr } from '@/lib/types';

interface NoiseBandProps {
  attestations: Attestation[];
  minEffectBp: number;
  reason: string;
}

const PAD = { top: 10, right: 20, bottom: 30, left: 200 };
const ROW_H = 52;
const RANGE_BP = 3000; // ±30 pts shown

export default function NoiseBand({ attestations, minEffectBp, reason }: NoiseBandProps) {
  const counted = attestations.filter((a) => a.counted);
  const H = PAD.top + counted.length * ROW_H + PAD.bottom + 40;
  const W = 600;
  const chartW = W - PAD.left - PAD.right;

  // Map bp to x
  const xScale = (bp: number) => ((bp + RANGE_BP) / (RANGE_BP * 2)) * chartW;
  const zeroX = xScale(0);

  return (
    <div>
      <svg width={W} height={H} style={{ display: 'block', maxWidth: '100%', overflow: 'visible' }}>
        <g transform={`translate(${PAD.left}, ${PAD.top})`}>
          {/* Noise band: -minEffect to +minEffect */}
          <rect
            x={xScale(-minEffectBp)}
            y={0}
            width={xScale(minEffectBp) - xScale(-minEffectBp)}
            height={H - PAD.top - PAD.bottom}
            fill="var(--band)"
          />
          <text
            x={(xScale(-minEffectBp) + xScale(minEffectBp)) / 2}
            y={H - PAD.top - PAD.bottom + 12}
            textAnchor="middle"
            fill="var(--stone)"
            fontSize="9"
            fontFamily="var(--font-mono)"
          >
            too small to count (±{(minEffectBp / 100).toFixed(0)} pts)
          </text>

          {/* Zero line */}
          <line
            x1={zeroX} y1={0}
            x2={zeroX} y2={H - PAD.top - PAD.bottom}
            stroke="var(--border)"
            strokeWidth={1}
          />

          {/* Axis labels */}
          {[-RANGE_BP, -RANGE_BP / 2, 0, RANGE_BP / 2, RANGE_BP].map((v) => (
            <g key={v}>
              <line
                x1={xScale(v)} y1={H - PAD.top - PAD.bottom}
                x2={xScale(v)} y2={H - PAD.top - PAD.bottom + 4}
                stroke="var(--text-dim)"
              />
              <text
                x={xScale(v)}
                y={H - PAD.top - PAD.bottom + 14}
                textAnchor="middle"
                fill="var(--text-dim)"
                fontSize="9"
                fontFamily="var(--font-mono)"
              >
                {v >= 0 ? '+' : ''}{(v / 100).toFixed(0)}
              </text>
            </g>
          ))}

          {/* Per-verifier rows */}
          {counted.map((att, i) => {
            const y = i * ROW_H + ROW_H / 2;
            const dotX = xScale(att.effectBp);
            const ciLowX = xScale(att.ciLowBp);
            const ciHighX = xScale(att.ciHighBp);
            const callColor =
              att.call === 'gain' ? 'var(--ember-light)' :
              att.call === 'loss' ? 'var(--reject)' :
              'var(--stone-light)';

            return (
              <g key={att.id}>
                {/* Verifier label */}
                <text
                  x={-8}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="var(--text-muted)"
                  fontSize="11"
                  fontFamily="var(--font-mono)"
                >
                  {shortAddr(att.signer)}
                </text>

                {/* CI bar */}
                <line
                  x1={ciLowX} y1={y}
                  x2={ciHighX} y2={y}
                  stroke={callColor}
                  strokeWidth={3}
                  strokeLinecap="round"
                  opacity={0.5}
                />

                {/* CI end caps */}
                <line x1={ciLowX} y1={y - 5} x2={ciLowX} y2={y + 5} stroke={callColor} strokeWidth={1.5} />
                <line x1={ciHighX} y1={y - 5} x2={ciHighX} y2={y + 5} stroke={callColor} strokeWidth={1.5} />

                {/* Effect dot */}
                <circle cx={dotX} cy={y} r={6} fill={callColor} />

                {/* Effect label */}
                <text
                  x={dotX + 10}
                  y={y}
                  dominantBaseline="middle"
                  fill={callColor}
                  fontSize="10"
                  fontFamily="var(--font-mono)"
                >
                  {formatBp(att.effectBp)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Verdict sentence */}
      <p style={{
        marginTop: '12px',
        fontSize: '13px',
        color: 'var(--text-muted)',
        lineHeight: 1.6,
        fontStyle: 'italic',
      }}>
        {reason}
      </p>
    </div>
  );
}
