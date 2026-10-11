'use client';
import { useEffect, useRef, useState } from 'react';
import { JobEvent, DoneEvent } from '@/lib/types';
import { shortAddr } from '@/lib/types';

const STAGES = ['guards', 'typecheck', 'record', 'verify', 'spot-check', 'sign', 'push'];

interface TaskCell {
  task: string;
  run: number;
  passedCases: number;
  cases: number;
}

interface LiveProgressProps {
  jobId: string;
  onDone?: (e: DoneEvent) => void;
}

export default function LiveProgress({ jobId, onDone }: LiveProgressProps) {
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [taskCells, setTaskCells] = useState<Map<string, TaskCell>>(new Map());
  const [logs, setLogs] = useState<string[]>([]);
  const [done, setDone] = useState<DoneEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attestationCards, setAttestationCards] = useState<string[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/jobs/${jobId}/events`);
    esRef.current = es;

    const handle = (type: string, e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const event: JobEvent = { type: type as JobEvent['type'], ...data };

        if (event.type === 'stage') {
          setCurrentStage(event.stage);
        } else if (event.type === 'progress') {
          setProgress({ done: event.done, of: event.of });
          if (event.tasks) {
            setTaskCells((prev) => {
              const next = new Map(prev);
              event.tasks!.forEach((t) => {
                next.set(`${t.task}-${t.run}`, t);
              });
              return next;
            });
          }
          // Also handle single task from mock
          const pEvent = data as { task?: string; run?: number; passedCases?: number; cases?: number; done: number; of: number };
          if (pEvent.task) {
            setTaskCells((prev) => {
              const next = new Map(prev);
              next.set(`${pEvent.task}-${pEvent.run}`, {
                task: pEvent.task!,
                run: pEvent.run ?? 0,
                passedCases: pEvent.passedCases ?? 0,
                cases: pEvent.cases ?? 10,
              });
              return next;
            });
          }
        } else if (event.type === 'attestation') {
          setAttestationCards((prev) => [...prev, shortAddr(event.attestation.signer)]);
        } else if (event.type === 'done') {
          const resultObj = (data as { result?: { change?: string; status?: string; code?: string; reason?: string; effectBp?: number | null } }).result;
          const doneEvt: DoneEvent = {
            type: 'done',
            status: ((resultObj?.status ?? data.status ?? 'rejected') as 'accepted' | 'rejected' | 'pending' | 'contested' | 'void'),
            code: resultObj?.code ?? data.code ?? 'NO_EFFECT',
            reason: resultObj?.reason ?? data.reason ?? '',
            changeId: resultObj?.change ?? data.changeId ?? data.change ?? '',
            effectBp: resultObj?.effectBp ?? data.effectBp ?? null,
          };
          setDone(doneEvt);
          es.close();
          onDone?.(doneEvt);
        } else if (event.type === 'error') {
          setError(event.message);
          es.close();
        } else if (event.type === 'log') {
          const logEvent = data as { line: string };
          setLogs((prev) => [...prev.slice(-4), logEvent.line]);
        }
      } catch {}
    };

    STAGES.forEach((s) => {
      es.addEventListener(s, (e) => handle('stage', e as MessageEvent));
    });
    ['stage', 'progress', 'attestation', 'change', 'done', 'error', 'log'].forEach((t) => {
      es.addEventListener(t, (e) => handle(t, e as MessageEvent));
    });

    es.onerror = () => {
      setError('Connection lost');
      es.close();
    };

    return () => es.close();
  }, [jobId]);

  const allCells = Array.from(taskCells.values());
  const uniqueTasks = [...new Set(allCells.map((c) => c.task))];

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Stage stepper */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {STAGES.map((s) => {
          const isActive = currentStage === s;
          const stageIdx = STAGES.indexOf(s);
          const currentIdx = STAGES.indexOf(currentStage ?? '');
          const isDone = currentIdx > stageIdx || !!done;
          return (
            <div
              key={s}
              style={{
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                background: isDone
                  ? 'var(--ember-dim)'
                  : isActive
                  ? 'var(--ember)'
                  : 'var(--bg-3)',
                color: isDone
                  ? 'var(--ember)'
                  : isActive
                  ? 'var(--card)'
                  : 'var(--text-dim)',
                fontWeight: isActive ? 700 : 400,
                transition: 'opacity 150ms',
              }}
            >
              {isDone ? '✓ ' : ''}{s}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      {progress && (
        <div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: '11px', color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)', marginBottom: '6px',
          }}>
            <span>{progress.done} / {progress.of} tasks</span>
            <span>{Math.round((progress.done / progress.of) * 100)}%</span>
          </div>
          <div style={{
            height: '6px', background: 'var(--bg-3)',
            borderRadius: '3px', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${(progress.done / progress.of) * 100}%`,
              background: 'var(--ember)',
              borderRadius: '3px',
              transition: 'opacity 150ms',
            }} />
          </div>
        </div>
      )}

      {/* Task grid */}
      {uniqueTasks.length > 0 && (
        <div>
          <div className="section-label" style={{ marginBottom: '10px' }}>Task grid</div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
            gap: '4px',
          }}>
            {uniqueTasks.map((task) => {
              const runs = allCells.filter((c) => c.task === task);
              const avgPassed = runs.reduce((s, c) => s + c.passedCases, 0) /
                Math.max(runs.reduce((s, c) => s + c.cases, 0), 1);
              const pct = avgPassed;
              return (
                <div
                  key={task}
                  style={{
                    background: pct > 0.5 ? 'var(--accept-tint)' : 'var(--band)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    padding: '4px 6px',
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                  }}
                >
                  {task}
                  <div style={{ color: pct > 0.5 ? 'var(--accept)' : 'var(--muted)', fontWeight: 600 }}>
                    {(pct * 100).toFixed(0)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Log tail */}
      {logs.length > 0 && (
        <div className="code-block" style={{ fontSize: '11px', maxHeight: '80px', overflow: 'hidden' }}>
          {logs.map((l, i) => (
            <div key={i} style={{ opacity: 0.7 + (i / logs.length) * 0.3 }}>{l}</div>
          ))}
        </div>
      )}

      {/* Attestation cards */}
      {attestationCards.map((addr, i) => (
        <div key={i} className="card" style={{
          borderColor: 'var(--border-ember)',
          background: 'var(--ember-dim)',
          animation: 'fadeIn 0.4s ease',
        }}>
          <div style={{ fontSize: '12px', color: 'var(--ember-light)', fontFamily: 'var(--font-mono)' }}>
            ✓ Attestation from {addr}
          </div>
        </div>
      ))}

      {/* Error */}
      {error && (
        <div style={{
          background: 'var(--reject-tint)',
          border: '1px solid var(--reject)',
          borderRadius: '2px',
          padding: '12px 16px',
          color: 'var(--reject)',
          fontSize: '13px',
        }}>
          {error}
        </div>
      )}

      {/* Done verdict */}
      {done && (
        <div className="card-ember" style={{ animation: 'fadeIn 0.5s ease' }}>
          <div style={{ fontSize: '13px', color: 'var(--ember-light)', fontWeight: 600, marginBottom: '4px' }}>
            {done.status === 'accepted' ? '🔥 Through the gate' : `Verdict: ${done.status}`}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{done.reason}</div>
        </div>
      )}
    </div>
  );
}
