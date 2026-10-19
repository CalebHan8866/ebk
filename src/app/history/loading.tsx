export default function HistoryLoading() {
  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-end justify-between mb-7">
          <div className="space-y-2">
            <div className="skeleton h-2.5 w-20 rounded-full" />
            <div className="skeleton h-14 w-56 rounded-xl" />
            <div className="skeleton h-3 w-24 rounded-full" />
          </div>
          <div className="skeleton h-5 w-14 rounded-full" />
        </div>

        {/* Win-rate bar */}
        <div className="skeleton h-1.5 w-full rounded-full mb-5" />

        {/* Quick stats grid */}
        <div className="grid grid-cols-4 gap-2.5 mb-7">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="skeleton h-[72px] rounded-xl" />
          ))}
        </div>

        {/* Section divider */}
        <div className="flex items-center gap-2 mb-3">
          <div className="h-px flex-1 bg-white/[0.05]" />
          <div className="skeleton h-2.5 w-24 rounded-full" />
          <div className="h-px flex-1 bg-white/[0.05]" />
        </div>

        {/* Game cards */}
        <div className="space-y-2">
          {(['border-l-green-500/30', 'border-l-red-500/25', 'border-l-green-500/30', 'border-l-red-500/25', 'border-l-yellow-500/20', 'border-l-green-500/30'] as const).map((cls, i) => (
            <div key={i} className={`skeleton h-[76px] rounded-xl border-l-[3px] ${cls}`} />
          ))}
        </div>

      </div>
    </div>
  )
}
