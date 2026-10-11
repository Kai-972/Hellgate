'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { HellgateExport } from '@/lib/types';
import Link from 'next/link';

const STEPS = [
  {
    n: 1,
    title: 'Change and claim',
    desc: 'An author edits the agent and writes a claim: the hypothesis, what would falsify it, the area it touches, and a predicted improvement in percentage points. The guards check that the change is small, scoped to the agent folder, and not a repeat of a dead idea.',
    icon: '✏️',
  },
  {
    n: 2,
    title: 'Measure 5 times on 16 tasks',
    desc: 'The new build runs on a suite of 16 coding tasks, 5 times each. Every model request and reply is captured. The parent build is measured on the same seeds. The author gets their own preliminary number — claimed, never counted as evidence.',
    icon: '📊',
  },
  {
    n: 3,
    title: 'Two other keys re-check',
    desc: 'At least two other signing keys replay both builds on the same seeds. Only recorded real answers are used — no new model calls needed. Each verifier computes their own effect, 95% confidence interval, and cryptographically signs the result.',
    icon: '🔑',
  },
  {
    n: 4,
    title: 'The gate decides, and the graveyard remembers',
    desc: 'A pure function with no network access and no clock turns the attestations into a verdict. Every verifier must agree. If the effect is real — the whole interval above zero, at least +3 points — the change passes through the gate and becomes the new baseline. Everything else goes to the graveyard, with the numbers that killed it.',
    icon: '⚖️',
  },
];

const LIMITS = [
  {
    title: 'Distinct keys are not distinct people',
    desc: 'Two keys on the same laptop, held by the same person, satisfy the rule. We say "distinct keys", not "independent people".',
  },
  {
    title: '16 tasks are evidence, not proof',
    desc: 'The suite covers common patterns. A change that only helps on one pattern might look like noise. More tasks means more signal.',
  },
  {
    title: 'Recorded answers replayed through real tests',
    desc: 'Verifiers don\'t call the model for each replay. They play back recorded real answers through the real tests. Live spot-checks sample 3 random tasks to confirm the recording is faithful.',
  },
];

function HowItWorksContent() {
  const searchParams = useSearchParams();
  const tree = searchParams.get('tree') ?? 'coding-agent';
  const [data, setData] = useState<HellgateExport | null>(null);

  useEffect(() => {
    fetch(`/api/export?tree=${tree}`).then((r) => r.json()).then(setData);
  }, [tree]);

  return (
    <div className="container" style={{ paddingTop: '40px', paddingBottom: '80px', maxWidth: '800px' }}>
      <Link href={`/?tree=${tree}`} style={{ color: 'var(--text-dim)', fontSize: '13px', textDecoration: 'none' }}>
        ← The Gate
      </Link>
      <h1 style={{ marginTop: '16px', marginBottom: '8px', fontSize: 'clamp(24px, 4vw, 40px)' }}>
        How Hellgate works
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '48px' }}>
        Everyone says their AI agent change "feels better". Hellgate makes them prove it.
      </p>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {STEPS.map((step, i) => (
          <div key={step.n} style={{ display: 'flex', gap: '24px', position: 'relative' }}>
            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div style={{
                position: 'absolute',
                left: '24px',
                top: '56px',
                bottom: 0,
                width: '2px',
                background: 'var(--line)',
              }} />
            )}
            {/* Icon */}
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'var(--ember-dim)',
              border: '2px solid var(--ember)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              flexShrink: 0,
            }}>
              {step.icon}
            </div>
            {/* Content */}
            <div style={{ paddingBottom: '40px', flex: 1 }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--ember)',
                marginBottom: '4px',
                letterSpacing: '0.1em',
              }}>
                STEP {step.n}
              </div>
              <h2 style={{ fontSize: '20px', marginBottom: '10px', fontFamily: 'var(--font-serif)' }}>
                {step.title}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.7, margin: 0 }}>
                {step.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      <hr />

      {/* Limits */}
      <h2 style={{ fontSize: '20px', marginBottom: '24px', fontFamily: 'var(--font-serif)' }}>
        Limits, in plain words
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '48px' }}>
        {LIMITS.map((l) => (
          <div key={l.title} className="card">
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px', color: 'var(--amber)' }}>
              {l.title}
            </h3>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.6 }}>
              {l.desc}
            </p>
          </div>
        ))}
      </div>

      {/* Digest */}
      {data?.digest && (
        <div style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '12px', fontFamily: 'var(--font-serif)' }}>
            What the next proposal reads
          </h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '12px', marginBottom: '12px' }}>
            This digest summarises what has passed and what has died. It feeds the next proposal.
          </p>
          <div className="code-block">{data.digest}</div>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: '48px' }}>
        <Link href="/beat-the-gate" className="btn btn-ember" style={{ fontSize: '15px', padding: '12px 28px' }}>
          Beat the Gate →
        </Link>
      </div>
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <Suspense fallback={
      <div className="container" style={{ paddingTop: '80px', color: 'var(--text-dim)' }}>Loading…</div>
    }>
      <HowItWorksContent />
    </Suspense>
  );
}
