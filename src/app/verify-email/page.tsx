'use client'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'

function VerifyContent() {
  const searchParams = useSearchParams()
  const success = searchParams.get('success') === '1'
  const error = searchParams.get('error') // 'expired' | 'invalid' | etc.
  const { setUser } = useAuth()
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  useEffect(() => {
    if (success) {
      fetch('/api/auth/me').then(r => r.json()).then(d => {
        if (d.user) setUser(d.user)
      }).catch(() => {})
    }
  }, [success, setUser])

  async function handleResend() {
    setResendStatus('sending')
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' })
      setResendStatus(res.ok ? 'sent' : 'error')
    } catch {
      setResendStatus('error')
    }
  }

  // Determine which state we're in
  const isError = !success && !!error
  const isPending = !success && !error

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16 animate-fade-in">
      {/* Ambient glow */}
      <div className="absolute inset-x-0 top-0 h-[480px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 90% at 50% 0%, rgba(234,88,12,0.15) 0%, transparent 65%)' }} />
      <div className="w-full max-w-sm relative">

        {/* EBK wordmark */}
        <div className="text-center mb-10 animate-fade-up">
          <h1
            className="font-display text-7xl text-white leading-none mb-1"
            style={{ textShadow: '0 0 60px rgba(249,115,22,0.35)' }}
          >
            EBK
          </h1>
          <p className="text-label tracking-[0.4em]">
            {success ? 'Account Verified' : isError ? 'Link Expired' : 'Email Confirmation'}
          </p>
        </div>

        <div className="card-accent p-8 animate-fade-up-1">

          {success && (
            /* ── SUCCESS STATE ─────────────────────────────────── */
            <div className="text-center">
              {/* Celebratory checkmark with glow rings */}
              <div className="relative flex items-center justify-center mb-6">
                <div className="absolute w-24 h-24 rounded-full bg-green-500/10 animate-ping opacity-30" style={{ animationDuration: '2.5s' }} />
                <div className="absolute w-20 h-20 rounded-full bg-green-500/08 animate-ping opacity-20" style={{ animationDuration: '2s', animationDelay: '0.3s' }} />
                <div className="w-16 h-16 rounded-2xl bg-green-500/15 border border-green-500/35 flex items-center justify-center relative animate-scale-in"
                  style={{ boxShadow: '0 0 32px rgba(34,197,94,0.2)' }}>
                  <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>

              <h2 className="font-display text-5xl text-white leading-none mb-1 tracking-wide">VERIFIED!</h2>
              <p className="text-green-400/70 text-xs font-black tracking-[0.2em] uppercase mb-5">Account Activated</p>
              <p className="text-white/45 text-sm leading-relaxed mb-8">
                You&apos;re in. Draft hidden gems, build your record, and dominate the War Room.
              </p>

              <Link href="/lobby" className="btn-primary w-full text-base font-display tracking-widest">
                Start Playing Free
              </Link>
              <Link href="/play" className="btn-secondary w-full text-sm mt-3">
                Try Quick Play First
              </Link>
            </div>
          )}

          {isError && (
            /* ── ERROR / EXPIRED STATE ────────────────────────── */
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>

              <h2 className="font-display text-4xl text-white leading-none mb-2 tracking-wide">
                {error === 'expired' ? 'LINK EXPIRED' : 'INVALID LINK'}
              </h2>
              <p className="text-white/45 text-sm leading-relaxed mb-2">
                {error === 'expired'
                  ? 'Your verification link has expired.'
                  : 'This verification link is invalid or has already been used.'}
              </p>
              <p className="text-white/30 text-xs leading-relaxed mb-8">
                Verification links expire after 24 hours. Request a new one below.
              </p>

              {resendStatus === 'sent' ? (
                <div className="bg-green-950/30 border border-green-500/30 rounded-xl px-4 py-3 mb-4">
                  <p className="text-green-400 text-sm font-bold">New link sent — check your inbox.</p>
                </div>
              ) : resendStatus === 'error' ? (
                <div className="bg-red-950/30 border border-red-500/30 rounded-xl px-4 py-3 mb-4">
                  <p className="text-red-400 text-sm">Couldn&apos;t send. Try logging in to resend.</p>
                </div>
              ) : null}

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleResend}
                  disabled={resendStatus === 'sending' || resendStatus === 'sent'}
                  className="btn-primary w-full text-sm tracking-widest"
                >
                  {resendStatus === 'sending' ? 'Sending…' : 'Resend Verification Email'}
                </button>
                <Link href="/login" className="btn-secondary w-full text-sm">
                  Go to Login
                </Link>
              </div>
            </div>
          )}

          {isPending && (
            /* ── CHECK EMAIL STATE ────────────────────────────── */
            <div className="text-center">
              {/* Animated envelope icon */}
              <div className="relative flex items-center justify-center mb-6">
                <div className="absolute w-20 h-20 rounded-full bg-orange-500/10 animate-ping opacity-40" style={{ animationDuration: '2s' }} />
                <div className="w-16 h-16 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center relative"
                  style={{ boxShadow: '0 0 24px rgba(249,115,22,0.15)' }}>
                  <svg className="w-8 h-8 text-orange-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
              </div>

              <h2 className="font-display text-4xl text-white leading-none mb-2 tracking-wide">CHECK YOUR EMAIL</h2>
              <p className="text-white/55 text-sm leading-relaxed mb-2">
                We sent a verification link to your inbox.
              </p>
              <p className="text-white/30 text-xs leading-relaxed mb-6">
                Click the link in the email to activate your account. Check your spam folder if you don&apos;t see it within a minute.
              </p>

              {/* Resend option — proper button */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-4 mb-6">
                <p className="text-white/40 text-xs mb-3">Didn&apos;t get the email?</p>
                {resendStatus === 'sent' ? (
                  <div className="flex items-center justify-center gap-2 text-green-400">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-sm font-bold">New link sent — check your inbox.</p>
                  </div>
                ) : resendStatus === 'error' ? (
                  <p className="text-red-400 text-xs">Couldn&apos;t send. Please try again in a moment.</p>
                ) : (
                  <button
                    onClick={handleResend}
                    disabled={resendStatus === 'sending'}
                    className="btn-secondary w-full text-sm py-2.5 px-4"
                  >
                    {resendStatus === 'sending' ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                        Sending…
                      </span>
                    ) : 'Resend Verification Email'}
                  </button>
                )}
              </div>

              {/* Divider */}
              <div className="section-divider mb-6">
                <span className="text-white/20 text-xs font-bold tracking-widest uppercase">Already verified?</span>
              </div>

              <Link href="/login" className="btn-secondary w-full text-sm">
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
