'use client'
import { useState } from 'react'
import Link from 'next/link'

function Spinner() {
  return <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState(false)

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong. Please try again.'); return }
      setSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-16 animate-fade-in">
      {/* Ambient glow */}
      <div
        className="absolute inset-x-0 top-0 h-[480px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 90% at 50% 0%, rgba(234,88,12,0.15) 0%, transparent 65%)' }}
      />

      <div className="w-full max-w-sm relative">

        {/* EBK wordmark */}
        <div className="text-center mb-10 animate-fade-up">
          <h1
            className="font-display text-7xl text-white leading-none mb-1"
            style={{ textShadow: '0 0 60px rgba(249,115,22,0.35)' }}
          >
            EBK
          </h1>
          <p className="text-label tracking-[0.4em]">Reset Password</p>
        </div>

        <div className="card-accent p-8 animate-fade-up-1">
          {sent ? (
            /* ── SENT STATE ────────────────────────────────────────────────── */
            <div className="text-center">
              {/* Animated envelope */}
              <div className="relative flex items-center justify-center mb-6">
                <div className="absolute w-20 h-20 rounded-full bg-green-500/10 animate-ping opacity-30" style={{ animationDuration: '2.5s' }} />
                <div
                  className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/25 flex items-center justify-center relative"
                  style={{ boxShadow: '0 0 24px rgba(34,197,94,0.12)' }}
                >
                  <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
              </div>

              <h2 className="font-display text-4xl text-white leading-none mb-2 tracking-wide">CHECK YOUR INBOX</h2>
              <p className="text-white/45 text-sm leading-relaxed mb-1">
                If an account exists for
              </p>
              <p className="text-orange-400 font-semibold text-sm mb-1">{email}</p>
              <p className="text-white/45 text-sm leading-relaxed mb-2">
                we&apos;ve sent a reset link.
              </p>
              <p className="text-white/25 text-xs leading-relaxed mb-8">
                Check your spam folder if you don&apos;t see it within a minute.
              </p>

              <Link href="/login" className="btn-primary w-full text-sm font-display tracking-widest">
                Back to Login
              </Link>
            </div>

          ) : (
            /* ── FORM STATE ────────────────────────────────────────────────── */
            <>
              {/* Lock icon header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </div>
                <div>
                  <h2 className="font-black text-white text-base leading-tight">Reset your password</h2>
                  <p className="text-white/35 text-xs mt-0.5">We&apos;ll send a reset link to your email</p>
                </div>
              </div>

              {/* Error banner */}
              {error && (
                <div
                  role="alert"
                  className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 mb-5 text-sm animate-slide-up flex items-start gap-2"
                >
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="forgot-email" className="text-label block mb-2">Email Address</label>
                  <div className="relative flex items-center">
                    <input
                      id="forgot-email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onBlur={() => setTouched(true)}
                      required
                      placeholder="you@example.com"
                      className={`input-field pr-9 ${touched ? (validEmail ? 'valid' : 'invalid') : ''}`}
                      autoComplete="email"
                    />
                    {touched && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
                        {validEmail ? (
                          <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </span>
                    )}
                  </div>
                  {touched && !validEmail && (
                    <p role="alert" className="text-red-400 text-[10px] mt-1 ml-1">Enter a valid email address</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full text-sm font-display tracking-widest"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner />
                      Sending…
                    </span>
                  ) : 'Send Reset Link'}
                </button>
              </form>

              {/* Divider */}
              <div className="section-divider mt-6 mb-5">
                <span className="text-white/20 text-xs font-bold tracking-widest uppercase">or</span>
              </div>

              <Link
                href="/login"
                className="flex items-center justify-center gap-2 text-white/60 hover:text-white/80 text-sm font-bold transition-colors group"
              >
                <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back to Login
              </Link>
            </>
          )}
        </div>

        {/* Footer hint */}
        <p className="text-center text-white/20 text-xs mt-6 animate-fade-up-2">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-orange-500/60 hover:text-orange-400 transition-colors">
            Sign up free
          </Link>
        </p>
      </div>
    </div>
  )
}
