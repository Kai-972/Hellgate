'use client';
import { Tree } from '@/lib/types';
import { useRouter, useSearchParams } from 'next/navigation';

interface TreeSwitcherProps {
  trees: Tree[];
}

export default function TreeSwitcher({ trees }: TreeSwitcherProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTree = searchParams.get('tree') ?? trees[0]?.name ?? 'coding-agent';

  function select(name: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tree', name);
    router.push(`/?${params.toString()}`);
  }

  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
        Tree
      </span>
      <div className="seg" role="group" aria-label="Select tree">
        {trees.map((t) => (
          <button
            key={t.name}
            id={`tree-switcher-${t.name}`}
            onClick={() => select(t.name)}
            aria-pressed={currentTree === t.name}
          >
            {t.name} · {t.domain}
          </button>
        ))}
      </div>
    </div>
  );
}
