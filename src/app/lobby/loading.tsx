export default function LobbyLoading() {
  return (
    <div className="min-h-screen py-8 px-4 pb-24 sm:pb-8 animate-fade-in">
      <div className="max-w-5xl mx-auto">

        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="skeleton h-2.5 w-28 rounded-full mb-2" />
            <div className="skeleton h-10 w-40 rounded-xl" />
          </div>
          <div className="hidden sm:block skeleton h-10 w-32 rounded-xl" />
        </div>

        {/* Mode selector cards */}
        <div className="space-y-3">
          {/* Hero card */}
          <div className="skeleton h-28 w-full rounded-2xl" />
          {/* Two sub-cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="skeleton h-24 rounded-2xl" />
            <div className="skeleton h-24 rounded-2xl" />
          </div>
          {/* 2x2 grid */}
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-28 rounded-2xl" />
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
