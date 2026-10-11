'use client';
import { useEffect, useState, useCallback, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { HellgateExport, Tree, formatScore } from '@/lib/types';
import { formatDeltaBp, formatScorePct } from '@/lib/chartTokens';
import TreeSwitcher from '@/components/TreeSwitcher';
import { ScoreCurve as PaperScoreCurve, TreeDiagram, StatusMark, DeltaPair, UseCaseMatrix } from '@/components/charts';
import StatusBadge from '@/components/StatusBadge';
import Explainer from '@/components/Explainer';
import Link from 'next/link';

function MiniSpark({ scores }: { scores: number[] }) {
  const W = 220;
  const H = 56;
  const PAD = 6;
  if (scores.length < 2) return null;
  const lo = Math.min(...scores);
  const hi = Math.max(...scores);
  const span = Math.max(hi - lo, 1);
  const x = (i: number) => PAD + (i / (scores.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (H - PAD * 2) * (1 - (v - lo) / span);
  const d = scores.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gate path score sparkline" style={{ display: 'block', width: '100%', height: 'auto' }}>
      {scores.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill="var(--ink)" />
      ))}
      <path d={d} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

function GateContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tree = searchParams.get('tree') ?? 'coding-agent';

  const [trees, setTrees] = useState<Tree[]>([]);
  const [data, setData] = useState<HellgateExport | null>(null);
  const [loading, setLoading] = useState(true);
  const [gatePathOnly, setGatePathOnly] = useState(false);
  const [version, setVersion] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const [treesRes, exportRes] = await Promise.all([
      fetch('/api/trees'),
      fetch(`/api/export?tree=${tree}`),
    ]);
    const treesData = await treesRes.json();
    const exportData = await exportRes.json();
    setTrees(treesData);
    setData(exportData);
    setLoading(false);
  }, [tree]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/version?tree=${tree}`);
        const { version: v } = await res.json();
        setVersion((prev) => {
          if (prev !== null && prev !== v) {
            fetchData();
          }
          return v;
        });
      } catch {}
    }, 3000);
    const handleRefresh = () => fetchData();
    window.addEventListener('hellgate-refresh', handleRefresh);
    return () => {
      clearInterval(poll);
      window.removeEventListener('hellgate-refresh', handleRefresh);
    };
  }, [tree, fetchData]);

  const latestAcceptedId = useMemo(() => {
    if (!data || !data.gatePath.length) return null;
    return data.gatePath[data.gatePath.length - 1];
  }, [data]);

  useEffect(() => {
    if (data && !selectedId) setSelectedId(latestAcceptedId);
  }, [data, latestAcceptedId, selectedId]);

  if (loading) return <LoadingSkeleton />;
  if (!data) return <div style={{ padding: '80px 32px', color: 'var(--muted)' }}>No data.</div>;

  const byId = new Map(data.changes.map((c) => [c.id, c]));
  const latest = data.changes[data.changes.length - 1];
  const selected = (selectedId && byId.get(selectedId)) ?? (latestAcceptedId && byId.get(latestAcceptedId)) ?? latest;
  const pending = data.changes.filter((c) => c.status === 'pending' || c.status === 'contested');
  const rejected = data.changes.filter((c) => c.status === 'rejected');
  const graveyardPreview = [...rejected]
    .sort((a, b) => Math.abs(b.effectBp ?? 0) - Math.abs(a.effectBp ?? 0))
    .slice(0, 3);
  const accepted = data.changes.filter((c) => c.status === 'accepted' && c.perGroup.length > 0).slice(-3);
  const groups = data.suite.groups;
  const matrixRows = groups.map((g) => {
    const cells = accepted.map((a) => {
      const pg = a.perGroup.find((x) => x.group === g.id);
      return {
        change: a.claim.motif,
        deltaBp: pg ? pg.candidateBp - pg.parentBp : null as number | null,
        highlight: false,
      };
    });
    // highlight the cell that lit up: max delta in row
    let best = -1;
    let bestVal = -Infinity;
    cells.forEach((c, i) => {
      if (c.deltaBp !== null && c.deltaBp > bestVal) {
        bestVal = c.deltaBp;
        best = i;
      }
    });
    if (best >= 0 && (cells[best].deltaBp ?? 0) >= 500) cells[best].highlight = true;
    return { useCase: g.name, cells };
  });

  const treeNodes = (gatePathOnly ? data.changes.filter((c) => data.gatePath.includes(c.id)) : data.changes).map((c) => ({
    id: c.id,
    label: c.claim.motif,
    parent: c.parent === 'genesis' ? null : c.parent,
    status: c.status,
    scoreBp: c.scoreBp,
    vsParentBp: c.effectBp,
  }));

  const stats: Array<{ label: string; value: number; note: string; ember?: boolean }> = [
    { label: 'Changes tried', value: data.totals.changes, note: `${data.totals.changes} changes tried`, ember: true },
    { label: 'Through the gate', value: data.totals.accepted, note: `${data.totals.accepted} through the gate` },
    { label: 'Graveyard', value: data.totals.rejected + data.totals.void, note: `${data.totals.rejected + data.totals.void} in the graveyard` },
    { label: 'Pending', value: data.totals.pending + data.totals.contested, note: `${data.totals.pending + data.totals.contested} at the gate` },
  ];

  return (
    <div className="container" style={{ paddingTop: '40px', paddingBottom: '80px' }}>
      {/* Hero: 7 cols + 5 cols */}
      <div className="grid-12" style={{ marginBottom: '32px', alignItems: 'stretch' }}>
        <div style={{ gridColumn: 'span 7' }}>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 56, lineHeight: 1.05, margin: '0 0 12px' }}>
            {data.tree}
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 15, margin: '0 0 20px', maxWidth: 520, lineHeight: 1.6 }}>
            Proof for AI agent changes. A change only passes when other keys re-measure a real gain.
          </p>
          <Suspense>
            <TreeSwitcher trees={trees} />
          </Suspense>
        </div>
        <div style={{ gridColumn: 'span 5' }}>
          {latest && (
            <div className="card" aria-label="Latest verdict">
              <div className="section-label" style={{ marginBottom: 12 }}>Latest verdict</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <StatusMark status={latest.status} size={14} label={`latest ${latest.status}`} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)' }}>{latest.claim.motif}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--ember)', lineHeight: 1, marginBottom: 12 }}>
                {latest.scoreBp !== null ? formatScorePct(latest.scoreBp) : '—'}
              </div>
              <DeltaPair vsBaseBp={latest.vsBaseBp} vsParentBp={latest.effectBp} />
              <div style={{ marginTop: 12 }}>
                <MiniSpark scores={data.curve.map((p) => p.scoreBp)} />
              </div>
            </div>
          )}
        </div>
      </div>

      <Explainer domain={data.domain} />

      {(() => {
        const prod = byId.get(data.gatePath[data.gatePath.length - 1] ?? '');
        if (!prod) return null;
        return (
          <section className="card" style={{ marginBottom: 32, display: 'flex', flexWrap: 'wrap', gap: '8px 28px', alignItems: 'baseline' }} aria-label="In production">
            <div className="section-label">In production</div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{prod.claim.area}/{prod.claim.motif}</span>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--ember)' }}>{prod.scoreBp !== null ? formatScorePct(prod.scoreBp) : '—'}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              the tip of the gate path: only a change accepted by distinct verifier keys, on a chain of accepted changes, is released. Everything else stays in non-production.
            </span>
            <Link href={`/production?tree=${tree}`} style={{ fontSize: 12 }}>View the release →</Link>
          </section>
        );
      })()}

      {/* Stats strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          border: '1px solid var(--line)',
          background: 'var(--card)',
          borderRadius: 2,
          marginBottom: 48,
          overflow: 'hidden',
        }}
        role="img"
        aria-label="Totals"
      >
        {stats.map((s, i) => (
          <div
            key={s.label}
            style={{
              padding: '16px 20px',
              borderLeft: i > 0 ? '1px solid var(--line)' : 'none',
            }}
          >
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
              {s.label}
            </div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 40, lineHeight: 1.1, color: s.ember ? 'var(--ember)' : 'var(--ink)' }}>
              {s.value}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{s.note}</div>
          </div>
        ))}
      </div>

      {/* Tree section: 8 cols + 4 cols rail */}
      <div className="section-head">
        <h2 className="section-title">Change tree</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="section-caption">Gate path only</span>
          <div className="seg" role="group" aria-label="Gate path only">
            <button id="toggle-gate-path" aria-pressed={gatePathOnly} onClick={() => setGatePathOnly(true)}>On</button>
            <button aria-pressed={!gatePathOnly} onClick={() => setGatePathOnly(false)}>Off</button>
          </div>
        </div>
      </div>
      <div className="grid-12" style={{ marginBottom: 48, alignItems: 'start' }}>
        <div style={{ gridColumn: 'span 8', minWidth: 0 }}>
          <TreeDiagram
            nodes={treeNodes}
            gatePath={data.gatePath}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
          />
          <div style={{ marginTop: 10, display: 'flex', gap: 20, fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)', flexWrap: 'wrap' }}>
            <span>● accept = through the gate</span>
            <span>✕ reject = graveyard</span>
            <span>◐ contest = disputed</span>
            <span>○ pending = at the gate</span>
            <span>░ void = never ran</span>
          </div>
        </div>
        <aside style={{ gridColumn: 'span 4', minWidth: 0, position: 'sticky', top: 76 }}>
          {selected && (
            <div className="card" aria-label="Selected change">
              <div className="section-label" style={{ marginBottom: 10 }}>Selected change</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <StatusMark status={selected.status} size={14} selected label={`selected ${selected.status}`} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)' }}>{selected.claim.motif}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--ink)', lineHeight: 1, marginBottom: 12 }}>
                {selected.scoreBp !== null ? formatScorePct(selected.scoreBp) : '—'}
              </div>
              <DeltaPair vsBaseBp={selected.vsBaseBp} vsParentBp={selected.effectBp} />
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: '12px 0' }}>
                “{selected.claim.hypothesis.slice(0, 160)}{selected.claim.hypothesis.length > 160 ? '…' : ''}”
              </p>
              <Link href={`/change/${selected.id}?tree=${tree}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ember)' }}>
                Open receipt →
              </Link>
            </div>
          )}
        </aside>
      </div>

      {/* Below tree: curve + matrix side by side */}
      <div className="grid-12" style={{ marginBottom: 48, alignItems: 'stretch' }}>
        <div style={{ gridColumn: 'span 6', minWidth: 0 }}>
          {data.curve.length > 1 && (
            <PaperScoreCurve
              points={data.curve.map((p) => {
                const ch = byId.get(p.change);
                return {
                  label: ch ? ch.claim.motif : `gen ${p.depth}`,
                  scoreBp: p.scoreBp,
                  status: ch ? ch.status : 'accepted',
                  vsBaseBp: p.vsBaseBp,
                  vsParentBp: ch ? ch.effectBp : null,
                };
              })}
              title="Score rises along the gate path, rejected tries stay visible"
              caption="Stepped score along the gate path. Crosses are measured but rejected changes. Void shows —, never zero."
            />
          )}
          <p style={{ fontSize: 12, marginTop: 8, color: 'var(--muted)' }}>
            base = {formatScore(data.base.scoreBp)} (gen 0) · <Link href="/charts" style={{ color: 'var(--ember)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>Open paper figures →</Link>
          </p>
        </div>
        <div style={{ gridColumn: 'span 6', minWidth: 0 }}>
          {matrixRows.length > 0 && accepted.length > 0 ? (
            <UseCaseMatrix
              rows={matrixRows}
              changeLabels={accepted.map((a) => a.claim.motif)}
              title="Gains concentrate where the fix applies"
              caption="Signed point change per use case across accepted changes. Ember outline marks the cell that lit up."
            />
          ) : (
            <div className="card">
              <div className="section-label">Use cases</div>
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>No accepted per-group evidence yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* Graveyard preview */}
      {graveyardPreview.length > 0 && (
        <section style={{ marginBottom: 48 }}>
          <div className="section-head">
            <h2 className="section-title">Graveyard preview</h2>
            <Link href={`/graveyard?tree=${tree}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
              All graves →
            </Link>
          </div>
          <div className="grid-12">
            {graveyardPreview.map((c) => (
              <div key={c.id} style={{ gridColumn: 'span 4', minWidth: 0 }}>
                <div className="card" style={{ height: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <StatusMark status={c.status} size={10} label={`graveyard ${c.status}`} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)' }}>{c.claim.motif}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--reject)', marginBottom: 6 }}>
                    {formatDeltaBp(c.effectBp)}
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 10px' }}>
                    “{c.claim.hypothesis.slice(0, 110)}{c.claim.hypothesis.length > 110 ? '…' : ''}”
                  </p>
                  <Link href={`/change/${c.id}?tree=${tree}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
                    {c.code.toLowerCase().replace(/_/g, ' ')} →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* At the gate */}
      {pending.length > 0 && (
        <section style={{ marginBottom: 48 }}>
          <div className="section-head">
            <h2 className="section-title">At the gate right now</h2>
            <span className="section-caption">{pending.length} waiting</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {pending.map((c) => (
              <div key={c.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <StatusBadge status={c.status} code={c.code} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                    {c.claim.motif}: {c.claim.hypothesis.slice(0, 80)}…
                  </div>
                </div>
                <Link href={`/change/${c.id}?tree=${tree}`} className="btn btn-outline" style={{ fontSize: '12px', padding: '6px 14px' }}>
                  View →
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24, marginBottom: 40 }}>
        <div>
          <h2 style={{ fontSize: 28, margin: '0 0 8px' }}>Think you can beat it?</h2>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 15 }}>
            Type one instruction for the agent. We measure it for real, with two distinct verifier keys. Most ideas die here.
          </p>
        </div>
        <Link href="/beat-the-gate" className="btn btn-ember" style={{ fontSize: '15px', padding: '12px 28px' }}>
          Beat the Gate →
        </Link>
      </section>

      <p style={{ fontSize: '12px', color: 'var(--muted)', textAlign: 'center' }}>
        Distinct keys, not proof of distinct people.
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="container" style={{ paddingTop: '40px' }}>
      <div className="skeleton" style={{ height: '32px', width: '200px', marginBottom: '40px' }} />
      <div className="skeleton" style={{ height: '52px', width: '300px', marginBottom: '12px' }} />
      <div className="skeleton" style={{ height: '16px', width: '400px', marginBottom: '32px' }} />
      <div style={{ display: 'flex', gap: '32px', marginBottom: '56px' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i}>
            <div className="skeleton" style={{ height: '40px', width: '60px', marginBottom: '8px' }} />
            <div className="skeleton" style={{ height: '12px', width: '100px' }} />
          </div>
        ))}
      </div>
      <div className="skeleton" style={{ height: '240px', borderRadius: '2px' }} />
    </div>
  );
}

export default function GatePage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <GateContent />
    </Suspense>
  );
}
