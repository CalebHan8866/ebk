'use client'
export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-display text-4xl text-orange-500">Oops</p>
      <p className="text-gray-400 text-sm">Failed to load salary data.</p>
      <button onClick={reset} className="btn-secondary text-sm px-6 py-2">Try Again</button>
    </div>
  )
}
