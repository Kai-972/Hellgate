'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { HellgateExport, Verifier, shortAddr } from '@/lib/types';
import Link from 'next/link';

function VerifiersContent() {
  const searchParams = useSearchParams();
  const tree = searchParams.get('tree') ?? 'coding-agent';
  const [data, setData] = useState<HellgateExport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/export?tree=${tree}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, [tree]);

  if (loading) return <div className="container" style={{ paddingTop: '60px', color: 'var(--text-dim)' }}>Loading…</div>;
  if (!data) return null;

  const verifiers: Verifier[] = data.verifiers ?? [];

  return (
    <div className="container" style={{ paddingTop: '40px', paddingBottom: '80px' }}>
      <Link href={`/?tree=${tree}`} style={{ color: 'var(--text-dim)', fontSize: '13px', textDecoration: 'none' }}>
        ← {data.tree}
      </Link>
      <h1 style={{ marginTop: '16px', marginBottom: '8px', fontSize: 'clamp(22px, 4vw, 36px)' }}>Verifiers</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '32px' }}>
        Each row is a distinct signing key. Distinct keys are not proven distinct people.
      </p>

      {verifiers.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: '14px' }}>No verifier data in this export.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Address</th>
                <th>Label</th>
                <th>Attestations</th>
                <th>Counted</th>
                <th>Flags</th>
                <th>Stellar</th>
              </tr>
            </thead>
            <tbody>
              {verifiers.map((v) => (
                <tr key={v.address}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                    {shortAddr(v.address)}
                  </td>
                  <td style={{ color: 'var(--text)' }}>{v.label ?? '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{v.attestations}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--ember-light)' }}>{v.counted}</td>
                  <td>
                    {v.flags.length > 0 ? (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {v.flags.map((f) => (
                          <span key={f} className="badge badge-contested" style={{ fontSize: '10px' }}>{f}</span>
                        ))}
                      </div>
                    ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                  </td>
                  <td>
                    {v.stellarLink ? (
                      <a
                        href={v.stellarLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--ember-light)', fontSize: '12px' }}
                      >
                        Explorer →
                      </a>
                    ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function VerifiersPage() {
  return (
    <Suspense fallback={
      <div className="container" style={{ paddingTop: '80px', color: 'var(--text-dim)' }}>Loading…</div>
    }>
      <VerifiersContent />
    </Suspense>
  );
}
