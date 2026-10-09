'use client'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'

function VerifyContent() {
  const searchParams = useSearchParams()
  const success = searchParams.get('success') === '1'
  const { setUser } = useAuth()

  useEffect(() => {
    if (success) {
      // Refresh user state in context after auto-login
      fetch('/api/auth/me').then(r => r.json()).then(d => {
        if (d.user) setUser(d.user)
      })
    }
  }, [success, setUser])

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        {success ? (
          <>
            <div className="text-6xl mb-4">🎉</div>
            <h1 className="text-3xl font-black text-white mb-3">Email Verified!</h1>
            <p className="text-gray-400 mb-8">Your account is confirmed. You&apos;re ready to play EBK.</p>
            <Link href="/lobby" className="bg-orange-600 hover:bg-orange-700 text-white font-black px-8 py-4 rounded-xl inline-block text-lg transition-colors">
              Start Playing
            </Link>
          </>
        ) : (
          <>
            <div className="text-6xl mb-4">📧</div>
            <h1 className="text-3xl font-black text-white mb-3">Check Your Email</h1>
            <p className="text-gray-400 mb-4">We sent a verification link to your email address.</p>
            <p className="text-gray-500 text-sm mb-8">
              In development mode, the link is printed in the server terminal instead of being emailed.
            </p>
            <Link href="/login" className="text-orange-400 hover:text-orange-300 font-semibold">
              Back to Login
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-gray-400">Loading...</div>}>
      <VerifyContent />
    </Suspense>
  )
}
