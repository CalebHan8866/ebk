import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Game History — EBK',
  description: 'Review your past EBK games, track your wins and losses, and study the drafts that made the difference.',
}

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
