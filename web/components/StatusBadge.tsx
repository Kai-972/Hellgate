import { ChangeStatus, ChangeCode } from '@/lib/types';

const STATUS_LABELS: Record<ChangeStatus, string> = {
  accepted: 'Through the gate',
  rejected: 'Graveyard',
  pending: 'At the gate',
  contested: 'Disputed',
  void: 'Never ran',
};

function getLabel(status: ChangeStatus, code: ChangeCode): string {
  if (status === 'rejected') {
    if (code === 'NO_EFFECT') return 'Graveyard: no effect';
    if (code === 'REGRESSION') return 'Graveyard: regression';
    if (code === 'NOT_CLEAN') return 'Graveyard: not clean';
    if (code === 'UNREPRODUCIBLE') return 'Graveyard: unreproducible';
    return `Graveyard: ${code.toLowerCase()}`;
  }
  if (status === 'void') return `Never ran: ${code.toLowerCase()}`;
  if (status === 'pending') {
    if (code === 'NEEDS_VERIFIERS') return 'At the gate: needs verifiers';
    if (code === 'VERIFIERS_DISAGREE') return 'At the gate: verifiers disagree';
    return STATUS_LABELS[status];
  }
  if (status === 'contested') return `Disputed: ${code.toLowerCase().replace(/_/g, ' ')}`;
  return STATUS_LABELS[status];
}

interface StatusBadgeProps {
  status: ChangeStatus;
  code: ChangeCode;
  size?: 'sm' | 'md' | 'lg';
}

export default function StatusBadge({ status, code, size = 'md' }: StatusBadgeProps) {
  const label = getLabel(status, code);
  const fontSize = size === 'sm' ? '11px' : size === 'lg' ? '15px' : '13px';
  const padding = size === 'sm' ? '2px 8px' : size === 'lg' ? '6px 16px' : '4px 12px';

  return (
    <span
      className={`badge badge-${status}`}
      style={{ fontSize, padding }}
    >
      <StatusDot status={status} size={size === 'sm' ? 6 : 8} />
      {label}
    </span>
  );
}

export function StatusDot({ status, size = 8 }: { status: ChangeStatus; size?: number }) {
  const styles: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: 0,
  };

  if (status === 'accepted') {
    return (
      <span style={{
        ...styles,
        background: 'var(--accept)',
        border: '1px solid var(--card)',
      }} />
    );
  }
  if (status === 'rejected') {
    return (
      <span style={{
        ...styles,
        background: 'var(--stone)',
        borderRadius: '2px',
        transform: 'rotate(5deg)',
      }} />
    );
  }
  if (status === 'void') {
    return (
      <span style={{
        ...styles,
        background: 'transparent',
        border: '1.5px dashed var(--text-dim)',
      }} />
    );
  }
  if (status === 'pending') {
    return (
      <span style={{
        ...styles,
        background: 'transparent',
        border: `1.5px solid var(--ember)`,
      }} />
    );
  }
  if (status === 'contested') {
    return (
      <span style={{
        ...styles,
        background: 'var(--amber)',
        borderRadius: '2px',
        transform: 'rotate(45deg)',
        width: size * 0.85,
        height: size * 0.85,
      }} />
    );
  }
  return null;
}
