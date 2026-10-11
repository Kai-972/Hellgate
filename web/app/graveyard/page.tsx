'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { HellgateExport, Change, formatBp } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';
import Link from 'next/link';

function GraveyardContent() {
  const searchParams = useSearchParams();
  const tree = searchParams.get('tree') ?? 'coding-agent';

  const [data, setData] = useState<HellgateExport | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterArea, setFilterArea] = useState<string>('all');
  const [filterCause, setFilterCause] = useState<string>('all');

  useEffect(() => {
    fetch(`/api/export?tree=${tree}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, [tree]);

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: '60px' }}>
        <div className="skeleton" style={{ height: '40px', width: '200px', marginBottom: '24px' }} />
        {[1,2,3].map((i) => <div key={i} className="skeleton" style={{ height: '120px', borderRadius: '12px', marginBottom: '16px' }} />)}
      </div>
    );
  }
  if (!data) return null;

  const dead = data.changes.filter((c) => c.status === 'rejected' || c.status === 'void');

  const areas = ['all', ...new Set(dead.map((c) => c.claim.area))];
  const causes = ['all', ...new Set(dead.map((c) => c.code))];

  const filtered = dead.filter((c) => {
    if (filterArea !== 'all' && c.claim.area !== filterArea) return false;
    if (filterCause !== 'all' && c.code !== filterCause) return false;
    return true;
  });

  return (
    <div className="container" style={{ paddingTop: '40px', paddingBottom: '80px' }}>
      {/* Header */}
      <Link href={`/?tree=${tree}`} style={{ color: 'var(--text-dim)', fontSize: '13px', textDecoration: 'none' }}>
        ← {data.tree}
      </Link>
      <h1 style={{ marginTop: '16px', marginBottom: '8px', fontSize: 'clamp(24px, 4vw, 40px)' }}>
        The Graveyard
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '32px', maxWidth: '560px', lineHeight: 1.6 }}>
        Every idea here was tried and measured. Don't try it again unless you can say why this time is different.
      </p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '32px', alignItems: 'center' }}>
        <span className="section-label">Filter:</span>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)', alignSelf: 'center' }}>Area:</span>
          {areas.map((a) => (
            <button
              key={a}
              id={`filter-area-${a}`}
              onClick={() => setFilterArea(a)}
              style={{
                padding: '4px 12px',
                borderRadius: '20px',
                border: '1px solid',
                borderColor: filterArea === a ? 'var(--stone)' : 'var(--border)',
                background: filterArea === a ? 'var(--stone-dim)' : 'transparent',
                color: filterArea === a ? 'var(--stone-light)' : 'var(--text-dim)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              {a}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)', alignSelf: 'center' }}>Cause:</span>
          {causes.map((c) => (
            <button
              key={c}
              id={`filter-cause-${c}`}
              onClick={() => setFilterCause(c)}
              style={{
                padding: '4px 12px',
                borderRadius: '20px',
                border: '1px solid',
                borderColor: filterCause === c ? 'var(--stone)' : 'var(--border)',
                background: filterCause === c ? 'var(--stone-dim)' : 'transparent',
                color: filterCause === c ? 'var(--stone-light)' : 'var(--text-dim)',
                fontSize: '12px',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '20px' }}>
        {filtered.length} of {dead.length} entries
      </div>

      {/* Epitaph cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {filtered.map((c) => (
          <EpitaphCard key={c.id} change={c} tree={tree} />
        ))}
        {filtered.length === 0 && (
          <div style={{ color: 'var(--text-dim)', fontSize: '14px', textAlign: 'center', padding: '60px 0' }}>
            No entries match the current filter.
          </div>
        )}
      </div>
    </div>
  );
}

function EpitaphCard({ change, tree }: { change: Change; tree: string }) {
  const isVoid = change.status === 'void';
  return (
    <Link
      href={`/change/${change.id}?tree=${tree}`}
      style={{ textDecoration: 'none' }}
    >
      <div
        className="card"
        style={{
          borderColor: isVoid ? 'var(--line)' : 'var(--line)',
          background: isVoid ? 'var(--bg-2)' : 'var(--bg-2)',
          transition: 'opacity 150ms',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--muted)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--line)';
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            {/* Title: motif */}
            <div style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '16px',
              color: 'var(--stone-light)',
              marginBottom: '6px',
            }}>
              {change.claim.motif}
            </div>
            {/* Hypothesis */}
            <blockquote style={{
              margin: '0 0 12px 0',
              fontStyle: 'italic',
              fontSize: '13px',
              color: 'var(--text-dim)',
              lineHeight: 1.5,
              borderLeft: '2px solid var(--stone)',
              paddingLeft: '12px',
            }}>
              "{change.claim.hypothesis.slice(0, 160)}{change.claim.hypothesis.length > 160 ? '…' : ''}"
            </blockquote>
            {/* Cause */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusBadge status={change.status} code={change.code} size="sm" />
              <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>area: {change.claim.area}</span>
            </div>
          </div>

          {/* Numbers */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {change.effectBp !== null && change.claimed && (
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                <div>claimed: <span style={{ color: 'var(--text-muted)' }}>{formatBp(change.claimed.effectBp)}</span></div>
                <div>measured: <span style={{
                  color: (change.effectBp ?? 0) > 0 ? 'var(--accept)' : 'var(--reject)',
                }}>
                  {formatBp(change.effectBp)}
                </span></div>
                {change.ciLowBp !== null && (
                  <div style={{ fontSize: '10px', opacity: 0.6 }}>
                    [{formatBp(change.ciLowBp)}, {formatBp(change.ciHighBp)}]
                  </div>
                )}
              </div>
            )}
            {isVoid && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)' }}>
                never ran
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function GraveyardPage() {
  return (
    <Suspense fallback={
      <div className="container" style={{ paddingTop: '80px', color: 'var(--text-dim)' }}>Loading…</div>
    }>
      <GraveyardContent />
    </Suspense>
  );
}
