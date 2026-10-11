'use client';
import { useId, useMemo, useState } from 'react';
import { chartTokens, chartFonts, formatScorePct, formatDeltaBp } from '@/lib/chartTokens';
import type { ChangeStatus } from '@/lib/types';
import StatusMark from './StatusMark';

export interface TreeDatum {
  id: string;
  label: string;
  parent: string | null;
  status: ChangeStatus;
  scoreBp: number | null;
  vsParentBp?: number | null;
}

interface TreeDiagramProps {
  nodes: TreeDatum[];
  gatePath?: string[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  title?: string;
  caption?: string;
}

const NODE = 15;
const GATE_Y = 86;
const PAD_X = 48;
const VB_W = 900;

/** Ancestors + self + descendants of id. */
function lineageOf(id: string, byId: Map<string, TreeDatum>, childrenOf: Map<string, TreeDatum[]>): Set<string> {
  const set = new Set<string>([id]);
  let cur = byId.get(id);
  while (cur?.parent && byId.has(cur.parent)) {
    set.add(cur.parent);
    cur = byId.get(cur.parent);
  }
  const stack = [id];
  while (stack.length) {
    const cid = stack.pop()!;
    for (const k of childrenOf.get(cid) ?? []) {
      if (!set.has(k.id)) {
        set.add(k.id);
        stack.push(k.id);
      }
    }
  }
  return set;
}

/**
 * Tree diagram — gate path on one straight row, elbow connectors,
 * full-width spread, small nodes, bg-backed edge labels.
 */
export default function TreeDiagram({
  nodes,
  gatePath,
  selectedId = null,
  onSelect,
  title = 'The gate path stays straight, the graveyard hangs below',
  caption = 'Gate path left to right on one row. Rejected branches hang below with status marks. Select a node for detail.',
}: TreeDiagramProps) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const titleId = useId();
  const descId = useId();

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const childrenOf = useMemo(() => {
    const m = new Map<string, TreeDatum[]>();
    for (const n of nodes) {
      if (n.parent && byId.has(n.parent)) {
        const arr = m.get(n.parent) ?? [];
        arr.push(n);
        m.set(n.parent, arr);
      }
    }
    return m;
  }, [nodes, byId]);

