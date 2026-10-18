export default function HistoryLoading() {
  return (
    <div className="min-h-screen px-4 py-8 max-w-2xl mx-auto w-full animate-pulse">
      {/* Header */}
      <div className="mb-6">
        <div className="skeleton h-3 w-16 rounded-full mb-2" />
        <div className="skeleton h-8 w-36 rounded-xl mb-1" />
        <div className="skeleton h-3 w-48 rounded-full" />
      </div>
      {/* Cards */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border border-white/[0.07] rounded-2xl px-4 py-4 bg-white/[0.02]">
            <div className="flex items-center justify-between mb-2">
              <div className="skeleton h-5 w-20 rounded-full" />
              <div className="skeleton h-4 w-24 rounded" />
            </div>
            <div className="flex items-center gap-4">
              <div className="skeleton h-8 w-16 rounded-lg" />
              <div className="skeleton h-4 w-4 rounded-full" />
              <div className="skeleton h-8 w-16 rounded-lg" />
            </div>
            <div className="mt-2 flex gap-2">
              <div className="skeleton h-3 w-20 rounded-full" />
              <div className="skeleton h-3 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
