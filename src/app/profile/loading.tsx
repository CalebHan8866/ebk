export default function ProfileLoading() {
  return (
    <div className="min-h-screen py-10 px-4 animate-fade-in">
      <div className="max-w-3xl mx-auto">

        {/* Page header */}
        <div className="flex items-start justify-between mb-6">
          <div className="space-y-2">
            <div className="skeleton h-2.5 w-20 rounded-full" />
            <div className="skeleton h-12 w-52 rounded-xl" />
            <div className="skeleton h-2.5 w-28 rounded-full" />
          </div>
          <div className="skeleton h-9 w-20 rounded-xl" />
        </div>

        {/* Tab strip */}
        <div className="skeleton h-[52px] w-full rounded-2xl mb-7" />

        {/* Hero card */}
        <div className="card-surface p-5 sm:p-7 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <div className="skeleton w-20 h-20 sm:w-24 sm:h-24 rounded-full shrink-0" />
            <div className="flex-1 space-y-3">
              <div className="skeleton h-8 w-44 rounded-xl" />
              <div className="skeleton h-3 w-32 rounded-full" />
              <div className="skeleton h-6 w-20 rounded-full" />
            </div>
            <div className="hidden sm:flex flex-col items-end gap-3 shrink-0">
              <div className="skeleton h-12 w-20 rounded-xl" />
              <div className="skeleton h-3 w-14 rounded-full" />
            </div>
          </div>
        </div>

        {/* Stats card */}
        <div className="card-stat p-6 mb-4">
          <div className="skeleton h-2.5 w-32 rounded-full mb-5" />
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="skeleton rounded-2xl h-24" />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 mb-5">
            {[0, 1, 2].map(i => (
              <div key={i} className="skeleton rounded-xl h-16" />
            ))}
          </div>
          <div className="skeleton h-2 w-full rounded-full" />
        </div>

        {/* Link card */}
        <div className="card-surface p-4 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="skeleton w-10 h-10 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-5 w-28 rounded" />
              <div className="skeleton h-3 w-36 rounded-full" />
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
