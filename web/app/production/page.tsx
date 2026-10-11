'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ReleasePanel from '@/components/ReleasePanel';

function Content() {
  const tree = useSearchParams().get('tree') ?? 'coding-agent';
  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 80, maxWidth: 820 }}>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 40, margin: '0 0 8px' }}>In production</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.6, maxWidth: 620, marginBottom: 24 }}>
        This is what the gate lets out: the tip of the gate path, the latest change accepted by distinct verifier keys on an unbroken chain of
        accepted changes from the baseline. Everything else stays in non-production.
      </p>
      <ReleasePanel tree={tree} autoLoad />
    </div>
  );
}

export default function ProductionPage() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}
