export default function PracticeLoading() {
  return (
    <div className="min-h-screen px-4 py-8 max-w-2xl mx-auto w-full animate-pulse">
      {/* Header */}
      <div className="mb-8">
        <div className="skeleton h-3 w-14 rounded-full mb-2" />
        <div className="skeleton h-8 w-36 rounded-xl mb-1" />
        <div className="skeleton h-3 w-52 rounded-full" />
      </div>
      {/* Mode selector */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <div className="skeleton h-8 w-20 rounded-full" />
        <div className="skeleton h-8 w-24 rounded-full" />
        <div className="skeleton h-8 w-20 rounded-full" />
      </div>
      {/* Player card */}
      <div className="border border-white/[0.07] rounded-2xl p-6 bg-white/[0.02] mb-4 space-y-4">
        <div className="skeleton h-6 w-40 rounded" />
        <div className="grid grid-cols-3 gap-3">
          <div className="skeleton h-16 rounded-xl" />
          <div className="skeleton h-16 rounded-xl" />
          <div className="skeleton h-16 rounded-xl" />
        </div>
      </div>
      {/* Draft slots */}
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border border-white/[0.06] rounded-xl bg-white/[0.02]">
            <div className="skeleton h-5 w-5 rounded" />
            <div className="skeleton h-4 flex-1 rounded" />
            <div className="skeleton h-4 w-16 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
