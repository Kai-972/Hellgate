'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { HellgateExport, Change, formatBp, formatScore, shortAddr, shortId } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';
import Link from 'next/link';
import ReleasePanel from '@/components/ReleasePanel';
import LiveProgress from '@/components/LiveProgress';
import { NoiseBandGauge, RunDots, UseCaseMatrix, DeltaPair, DigestCheck } from '@/components/charts';

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function DiffBlock({ diff }: { diff: string }) {
  if (!diff) return null;
  return (
    <div className="code-block" style={{ lineHeight: 1.6 }}>
      {diff.split('\n').map((line, i) => (
        <div
          key={i}
          className={
            line.startsWith('+') && !line.startsWith('+++')
              ? 'diff-add'
              : line.startsWith('-') && !line.startsWith('---')
              ? 'diff-del'
              : ''
          }
        >
          {line}
        </div>
      ))}
    </div>
  );
}

function ChangeContent() {
  const params = useParams();
  const id = params.id as string;
  const searchParams = useSearchParams();
  const tree = searchParams.get('tree') ?? 'coding-agent';

  const [data, setData] = useState<HellgateExport | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sortKey, setSortKey] = useState<'diff' | 'task'>('diff');

  useEffect(() => {
    fetch(`/api/export?tree=${tree}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, [tree]);

  if (loading) return <div style={{ padding: '80px 24px', color: 'var(--text-dim)' }}>Loading…</div>;
  if (!data) return null;

  const change: Change | undefined = data.changes.find((c) => c.id === id);
  if (!change) {
    return (
      <div className="container" style={{ paddingTop: '60px' }}>
        <h1 style={{ color: 'var(--text-dim)' }}>Change not found</h1>
        <Link href={`/?tree=${tree}`} className="btn btn-outline">← Back</Link>
      </div>
    );
  }

  const isVoid = change.status === 'void';
  const isActionable = change.status === 'pending' || change.status === 'contested';
  const minEffectBp = data.policy.minEffectBp;

  const sortedTasks = [...change.perTask].sort((a, b) => {
    if (sortKey === 'diff') return (b.candidateBp - b.parentBp) - (a.candidateBp - a.parentBp);
    return a.task.localeCompare(b.task);
  });

  async function runVerifier(bot: string) {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'verify', changeId: change!.id, bot }),
    });
    const { id: jobId } = await res.json();
    setActiveJob(jobId);
  }

  return (
    <div className="container" style={{ paddingTop: '40px', paddingBottom: '80px' }}>
      {/* Back link */}
      <Link href={`/?tree=${tree}`} style={{ color: 'var(--text-dim)', fontSize: '13px', textDecoration: 'none' }}>
        ← {data.tree}
      </Link>

      {/* Header */}
      <div style={{ marginTop: '16px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <StatusBadge status={change.status} code={change.code} size="lg" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-dim)' }}>
            {change.code}
          </span>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px', maxWidth: '600px' }}>
          {change.reason}
        </p>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-dim)' }}>
          {/* Short ID + copy */}
          <span style={{ fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            id: {shortId(change.id)}
            <button
              id="copy-id"
              onClick={() => { copyToClipboard(change.id); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--ember-light)' : 'var(--text-dim)', fontSize: '11px' }}
            >
              {copied ? '✓ copied' : '⎘'}
            </button>
          </span>
          <span>author: {shortAddr(change.author)}</span>
          <span>origin: {change.origin.by}</span>
          <span>depth: {change.depth}</span>
          {change.createdAt && <span>{new Date(change.createdAt).toLocaleDateString()}</span>}
        </div>

        <div style={{ marginTop: 20 }}>
          <ReleasePanel tree={tree} change={change.id} />
        </div>

        {/* Challenge instruction */}
        {change.origin.by === 'challenge' && change.origin.instruction && (
          <div className="card" style={{ marginTop: '16px', maxWidth: '600px' }}>
            <div className="section-label" style={{ marginBottom: '6px' }}>Beat the Gate instruction</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--amber)' }}>
              "{change.origin.instruction}"
            </div>
          </div>
        )}
      </div>

      {/* Void: show guard detail */}
      {isVoid ? (
        <div style={{ marginBottom: '40px' }}>
          <div className="section-label" style={{ marginBottom: '12px' }}>Why it never ran</div>
          <div className="code-block" style={{ maxWidth: '600px' }}>
            {change.mechanical.detail || change.code}
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-dim)', marginTop: '12px' }}>
            This is a lesson, not an error. {change.code === 'bad-import' ? 'Imports outside the agent folder are not allowed.' : ''}
          </p>
        </div>
      ) : (
        <>
          {/* Score vs base, large */}
          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', marginBottom: '40px', alignItems: 'flex-start' }}>
            {/* Score */}
            {change.scoreBp !== null && (
              <div className="card">
                <div className="section-label" style={{ marginBottom: '8px' }}>Verified score</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '40px', fontWeight: 700, color: 'var(--ember-light)', lineHeight: 1 }}>
                  {formatScore(change.scoreBp)}
                </div>
                {change.vsBaseBp !== null && (
                  <div style={{
                    marginTop: '8px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '20px',
                    color: change.vsBaseBp >= 0 ? 'var(--ember-light)' : 'var(--stone-light)',
                  }}>
                    {change.vsBaseBp >= 0 ? '▲' : '▼'} {formatBp(change.vsBaseBp)} vs base
                  </div>
                )}
                {/* Model badges */}
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {change.slots.map((slot) => (
                    <span key={slot} className="badge badge-pending" style={{ fontSize: '11px' }}>
                      {slot}: {data.models ? data.models[slot] ?? 'n/a' : 'n/a'}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Claimed vs verified */}
            {change.claimed && change.effectBp !== null && (
              <div className="card">
                <div className="section-label" style={{ marginBottom: '8px' }}>Claimed vs verified</div>
                <div style={{ display: 'flex', gap: '24px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>Claimed (author)</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', color: 'var(--text-muted)' }}>
                      {formatBp(change.claimed.effectBp)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>Verified (others)</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', color: 'var(--ember-light)' }}>
                      {formatBp(change.effectBp)}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '8px' }}>
                  gap: {formatBp((change.claimed.effectBp ?? 0) - (change.effectBp ?? 0))}
                </div>
              </div>
            )}
          </div>

          {/* Claim */}
          <section style={{ marginBottom: '40px' }}>
            <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>The claim</h2>
            <div className="card-ember" style={{ maxWidth: '640px' }}>
              <blockquote style={{ margin: 0, fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.7 }}>
                "{change.claim.hypothesis}"
              </blockquote>
              <div style={{ marginTop: '12px', display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '12px' }}>
                <div><span style={{ color: 'var(--text-dim)' }}>False if: </span>{change.claim.falsifiedIf}</div>
              </div>
              <div style={{ marginTop: '10px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <span className="badge badge-pending">area: {change.claim.area}</span>
                <span className="badge badge-pending">motif: {change.claim.motif}</span>
                <span className="badge badge-pending">predicted: {formatBp(change.claim.predictedEffectBp)}</span>
              </div>
            </div>
          </section>

          {/* Dual delta */}
          {!isVoid && (
            <section style={{ marginBottom: '24px', maxWidth: '640px' }}>
              <DeltaPair vsBaseBp={change.vsBaseBp} vsParentBp={change.effectBp} />
            </section>
          )}

          {/* Noise band — one gauge per counted attestation */}
          {change.attestations.filter((a) => a.counted).length > 0 && (
            <section style={{ marginBottom: '40px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h2 style={{ fontSize: '16px', marginBottom: '6px' }}>Noise band</h2>
              {change.attestations.filter((a) => a.counted).map((att) => (
                <NoiseBandGauge
                  key={att.id}
                  effectBp={att.effectBp}
                  ciLowBp={att.ciLowBp}
                  ciHighBp={att.ciHighBp}
                  minEffectBp={minEffectBp}
                  claimLabel={att.signer.slice(0, 6)}
                  title={att.call === 'gain' ? 'This verifier measured a gain that clears the noise band' : att.call === 'loss' ? 'This verifier measured a loss' : 'This verifier measured noise, not a gain'}
                />
              ))}
              <p style={{ fontSize: '12px', color: 'var(--text-dim)', margin: 0 }}>{change.reason}</p>
            </section>
          )}

          {/* Per-run dots — one strip per counted attestation */}
          {change.attestations.filter((a) => a.counted).length > 0 && (
            <section style={{ marginBottom: '40px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h2 style={{ fontSize: '16px', marginBottom: '6px' }}>Per-run scores</h2>
              {change.attestations.filter((a) => a.counted).map((att) => (
                <RunDots
                  key={att.id}
                  parentRunsBp={att.parentRunsBp}
                  candidateRunsBp={att.candidateRunsBp}
                  title={`Runs from ${att.signer.slice(0, 6)} show the shift, not just the mean`}
                  caption={data.domain === 'code' ? 'Each dot is one run score. The tick is the median. Recorded real answers replayed through the real tests.' : 'Each dot is one run score. The tick is the median. Verifiers re-ran the training.'}
                />
              ))}
            </section>
          )}

          {/* Digest check */}
          {change.claimed && change.attestations.filter((a) => a.counted).length > 0 && (
            <section style={{ marginBottom: '40px' }}>
              <DigestCheck
                digestA={change.claimed.resultsDigest}
                digestB={change.attestations.filter((a) => a.counted)[0].resultsDigest}
                labelA="Claimed digest"
                labelB="Verified digest"
              />
            </section>
          )}

          {/* Use-case breakdown */}
          {change.perGroup.length > 0 && (
            <section style={{ marginBottom: '40px' }}>
              <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>Use-case breakdown</h2>
              <UseCaseMatrix
                rows={change.perGroup.map((g) => {
                  const groupName = data.suite.groups.find((x) => x.id === g.group)?.name ?? g.group;
                  return {
                    useCase: groupName,
                    cells: [{ change: change.claim.motif, deltaBp: g.candidateBp - g.parentBp, highlight: false }],
                  };
                })}
                changeLabels={[change.claim.motif]}
                title="Where the gain comes from"
                caption="Signed point change per use case for this change. Tinted cells are gains or losses."
              />
            </section>
          )}

          {/* Per-task table */}
          {change.perTask.length > 0 && (
            <section style={{ marginBottom: '40px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '16px', margin: 0 }}>Per-task breakdown</h2>
                <button
                  onClick={() => setSortKey((k) => k === 'diff' ? 'task' : 'diff')}
                  className="btn btn-ghost"
                  style={{ fontSize: '11px' }}
                >
                  Sort by: {sortKey === 'diff' ? 'difference ↕' : 'task name ↕'}
                </button>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Group</th>
                    <th>Parent</th>
                    <th>Candidate</th>
                    <th>Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTasks.map((t) => {
                    const diff = t.candidateBp - t.parentBp;
                    return (
                      <tr key={t.task}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{t.task}</td>
                        <td style={{ fontSize: '12px' }}>{t.group}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{formatScore(t.parentBp)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>{formatScore(t.candidateBp)}</td>
                        <td style={{
                          fontFamily: 'var(--font-mono)',
                          color: diff > 0 ? 'var(--accept)' : diff < 0 ? 'var(--reject)' : 'var(--muted)',
                        }}>
                          {diff >= 0 ? '+' : '−'}{Math.abs(diff / 100).toFixed(1)} pts
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

          {/* Attestation cards */}
          {change.attestations.length > 0 && (
            <section style={{ marginBottom: '40px' }}>
              <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>Attestations</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {change.attestations.map((att) => (
                  <div key={att.id} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                      <div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text)' }}>
                          {shortAddr(att.signer)}
                        </span>
                        {att.counted ? (
                          <span className="badge badge-accepted" style={{ marginLeft: '8px', fontSize: '10px' }}>counted</span>
                        ) : (
                          <span className="badge badge-rejected" style={{ marginLeft: '8px', fontSize: '10px' }}>
                            not counted: {att.why}
                          </span>
                        )}
                      </div>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '14px',
                        color: att.call === 'gain' ? 'var(--accept)' : att.call === 'loss' ? 'var(--reject)' : 'var(--muted)',
                        fontWeight: 600,
                      }}>
                        {att.call}: {formatBp(att.effectBp)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-dim)' }}>
                      <span>95% CI: [{formatBp(att.ciLowBp)}, {formatBp(att.ciHighBp)}]</span>
                      <span>mode: {att.mode}</span>
                      {att.spotCheck && (
                        <span>spot-check: {att.spotCheck.ok ? '✓ passed' : '✗ failed'}
                          ({att.spotCheck.tasks.join(', ')})</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Diff */}
          {change.diff && (
            <section style={{ marginBottom: '40px' }}>
              <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>Diff</h2>
              <DiffBlock diff={change.diff} />
            </section>
          )}

          {/* Actions for pending/contested */}
          {isActionable && (
            <section style={{ marginBottom: '40px' }}>
              <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>Actions</h2>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  id="run-verifier-bot1"
                  className="btn btn-ember"
                  onClick={() => runVerifier('bot-1')}
                  disabled={!!activeJob}
                >
                  Run verifier bot-1
                </button>
                <button
                  id="run-verifier-bot2"
                  className="btn btn-outline"
                  onClick={() => runVerifier('bot-2')}
                  disabled={!!activeJob}
                >
                  Run verifier bot-2
                </button>
              </div>
              {activeJob && (
                <div style={{ marginTop: '20px' }}>
                  <LiveProgress
                    jobId={activeJob}
                    onDone={() => {
                      setActiveJob(null);
                      // Refetch data to show updated status
                      fetch(`/api/export?tree=${tree}`)
                        .then((r) => r.json())
                        .then(setData);
                    }}
                  />
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default function ChangePage() {
  return (
    <Suspense fallback={
      <div className="container" style={{ paddingTop: '80px', color: 'var(--text-dim)' }}>Loading…</div>
    }>
      <ChangeContent />
    </Suspense>
  );
}
