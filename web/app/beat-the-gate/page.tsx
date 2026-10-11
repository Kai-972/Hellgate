'use client';
import { useState, useEffect, Suspense } from 'react';
import { DoneEvent } from '@/lib/types';
import LiveProgress from '@/components/LiveProgress';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const EXAMPLES = [
  'Explain your plan in one comment line before the code.',
  'Before writing code, re-read the function signature and print it as a comment.',
  'After solving the problem, check your answer once more and fix any obvious bugs.',
];

function BeatTheGateContent() {
  const searchParams = useSearchParams();
  const tree = searchParams.get('tree') ?? 'coding-agent';

  const [instruction, setInstruction] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verdict, setVerdict] = useState<DoneEvent | null>(null);
  const [attached, setAttached] = useState(false);
  const MAX = 280;

  // On mount: check if there's a current job to attach to
  useEffect(() => {
    fetch('/api/jobs/current').then((r) => {
      if (r.status === 200) {
        r.json().then((d) => {
          if (d?.id) {
            setJobId(d.id);
            setAttached(true);
          }
        });
      }
    });
  }, []);

  async function submit() {
    if (!instruction.trim() || instruction.length > MAX) return;
    setSubmitting(true);
    setVerdict(null);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'challenge', instruction: instruction.trim(), tree }),
      });
      const { id } = await res.json();
      setJobId(id);
      setAttached(false);
    } finally {
      setSubmitting(false);
    }
  }

  function handleDone(e: DoneEvent) {
    setVerdict(e);
  }

  return (
    <div className="container" style={{ paddingTop: '40px', paddingBottom: '80px', maxWidth: '720px' }}>
      <Link href={`/?tree=${tree}`} style={{ color: 'var(--text-dim)', fontSize: '13px', textDecoration: 'none' }}>
        ← The Gate
      </Link>

      <h1 style={{ marginTop: '16px', marginBottom: '8px', fontSize: 'clamp(24px, 4vw, 40px)' }}>
        Beat the Gate
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '32px', lineHeight: 1.6, maxWidth: '520px' }}>
        Type one instruction for the agent. We'll measure it for real against the current best version.
        Two distinct verifier keys re-check it. Most ideas die here.
      </p>

      {attached && (
        <div style={{
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '20px',
          fontSize: '13px',
          color: 'var(--amber)',
        }}>
          Someone else's run is in progress — attaching to it now.
        </div>
      )}

      {!jobId && (
        <div style={{ marginBottom: '32px' }}>
          {/* Example chips */}
          <div style={{ marginBottom: '12px' }}>
            <span className="section-label" style={{ display: 'block', marginBottom: '8px' }}>Examples</span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  id={`example-chip-${i}`}
                  onClick={() => setInstruction(ex)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-3)',
                    color: 'var(--text-muted)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'opacity 150ms',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--ember)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--text)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                  }}
                >
                  {ex.slice(0, 50)}{ex.length > 50 ? '…' : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Textarea */}
          <div style={{ position: 'relative' }}>
            <textarea
              id="beat-instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Type one instruction for the agent…"
              maxLength={MAX}
              rows={4}
              style={{
                width: '100%',
                background: 'var(--bg-2)',
                border: '1px solid',
                borderColor: instruction.length > MAX * 0.9 ? 'var(--amber)' : 'var(--border)',
                borderRadius: '10px',
                padding: '14px 16px',
                color: 'var(--text)',
                fontSize: '14px',
                lineHeight: 1.6,
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'var(--font-sans)',
                transition: 'opacity 150ms',
              }}
              onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = 'var(--ember)'; }}
              onBlur={(e) => {
                (e.target as HTMLTextAreaElement).style.borderColor =
                  instruction.length > MAX * 0.9 ? 'var(--amber)' : 'var(--border)';
              }}
            />
            <div style={{
              position: 'absolute',
              bottom: '10px',
              right: '14px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: instruction.length > MAX * 0.9 ? 'var(--amber)' : 'var(--text-dim)',
            }}>
              {instruction.length} / {MAX}
            </div>
          </div>

          <button
            id="submit-beat"
            onClick={submit}
            disabled={submitting || !instruction.trim() || instruction.length > MAX}
            className="btn btn-ember"
            style={{ marginTop: '12px', fontSize: '15px', padding: '12px 28px' }}
          >
            {submitting ? 'Submitting…' : 'Measure it for real →'}
          </button>
        </div>
      )}

      {/* Live progress panel */}
      {jobId && (
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>Live progress</h2>
          <LiveProgress jobId={jobId} onDone={handleDone} />
        </div>
      )}

      {/* Verdict card */}
      {verdict && (
        <div
          className={verdict.status === 'accepted' ? 'card-ember' : 'card'}
          style={{ animation: 'fadeIn 0.5s ease' }}
        >
          <h2 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '22px',
            marginBottom: '8px',
            color: verdict.status === 'accepted' ? 'var(--ember-light)' : 'var(--stone-light)',
          }}>
            {verdict.status === 'accepted' ? '🔥 Through the gate!' : 'Graveyard'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>
            {verdict.reason}
          </p>
          <Link
            href={`/change/${verdict.changeId}?tree=${tree}`}
            className="btn btn-outline"
          >
            View change page →
          </Link>
          <button
            onClick={() => { setJobId(null); setVerdict(null); setInstruction(''); }}
            className="btn btn-ghost"
            style={{ marginLeft: '8px' }}
          >
            Try another
          </button>
        </div>
      )}
    </div>
  );
}

export default function BeatTheGatePage() {
  return (
    <Suspense fallback={
      <div className="container" style={{ paddingTop: '80px', color: 'var(--text-dim)' }}>Loading…</div>
    }>
      <BeatTheGateContent />
    </Suspense>
  );
}
