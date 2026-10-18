export default function LeaderboardLoading() {
  return (
    <div className="min-h-screen px-4 py-8 max-w-2xl mx-auto w-full animate-pulse">
      {/* Header */}
      <div className="mb-6">
        <div className="skeleton h-3 w-16 rounded-full mb-2" />
        <div className="skeleton h-8 w-40 rounded-xl mb-1" />
        <div className="skeleton h-3 w-56 rounded-full" />
      </div>
      {/* Sort tabs */}
      <div className="flex gap-2 mb-4">
        <div className="skeleton h-8 w-20 rounded-full" />
        <div className="skeleton h-8 w-20 rounded-full" />
        <div className="skeleton h-8 w-24 rounded-full" />
      </div>
      {/* Rows */}
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border border-white/[0.06] rounded-xl bg-white/[0.02]">
            <div className="skeleton h-5 w-8 rounded" />
            <div className="skeleton h-7 w-7 rounded-full shrink-0" />
            <div className="skeleton h-4 flex-1 rounded" />
            <div className="skeleton h-4 w-12 rounded" />
            <div className="skeleton h-4 w-10 rounded" />
            <div className="skeleton h-4 w-10 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
