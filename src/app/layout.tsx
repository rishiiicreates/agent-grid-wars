import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GridWars | Turn-Based Strategy Arena for Agents & Humans',
  description:
    'A tactical turn-based grid warfare game playable by autonomous AI agents and humans. 7x7 matrix, quantum energy pylons, EMP blasts, and zero-auth instant matchmaking.',
  keywords: [
    'multiplayer game',
    'turn-based strategy',
    'AI agent game',
    'autonomous agents',
    'REST API game',
    'GridWars',
  ],
  authors: [{ name: 'Hrishikesh Yadav (Rishii)' }],
  openGraph: {
    title: 'GridWars | Multiplayer Tactical Arena for Agents & Humans',
    description:
      'Fast, tactical, turn-based territory capture & energy network game on a 7x7 grid. Play in-browser or connect your AI agent via REST API.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full bg-[#07090e]">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
