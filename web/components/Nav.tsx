'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function NavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tree = searchParams.get('tree') ?? '';
  const treeParam = tree ? `?tree=${tree}` : '';

  // The seed and reset buttons only make sense on the mock data; with a real hub they would mislead.
  const [mockMode, setMockMode] = useState(false);
  useEffect(() => {
    fetch('/api/demo/seed').then((r) => r.json()).then((d) => setMockMode(d?.demoMode === true)).catch(() => setMockMode(false));
  }, []);
  const [seeding, setSeeding] = useState(false);
  const [seedNotice, setSeedNotice] = useState<string | null>(null);

  async function handleSeed(action: 'seed' | 'reset') {
    setSeeding(true);
    try {
      const res = await fetch('/api/demo/seed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, tree: tree || 'coding-agent' }),
      });
      const data = await res.json();
      setSeedNotice(action === 'seed' ? `+${data.added ?? 3} nodes` : 'Reset');
      setTimeout(() => setSeedNotice(null), 2500);
      window.dispatchEvent(new Event('hellgate-refresh'));
    } catch {} finally {
      setSeeding(false);
    }
  }

  const links = [
    { href: `/${treeParam}`, label: 'The Gate', match: ['/', ''] },
    { href: `/graveyard${treeParam}`, label: 'Graveyard', match: ['/graveyard'] },
    { href: `/beat-the-gate`, label: 'Beat the Gate', match: ['/beat-the-gate'] },
    { href: `/pipeline${treeParam}`, label: 'Pipeline', match: ['/pipeline'] },
    { href: `/production${treeParam}`, label: 'Production', match: ['/production'] },
    { href: `/verifiers${treeParam}`, label: 'Verifiers', match: ['/verifiers'] },
    { href: `/how-it-works`, label: 'How it works', match: ['/how-it-works'] },
  ];

  return (
    <nav style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      height: '60px',
      background: 'var(--card)',
      borderBottom: '1px solid var(--line)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      gap: '4px',
    }}>
      <Link href={`/${treeParam}`} style={{
        fontFamily: 'var(--font-serif)',
        fontWeight: 400,
        fontSize: '26px',
        color: 'var(--ink)',
        textDecoration: 'none',
        marginRight: '24px',
        letterSpacing: '-0.01em',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '9px',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mark.svg" alt="" width={30} height={30} />
        Hellgate
      </Link>
      <div style={{ display: 'flex', gap: '2px', flex: 1 }}>
        {links.map((l) => {
          const isActive = l.match.some((m) =>
            m === '/' ? pathname === '/' : pathname.startsWith(m)
          );
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`nav-link${isActive ? ' active' : ''}`}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {mockMode && (
          <>
        <button
          id="seed-demo-btn"
          onClick={() => handleSeed('seed')}
          disabled={seeding}
          className="btn btn-outline"
          style={{
            fontSize: '11px',
            padding: '4px 10px',
            borderColor: 'var(--ember)',
            color: 'var(--ember-light)',
          }}
          title="Seed rich changes (+5.6 pt AST repair, contested verifier dispute, regression) to test graphs"
        >
          {seeding ? '…' : '🌱 Seed demo'}
        </button>
        <button
          id="reset-demo-btn"
          onClick={() => handleSeed('reset')}
          disabled={seeding}
          className="btn btn-ghost"
          style={{ fontSize: '11px', padding: '4px 8px', color: 'var(--text-dim)' }}
          title="Reset demo data back to pristine mock baseline"
        >
          ↺ Reset
        </button>
          </>
        )}
        {seedNotice && (
          <span style={{ fontSize: '11px', color: 'var(--ember)', fontFamily: 'var(--font-mono)' }}>
            {seedNotice}
          </span>
        )}
        <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          proof for ai agent changes
        </div>
      </div>
    </nav>
  );
}

export default function Nav() {
  return (
    <Suspense fallback={
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: '60px', background: 'var(--card)',
        borderBottom: '1px solid var(--line)',
      }} />
    }>
      <NavInner />
    </Suspense>
  );
}
