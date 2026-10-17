import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'NBA Fun Facts — EBK',
  description: 'Discover wild NBA fun facts and trivia powered by EBK — Elite Ball Knowledge.',
}

export default function FunFactsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
