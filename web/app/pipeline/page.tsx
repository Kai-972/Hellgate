'use client';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface Env { id: string; motif: string; area: string; scoreBp: number | null }
interface Carried { id: string; motif: string; area: string; effectBp: number | null }
interface View {
  tree: string;
  domain: 'code' | 'ml';
  production: Env | null;
  nonProd: Env;
  inSync: boolean;
  gapBp: number;
  behindBy: number;
  carries: Carried[];
  flags: string[];
  gatePath: { id: string; motif: string; scoreBp: number | null }[];
  history: { change: string; at: string; mode: string; by: string | null; note: string | null }[];
}
interface Bench {
  fromScoreBp: number | null;
  toScoreBp: number | null;
  perGroup: { group: string; fromBp: number; toBp: number }[];
  perTask: { task: string; group: string; fromBp: number; toBp: number }[];
}

const STEPS = [
  { id: 'bots', title: 'Bots verify', text: 'Distinct bot keys re-measure the change in the sandbox. Nobody clicks.' },
  { id: 'gate', title: 'The gate decides', text: 'A fixed rule over the signed measurements. The author\'s own number never counts.' },
  { id: 'consistency', title: 'Production vs non-production', text: 'Compare what runs in production with the candidate, and look for anything that needs a person.' },
  { id: 'human', title: 'Human review', text: 'Only if something was flagged. A person approves by name, on the record.' },
  { id: 'promote', title: 'Promote', text: 'Production moves to the new version. Nothing else moves it.' },
  { id: 'benchmark', title: 'What really changed', text: 'The benchmark before and after, per use case and per task.' },
] as const;

const pct = (bp: number | null): string => (bp === null ? '—' : `${(bp / 100).toFixed(1)}%`);
const signed = (bp: number): string => `${bp >= 0 ? '▲ +' : '▼ −'}${(Math.abs(bp) / 100).toFixed(1)}`;
const label = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1).replaceAll('-', ' ');

