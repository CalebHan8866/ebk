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
      fetch('/api/auth/me').then(r => r.json()).then(d => {
        if (d.user) setUser(d.user)
      }).catch(() => {})
    }
  }, [success, setUser])

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">

        {/* EBK wordmark */}
        <div className="text-center mb-10 animate-fade-up">
          <h1
            className="font-display text-7xl text-white leading-none mb-1"
            style={{ textShadow: '0 0 60px rgba(249,115,22,0.35)' }}
          >
            EBK
          </h1>
          <p className="text-label tracking-[0.4em]">
            {success ? 'Account Verified' : 'Email Confirmation'}
          </p>
        </div>

        <div className="card-accent p-8 animate-fade-up-1">
          {success ? (
            /* ── SUCCESS STATE ─────────────────────────────────── */
            <div className="text-center">
              {/* Check icon */}
              <div className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/25 flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h2 className="font-display text-4xl text-white leading-none mb-2 tracking-wide">VERIFIED!</h2>
              <p className="text-white/45 text-sm leading-relaxed mb-8">
                Your account is confirmed. You&apos;re ready to draft hidden gems and dominate the War Room.
              </p>

              <Link href="/lobby" className="btn-primary w-full text-base font-display tracking-widest">
                Start Playing
              </Link>
            </div>
          ) : (
            /* ── CHECK EMAIL STATE ────────────────────────────── */
            <div className="text-center">
              {/* Email icon */}
              <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-orange-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>

              <h2 className="font-display text-4xl text-white leading-none mb-2 tracking-wide">CHECK YOUR EMAIL</h2>
              <p className="text-white/45 text-sm leading-relaxed mb-2">
                We sent a verification link to your inbox.
              </p>
              <p className="text-white/30 text-xs leading-relaxed mb-8">
                Click the link in the email to activate your account. Check your spam folder if you don&apos;t see it within a minute.
              </p>

              {/* Divider */}
              <div className="section-divider mb-6">
                <span className="text-white/20 text-xs font-bold tracking-widest uppercase">Already verified?</span>
              </div>

              <Link
                href="/login"
                className="btn-secondary w-full text-sm"
              >
                Go to Login
              </Link>
            </div>
          )}
        </div>

        {/* Footer hint */}
        <p className="text-center text-white/20 text-xs mt-6 animate-fade-up-2">
          Need help?{' '}
          <a
            href="mailto:support@ebkgame.com"
            className="text-orange-500/60 hover:text-orange-400 transition-colors"
          >
            Contact support
          </a>
        </p>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <VerifyContent />
    </Suspense>
  )
}
