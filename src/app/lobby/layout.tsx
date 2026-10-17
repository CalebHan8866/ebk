import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Lobby — EBK',
  description: 'Find an opponent and start a live NBA draft game in EBK. Free to play, no download required.',
}

export default function LobbyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