/** The gate path as a line, with where non-production and production stand. The production marker moves when a promotion lands. */
function Chart({ view }: { view: View }) {
  const pts = view.gatePath;
  const W = 640, H = 190, padL = 44, padR = 24, padT = 22, padB = 38;
  const x = (i: number) => padL + (pts.length <= 1 ? 0 : (i * (W - padL - padR)) / (pts.length - 1));
  const y = (bp: number) => padT + (1 - bp / 10000) * (H - padT - padB);
  const idx = (id: string | undefined) => Math.max(0, pts.findIndex((p) => p.id === id));
  const prodAt = view.production ? idx(view.production.id) : 0;
  const npAt = idx(view.nonProd.id);
  const line = pts.map((p, i) => `${x(i)},${y(p.scoreBp ?? 0)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 680 }} role="img" aria-label="Benchmark score along the gate path, with production and non-production marked">
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={padL} x2={W - padR} y1={y(g * 100)} y2={y(g * 100)} stroke="var(--line)" strokeWidth={1} />
          <text x={padL - 8} y={y(g * 100) + 4} textAnchor="end" fontSize={10} fill="var(--muted)">{g}%</text>
        </g>
      ))}
      <polyline points={line} fill="none" stroke="var(--muted)" strokeWidth={1.5} />
      {pts.map((p, i) => (
        <g key={p.id}>
          <circle cx={x(i)} cy={y(p.scoreBp ?? 0)} r={4} fill="var(--ink)" />
          <text x={x(i)} y={H - 18} textAnchor="middle" fontSize={10} fill="var(--muted)">{p.motif.length > 16 ? `${p.motif.slice(0, 15)}…` : p.motif}</text>
        </g>
      ))}
      {/* non-production marker */}
      <g style={{ transform: `translate(${x(npAt)}px, ${y(pts[npAt]?.scoreBp ?? 0)}px)` }}>
        <circle r={9} fill="none" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="3 2" />
        <text y={-14} textAnchor="middle" fontSize={11} fill="var(--ink)">non-prod {pct(pts[npAt]?.scoreBp ?? null)}</text>
      </g>
      {/* production marker: it slides when a promotion lands */}
      <g style={{ transform: `translate(${x(prodAt)}px, ${y(pts[prodAt]?.scoreBp ?? 0)}px)`, transition: 'transform 900ms ease' }}>
        <circle r={7} fill="var(--ember)" />
        <text y={prodAt === npAt ? 24 : -14} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--ember)">production {pct(pts[prodAt]?.scoreBp ?? null)}</text>
      </g>
    </svg>
  );
}

function Content() {
  const tree = useSearchParams().get('tree') ?? 'coding-agent';
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [reasons, setReasons] = useState<string[] | null>(null);
  const [bench, setBench] = useState<Bench | null>(null);
  const [outcome, setOutcome] = useState<{ status: string; reason?: string; code?: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [showTasks, setShowTasks] = useState(false);
  const es = useRef<EventSource | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/pipeline?tree=${encodeURIComponent(tree)}`);
    const body = await res.json();
    if (res.ok) { setView(body as View); setError(null); } else setError(body.error ?? 'Could not load the pipeline.');
  }, [tree]);

  useEffect(() => { void load(); return () => es.current?.close(); }, [load]);

  async function run(approval?: { by: string; note: string }) {
    setRunning(true); setStage(null); setLog([]); setProgress(null); setBench(null); setOutcome(null);
    if (!approval) setReasons(null);
    const res = await fetch('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'promote', tree, approval }) });
    const body = await res.json();
    if (!res.ok) { setOutcome({ status: 'error', reason: body.error ?? 'The hub refused to start the job.' }); setRunning(false); return; }
    const source = new EventSource(`/api/jobs/${body.job ?? body.id}/events`);
    es.current = source;
    const on = (type: string, fn: (d: any) => void) => source.addEventListener(type, (e) => fn(JSON.parse((e as MessageEvent).data)));
    on('stage', (d) => setStage(d.stage));
    on('log', (d) => setLog((l) => [...l.slice(-5), d.line]));
    on('progress', (d) => setProgress({ done: d.done, of: d.of }));
    on('hitl', (d) => setReasons(d.reasons));
    on('benchmark', (d) => setBench(d));
    on('done', (d) => { setOutcome(d.result); setRunning(false); source.close(); void load(); });
    on('error', (d) => { setOutcome({ status: 'error', reason: d.message }); setRunning(false); source.close(); });
    source.onerror = () => { source.close(); setRunning(false); };
  }

  async function reset() {
    await fetch('/api/pipeline/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tree }) });
    setBench(null); setOutcome(null); setReasons(null); setStage(null); setLog([]);
    await load();
  }

  const stepIndex = STEPS.findIndex((s) => s.id === stage);
  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 90, maxWidth: 940 }}>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 42, margin: '0 0 8px' }}>Pipeline: non-production to production</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.6, maxWidth: 700, marginBottom: 24 }}>
        A change is improved and tested in <strong>non-production</strong> (the sandbox, where every candidate is measured). <strong>Production</strong> is one
        version that only moves through this pipeline. They can differ, and the difference is what a promotion decides.
      </p>

      {error && <div role="alert" className="card" style={{ marginBottom: 24 }}>{error}</div>}

      {view && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 20 }}>
            <section className="card">
              <div className="section-label">Non-production · best that passed the gate</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, margin: '8px 0 4px' }}>{view.nonProd.area}/{view.nonProd.motif}</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32 }}>{pct(view.nonProd.scoreBp)}</div>
            </section>
            <section className="card">
              <div className="section-label">Production · what is deployed</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, margin: '8px 0 4px' }}>{view.production ? `${view.production.area}/${view.production.motif}` : 'nothing'}</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, color: 'var(--ember)' }}>{pct(view.production?.scoreBp ?? null)}</div>
            </section>
            <section className="card" style={{ borderColor: view.inSync ? 'var(--line)' : 'var(--ember)' }}>
              <div className="section-label">Consistency</div>
              {view.inSync ? (
                <p style={{ margin: '10px 0 0', fontSize: 14 }}>✓ <strong>In sync.</strong> Production runs the best version that passed the gate.</p>
              ) : (
                <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.5 }}>
                  ⚠ <strong>Not consistent.</strong> Non-production is ahead by <strong>{view.behindBy} change{view.behindBy === 1 ? '' : 's'}</strong>, {signed(view.gapBp)} points.
                  {view.carries.length > 0 && <> Waiting: {view.carries.map((c) => c.motif).join(' → ')}.</>}
                </p>
              )}
            </section>
          </div>

          <section className="card" style={{ marginBottom: 20 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>Benchmark score along the gate path</div>
            <Chart view={view} />
          </section>

          <section className="card" style={{ marginBottom: 20 }}>
            <div className="section-label" style={{ marginBottom: 12 }}>The pipeline</div>
            <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
              {STEPS.map((s, i) => {
                const active = stage === s.id && running;
                const done = (stepIndex > i) || (outcome !== null && stepIndex >= i && stage !== null);
                return (
                  <li key={s.id} style={{ border: `1px solid ${active ? 'var(--ember)' : 'var(--line)'}`, padding: '10px 12px', background: done ? 'var(--ember-dim)' : 'transparent' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: active ? 'var(--ember)' : 'var(--muted)' }}>{done ? '✓' : active ? '●' : '○'} step {i + 1}</div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{s.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>{s.text}</div>
                  </li>
                );
              })}
            </ol>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 16 }}>
              <button className="btn btn-outline" onClick={() => run()} disabled={running || view.inSync} style={{ fontSize: 13 }}>
                {running ? 'Running the pipeline…' : view.inSync ? 'Nothing to promote' : 'Run the pipeline: promote the latest'}
              </button>
              <button className="btn btn-ghost" onClick={reset} disabled={running} style={{ fontSize: 12 }} title="Demo helper: put the baseline back in production">↺ Reset production to the baseline</button>
              {progress && running && <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{progress.done}/{progress.of} task runs</span>}
            </div>
            {log.length > 0 && <pre className="code-block" style={{ marginTop: 12, fontSize: 11 }}>{log.join('\n')}</pre>}
          </section>

          {reasons && outcome?.status === 'needs-human' && (
            <section className="card" style={{ marginBottom: 20, borderColor: 'var(--ember)' }} aria-label="Human review">
              <div className="section-label" style={{ color: 'var(--ember)' }}>Human in the loop: stopped for a person</div>
              <p style={{ fontSize: 14, margin: '8px 0' }}>The bots and the gate passed it, but the consistency check flagged:</p>
              <ul style={{ fontSize: 14, lineHeight: 1.55, margin: '0 0 12px', paddingLeft: 20 }}>{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input aria-label="Your name" placeholder="Your name (required)" value={name} onChange={(e) => setName(e.target.value)} style={{ padding: '6px 10px', border: '1px solid var(--line)', background: 'var(--card)', minWidth: 200 }} />
                <input aria-label="Note" placeholder="Why you are approving (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ padding: '6px 10px', border: '1px solid var(--line)', background: 'var(--card)', flex: 1, minWidth: 240 }} />
                <button className="btn btn-outline" disabled={running || name.trim().length < 2} onClick={() => run({ by: name.trim(), note: note.trim() })}>Approve and promote</button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>Your name and note are written into the production history.</p>
            </section>
          )}

          {outcome && outcome.status !== 'needs-human' && (
            <section className="card" role="status" style={{ marginBottom: 20, borderColor: outcome.status === 'promoted' ? 'var(--line)' : 'var(--ember)' }}>
              {outcome.status === 'promoted' && <strong>✓ Promoted. Production now runs the new version.</strong>}
              {outcome.status === 'refused' && <><strong style={{ color: 'var(--ember)' }}>Refused by the gate.</strong> {outcome.reason}</>}
              {outcome.status === 'in-sync' && <strong>Production already runs this change.</strong>}
              {outcome.status === 'error' && <><strong style={{ color: 'var(--ember)' }}>Pipeline error.</strong> {outcome.reason}</>}
            </section>
          )}

          {bench && (
            <section className="card" style={{ marginBottom: 20 }} aria-label="What changed in the benchmark">
              <div className="section-label" style={{ marginBottom: 8 }}>What really changed in the benchmark</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 28, marginBottom: 12 }}>
                {pct(bench.fromScoreBp)} → <span style={{ color: 'var(--ember)' }}>{pct(bench.toScoreBp)}</span>{' '}
                <span style={{ fontSize: 16 }}>{bench.fromScoreBp !== null && bench.toScoreBp !== null ? `${signed(bench.toScoreBp - bench.fromScoreBp)} points` : ''}</span>
              </div>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}><th>Use case</th><th>Before</th><th>After</th><th>Change</th></tr></thead>
                <tbody>
                  {bench.perGroup.map((g) => (
                    <tr key={g.group} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '6px 0' }}>{label(g.group)}</td><td>{pct(g.fromBp)}</td><td>{pct(g.toBp)}</td>
                      <td style={{ color: g.toBp < g.fromBp ? 'var(--ember)' : 'inherit' }}>{signed(g.toBp - g.fromBp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn btn-ghost" style={{ marginTop: 10, fontSize: 12 }} onClick={() => setShowTasks(!showTasks)}>{showTasks ? 'Hide' : 'Show'} every task</button>
              {showTasks && (
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 6 }}>
                  <tbody>
                    {bench.perTask.map((t) => (
                      <tr key={t.task} style={{ borderTop: '1px solid var(--line)' }}>
                        <td style={{ padding: '4px 0', fontFamily: 'var(--font-mono)' }}>{t.task}</td><td>{pct(t.fromBp)}</td><td>{pct(t.toBp)}</td>
                        <td style={{ color: t.toBp < t.fromBp ? 'var(--ember)' : 'inherit' }}>{signed(t.toBp - t.fromBp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

          {view.history.length > 0 && (
            <section className="card" aria-label="Production history">
              <div className="section-label" style={{ marginBottom: 8 }}>Production history</div>
              {[...view.history].reverse().map((h) => (
                <div key={h.at + h.change} style={{ fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--line)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{h.change.slice(0, 8)}</span> · {h.mode}{h.by ? ` · approved by ${h.by}` : ''}{h.note ? ` — ${h.note}` : ''}
                  <span style={{ color: 'var(--muted)' }}> · {new Date(h.at).toLocaleString()}</span>
                </div>
              ))}
            </section>
          )}
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 20, maxWidth: 700, lineHeight: 1.55 }}>
            Honest limits: this moves a pointer and releases the files (see <Link href={`/production?tree=${tree}`}>Production</Link>). It does not deploy to servers or watch live traffic;
            that part belongs to whoever runs production.
          </p>
        </>
      )}
    </div>
  );
}

export default function PipelinePage() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}
