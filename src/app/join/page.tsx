'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * /join?code=XXXX — invite link handler for draft game rooms.
 *
 * Redirects immediately to /game/[CODE]?role=guest so the invitee lands
 * in the correct game room. If no code is provided, sends them to /lobby.
 */
function JoinRedirect() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const code = searchParams.get('code')?.toUpperCase().trim()

  useEffect(() => {
    if (code) {
      router.replace(`/game/${code}?role=guest`)
    } else {
      router.replace('/lobby')
    }
  }, [code, router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-2 border-white/[0.05]" />
        <div className="absolute inset-0 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
        <div className="absolute inset-3 rounded-full bg-orange-600/10 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
        </div>
      </div>
      <p className="text-label tracking-[0.3em]">JOINING DRAFT ROOM...</p>
    </div>
  )
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-white/[0.05]" />
          <div className="absolute inset-0 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
        </div>
        <p className="text-label tracking-[0.3em]">JOINING...</p>
      </div>
    }>
      <JoinRedirect />
    </Suspense>
  )
}
