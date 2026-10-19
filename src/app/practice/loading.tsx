export default function PracticeLoading() {
  return (
    <div className="min-h-screen px-4 py-8 max-w-2xl mx-auto w-full">
      {/* Back link placeholder */}
      <div className="skeleton h-4 w-28 rounded-full mb-8" />

      {/* Header */}
      <div className="mb-8 space-y-2">
        <div className="skeleton h-3 w-14 rounded-full" />
        <div className="skeleton h-10 w-40 rounded-xl" />
        <div className="skeleton h-3 w-64 rounded-full" />
      </div>

      {/* Team mode selector — 3 cards */}
      <div className="space-y-1.5 mb-5">
        <div className="skeleton h-3 w-20 rounded-full mb-3" />
        <div className="grid grid-cols-3 gap-3">
          <div className="skeleton h-20 rounded-2xl" />
          <div className="skeleton h-20 rounded-2xl" />
          <div className="skeleton h-20 rounded-2xl" />
        </div>
      </div>

      {/* Difficulty selector — 3 pill tabs */}
      <div className="space-y-1.5 mb-6">
        <div className="skeleton h-3 w-16 rounded-full mb-3" />
        <div className="flex gap-2">
          <div className="skeleton h-9 w-24 rounded-full" />
          <div className="skeleton h-9 w-24 rounded-full" />
          <div className="skeleton h-9 w-24 rounded-full" />
        </div>
      </div>

      {/* Stat mode row */}
      <div className="flex gap-2 mb-8">
        <div className="skeleton h-8 w-28 rounded-full" />
        <div className="skeleton h-8 w-28 rounded-full" />
        <div className="skeleton h-8 w-28 rounded-full" />
        <div className="skeleton h-8 w-28 rounded-full" />
      </div>

      {/* Start button */}
      <div className="skeleton h-12 w-full rounded-xl" />
    </div>
  )
}
