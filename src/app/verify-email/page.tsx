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
      }).catch(() => {})
    }
  }, [success, setUser])

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        {success ? (
          <>
            <h1 className="font-display text-5xl text-orange-500 mb-3 leading-none">Verified!</h1>
            <p className="text-gray-400 mb-8">Your account is confirmed. You&apos;re ready to play EBK.</p>
            <Link href="/lobby" className="btn-primary inline-block uppercase">
              Start Playing
            </Link>
          </>
        ) : (
          <>
            <h1 className="font-display text-5xl text-white leading-none mb-3">Check Your Email</h1>
            <p className="text-gray-400 mb-2">We sent a verification link to your inbox.</p>
            <p className="text-gray-400 text-sm mb-8">
              Click the link in the email to verify your account and start playing.
              Check your spam folder if you don&apos;t see it within a minute.
            </p>
            <Link href="/login" className="text-orange-400 hover:text-orange-300 font-semibold">
              Go to Login
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>}>
      <VerifyContent />
    </Suspense>
  )
}
