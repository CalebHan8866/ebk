export default function FunFactsLoading() {
  return (
    <div className="min-h-screen px-4 py-8 max-w-3xl mx-auto w-full animate-pulse">
      {/* Header */}
      <div className="mb-6">
        <div className="skeleton h-3 w-16 rounded-full mb-2" />
        <div className="skeleton h-8 w-36 rounded-xl mb-1" />
        <div className="skeleton h-3 w-64 rounded-full" />
      </div>
      {/* Search + filters */}
      <div className="flex gap-2 mb-4">
        <div className="skeleton h-10 flex-1 rounded-xl" />
        <div className="skeleton h-10 w-24 rounded-xl" />
      </div>
      {/* Player cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border border-white/[0.07] rounded-2xl p-4 bg-white/[0.02]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="skeleton h-5 w-5 rounded-full" />
                <div className="skeleton h-5 w-32 rounded" />
              </div>
              <div className="skeleton h-5 w-12 rounded-full" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="skeleton h-10 rounded-lg" />
              <div className="skeleton h-10 rounded-lg" />
              <div className="skeleton h-10 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
