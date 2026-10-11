'use client';
import { Change, HellgateExport, formatBp } from '@/lib/types';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface TreeNode {
  id: string;
  parent: string;
  depth: number;
  change: Change;
  children: TreeNode[];
  x: number;
  y: number;
}

interface ChangeTreeProps {
  data: HellgateExport;
  gatePathOnly?: boolean;
}

const NODE_W = 28;
const NODE_H = 28;
const COL_W = 200;
const ROW_H = 56;

function buildTree(changes: Change[], gatePathOnly: boolean, gatePath: string[]): TreeNode[] {
  const visibleIds = gatePathOnly ? new Set(gatePath) : null;
  const filtered = visibleIds
    ? changes.filter((c) => visibleIds.has(c.id))
    : changes;

  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const c of filtered) {
    map.set(c.id, { id: c.id, parent: c.parent, depth: c.depth, change: c, children: [], x: 0, y: 0 });
  }

  for (const node of map.values()) {
    const parentNode = map.get(node.parent);
    if (parentNode) {
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children so gate path children come first
  function sortChildren(n: TreeNode) {
    n.children.sort((a, b) => {
      const aGate = gatePath.includes(a.id) ? 0 : 1;
      const bGate = gatePath.includes(b.id) ? 0 : 1;
      return aGate - bGate;
    });
    n.children.forEach(sortChildren);
  }
  roots.forEach(sortChildren);

  // Assign positions
  let rowCounter = 0;
  function assignPositions(node: TreeNode) {
    node.x = node.depth * COL_W + 40;
    if (node.children.length === 0) {
      node.y = rowCounter * ROW_H + 40;
      rowCounter++;
    } else {
      node.children.forEach(assignPositions);
      const minY = Math.min(...node.children.map((c) => c.y));
      const maxY = Math.max(...node.children.map((c) => c.y));
      node.y = (minY + maxY) / 2;
    }
  }

  roots.forEach(assignPositions);
  return roots;
}

function collectAll(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  function walk(n: TreeNode) {
    result.push(n);
    n.children.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

function collectEdges(nodes: TreeNode[]): Array<{ from: TreeNode; to: TreeNode; onGate: boolean }> {
  const edges: Array<{ from: TreeNode; to: TreeNode; onGate: boolean }> = [];
  function walk(n: TreeNode) {
    n.children.forEach((child) => {
      edges.push({ from: n, to: child, onGate: child.change.status === 'accepted' });
      walk(child);
    });
  }
  nodes.forEach(walk);
  return edges;
}

export default function ChangeTree({ data, gatePathOnly = false }: ChangeTreeProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tree = searchParams.get('tree') ?? '';
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const roots = buildTree(data.changes, gatePathOnly, data.gatePath);
  const allNodes = collectAll(roots);
  const edges = collectEdges(roots);

  const maxX = Math.max(...allNodes.map((n) => n.x)) + COL_W;
  const maxY = Math.max(...allNodes.map((n) => n.y)) + ROW_H;

  const nodeColor = (c: Change) => {
    if (c.status === 'accepted') return 'var(--ember-light)';
    if (c.status === 'rejected') return 'var(--stone)';
    if (c.status === 'contested') return 'var(--amber)';
    if (c.status === 'pending') return 'transparent';
    return 'var(--bg-3)';
  };

  const nodeStroke = (c: Change) => {
    if (c.status === 'accepted') return 'var(--ember)';
    if (c.status === 'pending') return 'var(--ember)';
    if (c.status === 'void') return 'var(--text-dim)';
    return nodeColor(c);
  };

  const treeParam = tree ? `?tree=${tree}` : '';

  const hoveredChange = hoveredId ? allNodes.find((n) => n.id === hoveredId)?.change : null;

  return (
    <div style={{ position: 'relative', overflowX: 'auto' }}>
      <svg
        ref={svgRef}
        width={Math.max(maxX + 40, 400)}
        height={Math.max(maxY + 40, 200)}
        style={{ display: 'block' }}
      >
        {/* Edges */}
        {edges.map((e, i) => {
          const x1 = e.from.x + NODE_W / 2;
          const y1 = e.from.y;
          const x2 = e.to.x - NODE_W / 2;
          const y2 = e.to.y;
          const midX = (x1 + x2) / 2;
          const path = `M ${x1} ${y1} C ${midX} ${y1} ${midX} ${y2} ${x2} ${y2}`;
          const effectLabel = e.to.change.effectBp !== null ? formatBp(e.to.change.effectBp) : null;
          const midLabelX = (x1 + x2) / 2;
          const midLabelY = (y1 + y2) / 2;

          return (
            <g key={i}>
              <path
                d={path}
                fill="none"
                stroke={e.onGate ? 'var(--ember)' : 'var(--bg-4)'}
                strokeWidth={e.onGate ? 2 : 1}
                strokeDasharray={e.to.change.status === 'void' ? '4 3' : undefined}
                opacity={e.onGate ? 1 : 0.5}
              />
              {effectLabel && (
                <text
                  x={midLabelX}
                  y={midLabelY - 4}
                  textAnchor="middle"
                  fill={e.to.change.effectBp! >= 0 ? 'var(--ember-light)' : 'var(--stone-light)'}
                  fontSize="10"
                  fontFamily="var(--font-mono)"
                >
                  {effectLabel}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {allNodes.map((node) => {
          const c = node.change;
          const isOnGate = data.gatePath.includes(c.id);
          const r = NODE_W / 2;

          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              style={{ cursor: 'pointer' }}
              onClick={() => router.push(`/change/${c.id}${treeParam}`)}
              onMouseEnter={(e) => {
                setHoveredId(node.id);
                const rect = svgRef.current?.getBoundingClientRect();
                if (rect) {
                  setTooltipPos({ x: node.x + 20, y: node.y - 10 });
                }
              }}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Soft ring for accepted (flat, no glow) */}
              {isOnGate && c.status === 'accepted' && (
                <circle r={r + 4} fill="none" stroke="var(--accept)" strokeWidth={1} opacity={0.4} />
              )}
              {/* Node shape */}
              {c.status === 'void' ? (
                <rect
                  x={-r} y={-r} width={NODE_W} height={NODE_H}
                  rx={4} ry={4}
                  fill="transparent"
                  stroke="var(--text-dim)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
              ) : (
                <circle
                  r={r}
                  fill={nodeColor(c)}
                  stroke={nodeStroke(c)}
                  strokeWidth={c.status === 'pending' ? 2 : 0}
                />
              )}
              {/* Depth label inside node */}
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fill={c.status === 'accepted' ? 'var(--card)' : 'var(--text-muted)'}
                fontSize="10"
                fontWeight="600"
                fontFamily="var(--font-mono)"
                style={{ pointerEvents: 'none' }}
              >
                {c.depth}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hoveredChange && (
        <div style={{
          position: 'absolute',
          left: tooltipPos.x,
          top: tooltipPos.y,
          background: 'var(--bg-3)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '12px 14px',
          maxWidth: '280px',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
            {hoveredChange.claim.motif}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {hoveredChange.claim.hypothesis.slice(0, 120)}
            {hoveredChange.claim.hypothesis.length > 120 ? '…' : ''}
          </div>
          {hoveredChange.effectBp !== null && (
            <div style={{
              marginTop: '8px',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: hoveredChange.effectBp >= 0 ? 'var(--ember-light)' : 'var(--stone-light)',
            }}>
              {formatBp(hoveredChange.effectBp)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
