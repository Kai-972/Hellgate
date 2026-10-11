'use client';
import { useState } from 'react';
import { checkEnvelope, type Envelope } from '@/lib/verifyRecord';

interface Row {
  id: string;
  kind: string;
  signer: string | null;
  idOk: boolean;
  sigOk: boolean | null;
  reason: string | null;
}

/**
 * "Check the evidence yourself": downloads the raw records behind a change and re-checks every hash and signature
 * with the browser's own crypto, so nothing here depends on trusting this server. "Tamper" changes one number in
 * one attestation, in memory, and checks again: the same code that said "valid" now says what is wrong.
 */
export default function EvidenceCheck({ tree, changeId, attestationIds }: { tree: string; changeId: string; attestationIds: string[] }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [tampered, setTampered] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(tamper: boolean) {
    setBusy(true);
    setError(null);
    setTampered(null);
    try {
      const out: Row[] = [];
      for (const [i, id] of [changeId, ...attestationIds].entries()) {
        const res = await fetch(`/api/records/${id}?tree=${encodeURIComponent(tree)}`);
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `could not fetch ${id.slice(0, 8)}`);
        const envelope = (await res.json()) as Envelope;
        let altered = '';
        if (tamper && i === 1) {
          // one attestation, one number: +0.01 points on the effect it reports
          const body = envelope.body as { effectBp?: number };
          if (typeof body.effectBp === 'number') {
            body.effectBp += 1;
            altered = `effect ${(body.effectBp - 1) / 100} → ${body.effectBp / 100} points`;
            setTampered(`${id.slice(0, 8)}: ${altered}`);
          }
        }
        const checked = await checkEnvelope(envelope, id);
        out.push({ id, kind: envelope.body.type, signer: envelope.body.signer ?? null, idOk: checked.idOk, sigOk: checked.sigOk, reason: checked.reason });
      }
      setRows(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not check');
    } finally {
      setBusy(false);
    }
  }

  const bad = rows?.filter((r) => !r.idOk || r.sigOk === false).length ?? 0;
  return (
    <section className="card" style={{ marginBottom: 24 }} aria-label="Check the evidence yourself">
      <div className="section-label" style={{ marginBottom: 8 }}>Don&apos;t trust this page: check the evidence yourself</div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--muted)', maxWidth: 680, lineHeight: 1.55 }}>
        Every record behind this verdict is a file named by the hash of its contents and signed by the verifier&apos;s key. This button downloads them and
        re-checks every hash and signature <strong>in your browser</strong>, with code that shares nothing with our server.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-outline" onClick={() => run(false)} disabled={busy} style={{ fontSize: 13 }}>{busy ? 'Checking…' : 'Check every record'}</button>
        <button className="btn btn-ghost" onClick={() => run(true)} disabled={busy || attestationIds.length === 0} style={{ fontSize: 13 }}>Now tamper with one number and check again</button>
      </div>
      {error && <div role="alert" style={{ marginTop: 10, fontSize: 13, color: 'var(--ember)' }}>{error}</div>}
      {tampered && <p style={{ margin: '12px 0 0', fontSize: 13 }}>Changed in memory: <span style={{ fontFamily: 'var(--font-mono)' }}>{tampered}</span>. The server&apos;s copy is untouched.</p>}
      {rows && (
        <>
          <div role="status" style={{ marginTop: 12, fontWeight: 600, color: bad === 0 ? 'inherit' : 'var(--ember)' }}>
            {bad === 0 ? `✓ ${rows.length} records: every hash matches and every signature is valid.` : `✗ ${bad} of ${rows.length} records failed. The edited evidence does not check out.`}
          </div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 8 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}><th>Record</th><th>Type</th><th>Signed by</th><th>Hash = id</th><th>Signature</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '4px 0', fontFamily: 'var(--font-mono)' }}>{r.id.slice(0, 8)}</td>
                  <td>{r.kind}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{r.signer ? `${r.signer.slice(0, 6)}…` : '—'}</td>
                  <td style={{ color: r.idOk ? 'inherit' : 'var(--ember)' }}>{r.idOk ? '✓' : '✗ differs'}</td>
                  <td style={{ color: r.sigOk === false ? 'var(--ember)' : 'inherit' }}>{r.sigOk === null ? '—' : r.sigOk ? '✓ valid' : '✗ invalid'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
