'use client'
import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

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
      if (!res.ok) { setError(data.error || 'Something went wrong'); return }
      setSent(true)
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

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
          <p className="text-label tracking-[0.4em]">Reset Password</p>
        </div>

        <div className="card-accent p-8 animate-fade-up-1">
          {sent ? (
            /* ── SENT STATE ────────────────────────────────────── */
            <div className="text-center">
              {/* Email sent icon */}
              <div className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/25 flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>

              <h2 className="font-display text-4xl text-white leading-none mb-2 tracking-wide">CHECK YOUR INBOX</h2>
              <p className="text-white/45 text-sm leading-relaxed mb-2">
                If an account exists for{' '}
                <span className="text-orange-400 font-bold">{email}</span>,
                we sent a reset link.
              </p>
              <p className="text-white/25 text-xs leading-relaxed mb-8">
                Check your spam folder if you don&apos;t see it within a minute.
              </p>

              <Link href="/login" className="btn-primary w-full text-sm font-display tracking-widest">
                Back to Login
              </Link>
            </div>
          ) : (
            /* ── FORM STATE ────────────────────────────────────── */
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

              {/* Error */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 mb-5 text-sm animate-slide-up">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="text-label block mb-2">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className="input-field"
                    autoComplete="email"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full text-sm font-display tracking-widest"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
