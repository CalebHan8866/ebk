'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function GameError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    console.error('[EBK game error boundary]', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center text-center px-4">
      <div className="card-surface p-10 max-w-sm w-full animate-slide-up">
        <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
          <span className="text-red-400 text-xl font-black">!</span>
        </div>
        <h2 className="font-display text-3xl text-white mb-2">Game Error</h2>
        <p className="text-gray-400 text-sm mb-6 leading-relaxed">
          Something went wrong in this game. You can try again or return to the lobby.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="btn-primary w-full"
          >
            Try Again
          </button>
          <button
            onClick={() => router.push('/lobby')}
            className="btn-secondary w-full"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    </div>
  )
}
