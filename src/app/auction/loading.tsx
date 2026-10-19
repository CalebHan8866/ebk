export default function AuctionLoading() {
  return (
    <div className="min-h-screen px-4 py-8 md:py-14 max-w-2xl mx-auto w-full">
      {/* Back link placeholder */}
      <div className="skeleton h-4 w-28 rounded-full mb-8" />

      {/* Header */}
      <div className="mb-8 space-y-2">
        <div className="skeleton h-3 w-16 rounded-full" />
        <div className="skeleton h-10 w-52 rounded-xl" />
        <div className="skeleton h-3 w-72 rounded-full" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <div className="skeleton h-9 w-24 rounded-full" />
        <div className="skeleton h-9 w-20 rounded-full" />
      </div>

      {/* Config card */}
      <div className="card-accent rounded-2xl p-6 space-y-5">
        {/* Display name input */}
        <div className="space-y-1.5">
          <div className="skeleton h-3 w-24 rounded-full" />
          <div className="skeleton h-12 w-full rounded-xl" />
        </div>
        {/* Team size options */}
        <div className="space-y-1.5">
          <div className="skeleton h-3 w-20 rounded-full" />
          <div className="grid grid-cols-3 gap-3">
            <div className="skeleton h-16 rounded-xl" />
            <div className="skeleton h-16 rounded-xl" />
            <div className="skeleton h-16 rounded-xl" />
          </div>
        </div>
        {/* Players options */}
        <div className="space-y-1.5">
          <div className="skeleton h-3 w-28 rounded-full" />
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-10 rounded-xl" />
            ))}
          </div>
        </div>
        {/* CTA */}
        <div className="skeleton h-12 w-full rounded-xl" />
      </div>
    </div>
  )
}
