'use client';
import { StatusMark } from '@/components/charts';
import type { ChangeStatus } from '@/lib/types';

const ABOUT = {
  code: {
    title: 'code: improving an AI that writes code',
    body: 'The thing being improved is a small agent that asks an AI model (Gemini) to write a JavaScript function from a description. 16 tasks, 182 hidden test cases. The score is the share of cases the written function passes. A change edits the agent: what it tells the model, what it shows it, a second model that reviews the draft.',
  },
  ml: {
    title: 'ml: improving a learning algorithm',
    body: 'The thing being improved is a tiny neural network that learns from example data. There is no AI model behind it. 12 tasks, 2,400 hidden test points. The score is the share predicted correctly. A change edits the learner: how it updates itself, how inputs are scaled, the learning-rate schedule.',
  },
} as const;

const LEGEND: { status: ChangeStatus; name: string; text: string }[] = [
  { status: 'accepted', name: 'Through the gate', text: 'other keys re-measured a real gain' },
  { status: 'rejected', name: 'Graveyard', text: 'no effect or worse, kept with its numbers' },
  { status: 'pending', name: 'Waiting', text: 'needs more verifiers' },
  { status: 'contested', name: 'Contested', text: 'verifiers disagree or one did not really run it' },
  { status: 'void', name: 'Void', text: 'stopped before it ran, with the reason' },
];

export default function Explainer({ domain }: { domain: 'code' | 'ml' }) {
  const about = ABOUT[domain];
  return (
    <section className="card" style={{ marginBottom: 32 }} aria-label="What you are looking at">
      <div className="section-label" style={{ marginBottom: 10 }}>What you are looking at</div>
      <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.6, maxWidth: 760 }}>
        <strong>Hellgate checks claims that an AI got better.</strong> Every node below is a <em>change</em> someone tried. A
        change counts only when <em>other people&apos;s keys re-run it</em> on hidden tests and measure a real gain. The author&apos;s own
        number never counts. Failed changes are kept, with their numbers, so nobody repeats them.
      </p>
      <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.6, maxWidth: 760 }}>
        <strong>{about.title}.</strong> {about.body} Scores are comparable only inside one tree.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 22px', fontSize: 12, color: 'var(--muted)' }}>
        {LEGEND.map((l) => (
          <span key={l.status} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <StatusMark status={l.status} size={12} label={l.name} />
            <strong style={{ color: 'var(--ink)' }}>{l.name}</strong> {l.text}
          </span>
        ))}
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--muted)' }}>
        ▲ and ▼ mean points above or below the version the tree started from. A result whose range crosses zero is noise, not progress.
        <a href="https://github.com/Kai-972/Hellgate/blob/main/docs/GUIDE.md" style={{ marginLeft: 6 }}>Read the full guide</a>
      </p>
    </section>
  );
}
