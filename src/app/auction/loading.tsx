export default function AuctionLoading() {
  return (
    <div className="min-h-screen px-4 py-8 max-w-xl mx-auto w-full animate-pulse">
      {/* Header */}
      <div className="mb-8">
        <div className="skeleton h-3 w-16 rounded-full mb-2" />
        <div className="skeleton h-8 w-44 rounded-xl mb-1" />
        <div className="skeleton h-3 w-56 rounded-full" />
      </div>
      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <div className="skeleton h-9 w-24 rounded-full" />
        <div className="skeleton h-9 w-20 rounded-full" />
      </div>
      {/* Config card */}
      <div className="border border-white/[0.07] rounded-2xl p-6 bg-white/[0.02] space-y-4">
        <div className="skeleton h-4 w-28 rounded" />
        <div className="grid grid-cols-2 gap-3">
          <div className="skeleton h-14 rounded-xl" />
          <div className="skeleton h-14 rounded-xl" />
          <div className="skeleton h-14 rounded-xl" />
          <div className="skeleton h-14 rounded-xl" />
        </div>
        <div className="skeleton h-10 w-full rounded-xl" />
      </div>
    </div>
  )
}
