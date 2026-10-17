import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Practice Draft — EBK',
  description: 'Sharpen your NBA draft strategy with EBK practice mode. Solo drafts, any team mode, no opponent needed.',
}

export default function PracticeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
