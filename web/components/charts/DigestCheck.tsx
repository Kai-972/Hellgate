'use client';
import { useId } from 'react';
import { chartTokens, chartFonts } from '@/lib/chartTokens';

interface DigestCheckProps {
  digestA: string;
  digestB: string;
  labelA?: string;
  labelB?: string;
  title?: string;
}

/** F. Digest equality check — differing chars underlined on mismatch. */
export default function DigestCheck({
  digestA,
  digestB,
  labelA = 'Claimed',
  labelB = 'Verified',
  title = 'Digest equality check',
}: DigestCheckProps) {
  const titleId = useId();
  const match = digestA === digestB;
  const short = (s: string) => (s.length > 24 ? `${s.slice(0, 12)}…${s.slice(-8)}` : s);

  const renderMismatch = (a: string, b: string) => {
    const n = Math.min(a.length, b.length, 24);
    return (
      <span style={{ fontFamily: chartFonts.mono, fontSize: 11 }}>
        {Array.from({ length: n }).map((_, i) =>
          a[i] === b[i] ? (
            <span key={i} style={{ color: chartTokens.ink }}>{a[i]}</span>
          ) : (
            <span key={i} style={{ color: chartTokens.contest, textDecoration: 'underline', textUnderlineOffset: 3 }}>{a[i]}</span>
          )
        )}
        <span style={{ color: chartTokens.muted }}>…{a.slice(-4)}</span>
      </span>
    );
  };

  return (
    <figure style={{ margin: 0, background: chartTokens.card, border: `1px solid ${chartTokens.line}`, borderRadius: 2, padding: '16px' }}>
      <h3 id={titleId} style={{ fontFamily: chartFonts.serif, fontSize: 16, color: chartTokens.ink, margin: '0 0 10px', fontWeight: 500 }}>{title}</h3>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }} role="img" aria-label={match ? 'Digests identical' : 'Digests differ, results mismatch'}>
        <div style={{ flex: '1 1 200px' }}>
          <div style={{ fontFamily: chartFonts.mono, fontSize: 11, color: chartTokens.muted, marginBottom: 4 }}>{labelA}</div>
          {match ? (
            <div style={{ fontFamily: chartFonts.mono, fontSize: 11, color: chartTokens.ink }}>{short(digestA)}</div>
          ) : (
            renderMismatch(digestA, digestB)
          )}
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <div style={{ fontFamily: chartFonts.mono, fontSize: 11, color: chartTokens.muted, marginBottom: 4 }}>{labelB}</div>
          {match ? (
            <div style={{ fontFamily: chartFonts.mono, fontSize: 11, color: chartTokens.ink }}>{short(digestB)}</div>
          ) : (
            renderMismatch(digestB, digestA)
          )}
        </div>
      </div>
      <div style={{ marginTop: 10, fontFamily: chartFonts.mono, fontSize: 11, color: match ? chartTokens.accept : chartTokens.contest }}>
        {match ? '✓ Identical digest' : '⚠ RESULTS_MISMATCH'}
      </div>
      <table style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        <caption>Digest check</caption>
        <tbody>
          <tr><td>{labelA}</td><td>{digestA}</td></tr>
          <tr><td>{labelB}</td><td>{digestB}</td></tr>
          <tr><td>match</td><td>{String(match)}</td></tr>
        </tbody>
      </table>
    </figure>
  );
}
