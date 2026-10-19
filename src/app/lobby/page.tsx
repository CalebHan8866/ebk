import dynamic from 'next/dynamic'

// Dynamically import the heavy client component — defers socket, auth, and
// game-config logic from the initial JS bundle parse.
const LobbyClient = dynamic(() => import('./LobbyClient'), { ssr: false })

export default function LobbyPage() {
  return <LobbyClient />
}
