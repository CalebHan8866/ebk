'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * /auction/join?code=XXXX — invite link handler for auction (War Room) rooms.
 *
 * Redirects immediately to /auction so the invitee lands on the auction lobby
 * with the code pre-filled. If no code is provided, sends them to /auction.
 */
function AuctionJoinRedirect() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const code = searchParams.get('code')?.toUpperCase().trim()

  useEffect(() => {
    if (code) {
      // Pre-fill the join code via a query param the auction lobby reads on mount.
      router.replace(`/auction?join=${code}`)
    } else {
      router.replace('/auction')
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
      <p className="text-label tracking-[0.3em]">JOINING WAR ROOM...</p>
    </div>
  )
}

export default function AuctionJoinPage() {
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
      <AuctionJoinRedirect />
    </Suspense>
  )
}
