'use client';
import { useId } from 'react';
import { chartTokens, chartFonts, formatDeltaBp, heatFill } from '@/lib/chartTokens';

export interface MatrixCell {
  change: string;
  deltaBp: number | null;
  highlight?: boolean;
}

export interface MatrixRow {
  useCase: string;
  cells: MatrixCell[];
}

interface UseCaseMatrixProps {
  rows: MatrixRow[];
  changeLabels?: string[];
  title?: string;
  caption?: string;
}

/**
 * D. Use-case heat strip — flat tints only, max 3 steps, ember outline for lit-up cell.
 */
export default function UseCaseMatrix({
  rows,
  changeLabels,
  title = 'Standardisation lights up badly scaled features, Adam lights up imbalanced classes',
  caption = 'Signed point change per use case. Tinted cells are gains or losses, plain cells are roughly zero. Ember outline marks the cell that lit up.',
}: UseCaseMatrixProps) {
  const titleId = useId();
  const descId = useId();
  const cols = rows[0]?.cells.length ?? 0;
  const labels = changeLabels ?? rows[0]?.cells.map((c) => c.change) ?? [];

  return (
    <figure style={{ margin: 0, background: chartTokens.card, border: `1px solid ${chartTokens.line}`, borderRadius: 2, padding: '16px 16px 12px' }}>
      <h3 id={titleId} style={{ fontFamily: chartFonts.serif, fontSize: 17, color: chartTokens.ink, margin: '0 0 12px', fontWeight: 500 }}>{title}</h3>
      <div style={{ overflowX: 'auto', border: `1px solid ${chartTokens.line}`, borderRadius: 2 }}>
        <table role="img" aria-label="Use case heat strip" aria-describedby={descId} style={{ borderCollapse: 'collapse', minWidth: 480, width: '100%', background: chartTokens.card }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px 12px', fontFamily: chartFonts.mono, fontSize: 11, color: chartTokens.muted, fontWeight: 500, borderBottom: `1px solid ${chartTokens.line}` }}>
                Use case
              </th>
              {labels.map((l, i) => (
                <th key={i} style={{ textAlign: 'right', padding: '8px 12px', fontFamily: chartFonts.mono, fontSize: 11, color: chartTokens.muted, fontWeight: 500, borderBottom: `1px solid ${chartTokens.line}` }}>
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontFamily: chartFonts.sans, fontSize: 13, color: chartTokens.ink, fontWeight: 500, borderBottom: `1px solid ${chartTokens.grid}` }}>
                  {row.useCase}
                </th>
                {row.cells.map((cell, ci) => {
                  const gain = (cell.deltaBp ?? 0) > 0;
                  return (
                    <td
                      key={ci}
                      tabIndex={0}
                      title={`${row.useCase} / ${cell.change}: ${formatDeltaBp(cell.deltaBp)}`}
                      style={{
                        padding: '8px 12px',
                        textAlign: 'right',
                        fontFamily: chartFonts.mono,
                        fontSize: 11,
                        color: cell.deltaBp === null ? chartTokens.muted : gain ? chartTokens.accept : (cell.deltaBp ?? 0) < 0 ? chartTokens.reject : chartTokens.muted,
                        background: heatFill(cell.deltaBp),
                        borderBottom: `1px solid ${chartTokens.grid}`,
                        outline: cell.highlight ? `1px solid ${chartTokens.ember}` : 'none',
                        outlineOffset: -1,
                      }}
                    >
                      {formatDeltaBp(cell.deltaBp)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption id={descId} style={{ fontFamily: chartFonts.sans, fontSize: 13, color: chartTokens.muted, marginTop: 8 }}>{caption}</figcaption>
    </figure>
  );
}
