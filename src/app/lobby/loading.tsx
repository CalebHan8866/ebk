export default function LobbyLoading() {
  return (
    <div className="min-h-screen px-4 py-8 max-w-2xl mx-auto w-full animate-pulse">
      {/* Header */}
      <div className="mb-8">
        <div className="skeleton h-3 w-12 rounded-full mb-2" />
        <div className="skeleton h-8 w-32 rounded-xl mb-1" />
        <div className="skeleton h-3 w-52 rounded-full" />
      </div>
      {/* Mode tabs */}
      <div className="flex gap-2 mb-6">
        <div className="skeleton h-9 w-24 rounded-full" />
        <div className="skeleton h-9 w-28 rounded-full" />
      </div>
      {/* Config card */}
      <div className="border border-white/[0.07] rounded-2xl p-6 bg-white/[0.02] mb-4">
        <div className="skeleton h-4 w-24 rounded mb-4" />
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="skeleton h-16 rounded-xl" />
          <div className="skeleton h-16 rounded-xl" />
          <div className="skeleton h-16 rounded-xl" />
        </div>
        <div className="skeleton h-10 w-full rounded-xl" />
      </div>
      {/* Open games */}
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border border-white/[0.06] rounded-xl bg-white/[0.02]">
            <div className="skeleton h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-4 w-28 rounded" />
              <div className="skeleton h-3 w-20 rounded" />
            </div>
            <div className="skeleton h-8 w-16 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}
