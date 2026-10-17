import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Higher or Lower — EBK',
  description: 'Can you guess which NBA player had the higher career stats? Play the EBK Higher or Lower game and earn badges.',
}

export default function HigherLowerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
