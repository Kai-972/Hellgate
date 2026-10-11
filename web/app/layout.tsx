import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/Nav';

export const metadata: Metadata = {
  title: 'Hellgate — Proof for AI agent changes',
  description:
    'A change only gets through the gate when verifiers with other keys re-run it and measure a real gain. Everything else goes to the graveyard.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <Nav />
        <main style={{ paddingTop: '60px', minHeight: 'calc(100vh - 60px)' }}>
          {children}
        </main>
        <footer style={{
          borderTop: '1px solid var(--border)',
          padding: '24px',
          textAlign: 'center',
          color: 'var(--text-dim)',
          fontSize: '12px',
          fontFamily: 'var(--font-mono)',
        }}>
          Hellgate · verifiers are distinct keys, not proven distinct people · 16 tasks are evidence, not proof
        </footer>
      </body>
    </html>
  );
}
