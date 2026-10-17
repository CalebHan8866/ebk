import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Leaderboard — EBK',
  description: 'See the top EBK players ranked by wins. Climb the leaderboard in the free head-to-head NBA draft game.',
}

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
