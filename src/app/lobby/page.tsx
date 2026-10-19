import dynamic from 'next/dynamic'

// Dynamically import the heavy client component — defers socket, auth, and
// game-config logic from the initial JS bundle parse.
const LobbyClient = dynamic(() => import('./LobbyClient'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen py-8 px-4 animate-pulse">
      <div className="max-w-5xl mx-auto">
        {/* Header skeleton */}
        <div className="flex items-center justify-between mb-8">
          <div className="space-y-2">
            <div className="h-3 w-28 bg-white/[0.06] rounded-full" />
            <div className="h-14 w-56 bg-white/[0.06] rounded-xl" />
          </div>
          <div className="hidden sm:block w-32 h-12 bg-white/[0.04] rounded-xl" />
        </div>
        {/* Mode card skeletons */}
        <div className="space-y-3">
          <div className="h-32 bg-white/[0.04] rounded-2xl border border-white/[0.06]" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="h-28 bg-white/[0.04] rounded-2xl border border-white/[0.06]" />
            <div className="h-28 bg-white/[0.04] rounded-2xl border border-white/[0.06]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="h-24 bg-white/[0.04] rounded-2xl border border-white/[0.06]" />
            <div className="h-24 bg-white/[0.04] rounded-2xl border border-white/[0.06]" />
          </div>
        </div>
      </div>
    </div>
  ),
})

export default function LobbyPage() {
  return <LobbyClient />
}
