export default function LeaderboardLoading() {
  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="space-y-2">
            <div className="skeleton h-2.5 w-20 rounded-full" />
            <div className="skeleton h-16 w-56 rounded-xl" />
            <div className="skeleton h-3 w-28 rounded-full" />
          </div>
          <div className="skeleton h-9 w-20 rounded-xl" />
        </div>

        {/* My rank banner */}
        <div className="skeleton h-20 w-full rounded-2xl mb-5" />

        {/* Sort tabs */}
        <div className="skeleton h-[52px] w-full rounded-2xl mb-6" />

        {/* Podium */}
        <div className="grid grid-cols-3 gap-3 items-end px-3 mb-8">
          <div className="skeleton h-44 rounded-2xl" />
          <div className="skeleton h-52 rounded-2xl" />
          <div className="skeleton h-36 rounded-2xl" />
        </div>

        {/* Rows */}
        <div className="card-surface rounded-2xl overflow-hidden">
          <div className="skeleton h-8 w-24 mx-4 mt-3.5 rounded" />
          <div className="px-2 py-2 space-y-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/[0.05]">
                <div className="skeleton w-8 h-5 rounded shrink-0" />
                <div className="skeleton w-8 h-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3.5 w-24 rounded" />
                  <div className="skeleton h-2.5 w-12 rounded" />
                </div>
                <div className="skeleton w-10 h-4 rounded shrink-0" />
                <div className="skeleton w-12 h-4 rounded shrink-0" />
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