  // Gate order: explicit prop wins, else greedy accepted chain from root.
  const gate: TreeDatum[] = useMemo(() => {
    if (gatePath && gatePath.length) {
      const ordered = gatePath.map((id) => byId.get(id)).filter((n): n is TreeDatum => !!n);
      if (ordered.length) return ordered;
    }
    const roots = nodes.filter((n) => !n.parent || !byId.has(n.parent));
    const start = roots[0] ?? nodes[0];
    const out: TreeDatum[] = [];
    const seen = new Set<string>();
    let cur: TreeDatum | undefined = start;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.push(cur);
      const kids: TreeDatum[] = childrenOf.get(cur.id) ?? [];
      cur = kids.find((k: TreeDatum) => k.status === 'accepted');
    }
    return out;
  }, [nodes, byId, childrenOf, gatePath]);

  const gateIds = useMemo(() => new Set(gate.map((n) => n.id)), [gate]);
  const branches = useMemo(() => nodes.filter((n) => !gateIds.has(n.id)), [nodes, gateIds]);

  const activeId = hoverId ?? selectedId;
  const lineage = useMemo(
    () => (activeId && byId.has(activeId) ? lineageOf(activeId, byId, childrenOf) : null),
    [activeId, byId, childrenOf]
  );
  const dim = (id: string) => (lineage ? !lineage.has(id) : false);

  // Full-width spread for gate row.
  const gateX = (i: number) => {
    if (gate.length <= 1) return VB_W / 2;
    return PAD_X + (i * (VB_W - PAD_X * 2)) / (gate.length - 1);
  };

  // Branch slots grouped under their gate parent.
  const branchPos = useMemo(() => {
    const groups = new Map<string, TreeDatum[]>();
    const orphans: TreeDatum[] = [];
    for (const b of branches) {
      if (b.parent && gateIds.has(b.parent)) {
        const arr = groups.get(b.parent) ?? [];
        arr.push(b);
        groups.set(b.parent, arr);
      } else orphans.push(b);
    }
    const pos = new Map<string, { x: number; y: number }>();
    const baseY = GATE_Y + 96;
    let row = 0;
    const gateIndex = new Map(gate.map((g, i) => [g.id, i]));
    const sortedParents = [...groups.keys()].sort((a, b) => (gateIndex.get(a) ?? 0) - (gateIndex.get(b) ?? 0));
    for (const pid of sortedParents) {
      const sibs = groups.get(pid)!;
      const pi = gateIndex.get(pid) ?? 0;
      const px = gateX(pi);
      sibs.forEach((s, si) => {
        const spread = (si - (sibs.length - 1) / 2) * 120;
        const x = Math.min(Math.max(px + spread, 70), VB_W - 70);
        pos.set(s.id, { x, y: baseY + row * 46 });
        row += 1;
      });
    }
    orphans.forEach((o) => {
      pos.set(o.id, { x: VB_W - 90, y: baseY + row * 46 });
      row += 1;
    });
    return { pos, rows: row };
  }, [branches, gateIds, gate]);

  const VB_H = GATE_Y + 96 + Math.max(branchPos.rows, 0) * 46 + 56;

  const genLabel = (i: number) => (i === 0 ? 'Genesis' : `Gen ${i}`);

  const edgeLabel = (n: TreeDatum) =>
    n.vsParentBp !== null && n.vsParentBp !== undefined ? formatDeltaBp(n.vsParentBp) : null;

  return (
    <figure style={{ margin: 0, background: chartTokens.card, border: `1px solid ${chartTokens.line}`, borderRadius: 2, padding: '24px 24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <h3 id={titleId} style={{ fontFamily: chartFonts.serif, fontSize: 28, color: chartTokens.ink, margin: 0, fontWeight: 400, letterSpacing: '-0.01em' }}>
          {title}
        </h3>
      </div>
      <div style={{ overflowX: 'auto', border: `1px solid ${chartTokens.line}`, borderRadius: 2, background: chartTokens.card }}>
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          width="100%"
          style={{ display: 'block', minWidth: 560, height: 'auto', background: chartTokens.card }}
          role="img"
          aria-label="Change tree, gate path straight, rejected branches below"
          aria-describedby={descId}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault();
            const order = [...gate, ...branches];
            if (!order.length) return;
            const idx = Math.max(order.findIndex((n) => n.id === activeId), 0);
            const next = order[(idx + (e.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length];
            setHoverId(next.id);
            onSelect?.(next.id);
          }}
        >
          {/* column guides + headers */}
          {gate.map((g, i) => (
            <g key={`h-${g.id}`}>
              <line x1={gateX(i)} y1={28} x2={gateX(i)} y2={VB_H - 12} stroke={chartTokens.grid} strokeWidth={1} />
              <text x={gateX(i)} y={16} textAnchor="middle" fill={chartTokens.muted} fontSize={11} fontFamily={chartFonts.mono} style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {genLabel(i)}
              </text>
            </g>
          ))}

          {/* straight gate path: 2px ink */}
          {gate.slice(1).map((n, i) => (
            <line
              key={`gate-${n.id}`}
              x1={gateX(i)}
              y1={GATE_Y}
              x2={gateX(i + 1)}
              y2={GATE_Y}
              stroke={lineage && (!lineage.has(gate[i].id) || !lineage.has(n.id)) ? chartTokens.line : chartTokens.ink}
              strokeWidth={2}
              opacity={lineage && (!lineage.has(gate[i].id) || !lineage.has(n.id)) ? 0.4 : 1}
            />
          ))}

          {/* elbow connectors for branches */}
          {branches.map((n) => {
            const p = branchPos.pos.get(n.id);
            if (!p) return null;
            const gi = gate.findIndex((g) => g.id === n.parent);
            const px = gi >= 0 ? gateX(gi) : PAD_X;
            const elbowY = GATE_Y + 34;
            const lbl = edgeLabel(n);
            const midX = (px + p.x) / 2;
            const w = lbl ? lbl.length * 6.8 + 12 : 0;
            const faded = dim(n.id);
            const inLineage = lineage ? lineage.has(n.id) && (n.parent ? lineage.has(n.parent) : true) : false;
            return (
              <g key={`e-${n.id}`} opacity={faded ? 0.4 : 1}>
                <path
                  d={`M ${px} ${GATE_Y} V ${elbowY} H ${p.x} V ${p.y - 12}`}
                  fill="none"
                  stroke={inLineage ? chartTokens.ink : chartTokens.line}
                  strokeWidth={1}
                />
                {lbl && (
                  <g>
                    <rect x={midX - w / 2} y={elbowY - 19} width={w} height={15} fill={chartTokens.card} stroke={chartTokens.line} strokeWidth={1} />
                    <text x={midX} y={elbowY - 8} textAnchor="middle" fill={chartTokens.ink} fontSize={11} fontFamily={chartFonts.mono}>
                      {lbl}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* gate nodes */}
          {gate.map((n, i) => {
            const faded = dim(n.id);
            const isSel = selectedId === n.id;
            return (
              <g
                key={n.id}
                transform={`translate(${gateX(i)},${GATE_Y})`}
                onClick={() => onSelect?.(n.id)}
                onMouseEnter={() => setHoverId(n.id)}
                onMouseLeave={() => setHoverId(null)}
                style={{ cursor: onSelect ? 'pointer' : 'default', opacity: faded ? 0.4 : 1, transition: 'opacity 150ms' }}
              >
                <circle r={NODE / 2 + 5} fill="none" stroke={isSel ? chartTokens.ember : 'transparent'} strokeWidth={2} />
                <g transform={`translate(${-NODE / 2},${-NODE / 2})`}>
                  <StatusMark status={n.status} size={NODE} label={`${n.label} ${n.status}`} />
                </g>
                <text y={-16} textAnchor="middle" fill={chartTokens.muted} fontSize={11} fontFamily={chartFonts.mono}>
                  {n.scoreBp === null ? '—' : formatScorePct(n.scoreBp)}
                </text>
                <text y={26} textAnchor="middle" fill={chartTokens.ink} fontSize={11} fontFamily={chartFonts.mono}>
                  {n.label}
                </text>
              </g>
            );
          })}

          {/* branch nodes */}
          {branches.map((n) => {
            const p = branchPos.pos.get(n.id);
            if (!p) return null;
            const faded = dim(n.id);
            const isSel = selectedId === n.id;
            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                onClick={() => onSelect?.(n.id)}
                onMouseEnter={() => setHoverId(n.id)}
                onMouseLeave={() => setHoverId(null)}
                style={{ cursor: onSelect ? 'pointer' : 'default', opacity: faded ? 0.4 : 1, transition: 'opacity 150ms' }}
              >
                <circle r={NODE / 2 + 5} fill="none" stroke={isSel ? chartTokens.ember : 'transparent'} strokeWidth={2} />
                <g transform={`translate(${-NODE / 2},${-NODE / 2})`}>
                  <StatusMark status={n.status} size={NODE} label={`${n.label} ${n.status}`} />
                </g>
                <text y={-16} textAnchor="middle" fill={chartTokens.muted} fontSize={11} fontFamily={chartFonts.mono}>
                  {n.scoreBp === null ? '—' : formatScorePct(n.scoreBp)}
                </text>
                <text y={26} textAnchor="middle" fill={chartTokens.ink} fontSize={11} fontFamily={chartFonts.mono}>
                  {n.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption id={descId} style={{ fontFamily: chartFonts.sans, fontSize: 13, color: chartTokens.muted, marginTop: 8 }}>
        {caption}
      </figcaption>
      <table style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        <caption>Tree data</caption>
        <tbody>
          {nodes.map((n) => (
            <tr key={n.id}><td>{n.label}</td><td>{n.status}</td><td>{n.scoreBp ?? '—'}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
