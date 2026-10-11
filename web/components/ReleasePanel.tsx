'use client';
import { useState } from 'react';

interface Release {
  tree: string;
  change: string;
  scoreBp: number | null;
  vsBaseBp: number | null;
  verifiers: string[];
  claim: { hypothesis: string; area: string; motif: string };
  files: Record<string, string>;
}

const pct = (bp: number | null): string => (bp === null ? '—' : `${(bp / 100).toFixed(1)}%`);

/**
 * "Release to production": asks the gate whether a change may leave non-production. The gate answers; this page
 * only shows the answer. An accepted change on the gate path comes back with its files and the keys that vouch for it.
 * Anything else comes back as a refusal with the reason, which is the point.
 */
export default function ReleasePanel({ tree, change, autoLoad = false }: { tree: string; change?: string; autoLoad?: boolean }) {
  const [release, setRelease] = useState<Release | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);

  async function ask() {
    setBusy(true);
    setStarted(true);
    setRelease(null);
    setRefused(null);
    try {
      const res = await fetch(`/api/production?tree=${encodeURIComponent(tree)}${change ? `&change=${encodeURIComponent(change)}` : ''}`);
      const body = await res.json();
      if (res.ok) setRelease(body as Release);
      else setRefused(body.error ?? 'The gate refused.');
    } catch {
      setRefused('Could not reach the hub.');
    } finally {
      setBusy(false);
    }
  }

  if (autoLoad && !started) void ask();

  return (
    <section className="card" style={{ marginBottom: 24 }} aria-label="Release to production">
      <div className="section-label" style={{ marginBottom: 8 }}>Release to production</div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--muted)', maxWidth: 640, lineHeight: 1.55 }}>
        Only a change that other keys re-measured and the gate accepted can leave non-production. Nobody can override this: ask, and the gate answers.
      </p>
      {!autoLoad && (
        <button className="btn btn-outline" onClick={ask} disabled={busy} style={{ fontSize: 13 }}>
          {busy ? 'Asking the gate…' : 'Release this change to production'}
        </button>
      )}
      {refused && (
        <div role="alert" style={{ marginTop: 12, border: '1px solid var(--ember)', padding: '10px 14px', fontSize: 13 }}>
          <strong style={{ color: 'var(--ember)' }}>Refused by the gate.</strong> {refused}
        </div>
      )}
      {release && (
        <div style={{ marginTop: 12, border: '1px solid var(--line)', padding: '12px 14px', fontSize: 13 }}>
          <div style={{ marginBottom: 6 }}>
            <strong>Released:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{release.claim.area}/{release.claim.motif}</span> · score {pct(release.scoreBp)}
            {release.vsBaseBp !== null && <> · ▲ +{(release.vsBaseBp / 100).toFixed(1)} over the baseline</>}
          </div>
          <div style={{ color: 'var(--muted)', marginBottom: 8 }}>
            Vouched for by {release.verifiers.length} distinct verifier keys:{' '}
            <span style={{ fontFamily: 'var(--font-mono)' }}>{release.verifiers.map((v) => `${v.slice(0, 6)}…`).join(', ')}</span>
          </div>
          <div style={{ color: 'var(--muted)', marginBottom: 6 }}>The release is these files:</div>
          {Object.entries(release.files).map(([path, text]) => (
            <details key={path} style={{ marginBottom: 4 }}>
              <summary style={{ fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer' }}>{path} ({text.split('\n').length} lines)</summary>
              <pre className="code-block" style={{ maxHeight: 280, overflow: 'auto' }}>{text}</pre>
            </details>
          ))}
          <button
            className="btn btn-ghost"
            style={{ marginTop: 8, fontSize: 12 }}
            onClick={() => {
              const blob = new Blob([JSON.stringify(release, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `release-${release.tree}-${release.change.slice(0, 8)}.json`;
              a.click();
            }}
          >
            Download the release (JSON)
          </button>
        </div>
      )}
    </section>
  );
}
