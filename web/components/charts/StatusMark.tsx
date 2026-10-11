'use client';
import { chartTokens } from '@/lib/chartTokens';
import type { ChangeStatus } from '@/lib/types';

interface StatusMarkProps {
  status: ChangeStatus;
  size?: number;
  selected?: boolean;
  label?: string;
}

/**
 * Status marks in charts (never colour alone).
 * accepted = filled circle + soft ring, rejected = ring + ✕,
 * pending = hollow ring, contested = half-filled, void = dashed ring.
 */
export default function StatusMark({ status, size = 10, selected = false, label }: StatusMarkProps) {
  const s = size;
  const c = s / 2;
  const r = s / 2 - 1;
  const uid = `${status}-${s}${selected ? '-sel' : ''}`;
  const ring = selected ? chartTokens.ember : chartTokens.line;

  const wrap = (inner: React.ReactNode) => (
    <svg
      width={s + 4}
      height={s + 4}
      viewBox={`0 0 ${s + 4} ${s + 4}`}
      role="img"
      aria-label={label ?? `status ${status}`}
      style={{ display: 'inline-block', verticalAlign: 'middle', overflow: 'visible' }}
    >
      <g transform={`translate(2,2)`}>{inner}</g>
      {selected && (
        <circle cx={(s + 4) / 2} cy={(s + 4) / 2} r={s / 2 + 2} fill="none" stroke={chartTokens.ember} strokeWidth={2} />
      )}
    </svg>
  );

  if (status === 'accepted') {
    return wrap(
      <g key={uid}>
        <circle cx={c} cy={c} r={r} fill="none" stroke={chartTokens.accept} strokeWidth={2} />
        <circle cx={c} cy={c} r={r - 2} fill={chartTokens.accept} />
      </g>
    );
  }
  if (status === 'rejected') {
    const x = r * 0.45;
    return wrap(
      <g key={uid}>
        <circle cx={c} cy={c} r={r} fill={chartTokens.card} stroke={chartTokens.reject} strokeWidth={1.5} />
        <line x1={c - x} y1={c - x} x2={c + x} y2={c + x} stroke={chartTokens.reject} strokeWidth={1.5} strokeLinecap="round" />
        <line x1={c + x} y1={c - x} x2={c - x} y2={c + x} stroke={chartTokens.reject} strokeWidth={1.5} strokeLinecap="round" />
      </g>
    );
  }
  if (status === 'pending') {
    return wrap(
      <circle key={uid} cx={c} cy={c} r={r} fill={chartTokens.card} stroke={chartTokens.pending} strokeWidth={1.5} />
    );
  }
  if (status === 'contested') {
    return wrap(
      <g key={uid}>
        <circle cx={c} cy={c} r={r} fill={chartTokens.card} stroke={chartTokens.contest} strokeWidth={1.5} />
        <path d={`M ${c} ${c - r} A ${r} ${r} 0 0 1 ${c} ${c + r} Z`} fill={chartTokens.contest} />
      </g>
    );
  }
  // void = dashed ring
  return wrap(
    <circle
      key={uid}
      cx={c}
      cy={c}
      r={r}
      fill={chartTokens.card}
      stroke={chartTokens.void}
      strokeWidth={1.5}
      strokeDasharray="2.5 2"
    />
  );
}
