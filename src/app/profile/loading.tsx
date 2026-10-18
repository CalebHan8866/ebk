export default function ProfileLoading() {
  return (
    <div className="min-h-screen px-4 py-8 max-w-2xl mx-auto w-full animate-pulse">
      {/* Avatar + name */}
      <div className="flex items-center gap-4 mb-8">
        <div className="skeleton w-16 h-16 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-6 w-32 rounded-xl" />
          <div className="skeleton h-3 w-24 rounded-full" />
        </div>
      </div>
      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-8 w-20 rounded-full shrink-0" />
        ))}
      </div>
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-white/[0.07] rounded-2xl p-4 bg-white/[0.02]">
            <div className="skeleton h-7 w-12 rounded-lg mb-1" />
            <div className="skeleton h-3 w-16 rounded-full" />
          </div>
        ))}
      </div>
      {/* Content block */}
      <div className="border border-white/[0.07] rounded-2xl p-4 bg-white/[0.02] space-y-3">
        <div className="skeleton h-4 w-32 rounded" />
        <div className="skeleton h-3 w-full rounded-full" />
        <div className="skeleton h-3 w-4/5 rounded-full" />
        <div className="skeleton h-3 w-3/5 rounded-full" />
      </div>
    </div>
  )
}
