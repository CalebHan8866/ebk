export default function HigherLowerLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 gap-8 animate-pulse">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="skeleton h-10 w-48 rounded-xl mx-auto" />
        <div className="skeleton h-3 w-64 rounded-full mx-auto" />
      </div>
      {/* Player cards */}
      <div className="w-full max-w-lg flex gap-4 items-center">
        <div className="flex-1 border border-white/[0.07] rounded-2xl p-6 bg-white/[0.02] space-y-3">
          <div className="skeleton h-5 w-32 rounded mx-auto" />
          <div className="skeleton h-10 w-20 rounded-xl mx-auto" />
          <div className="skeleton h-3 w-24 rounded-full mx-auto" />
        </div>
        <div className="skeleton h-8 w-8 rounded-full shrink-0" />
        <div className="flex-1 border border-white/[0.07] rounded-2xl p-6 bg-white/[0.02] space-y-3">
          <div className="skeleton h-5 w-32 rounded mx-auto" />
          <div className="skeleton h-10 w-20 rounded-xl mx-auto" />
          <div className="skeleton h-3 w-24 rounded-full mx-auto" />
        </div>
      </div>
      {/* Action buttons */}
      <div className="flex gap-3">
        <div className="skeleton h-11 w-28 rounded-xl" />
        <div className="skeleton h-11 w-28 rounded-xl" />
      </div>
    </div>
  )
}
