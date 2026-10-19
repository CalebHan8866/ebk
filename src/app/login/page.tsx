'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [touchedEmail, setTouchedEmail] = useState(false)
  const [touchedPassword, setTouchedPassword] = useState(false)
  const router = useRouter()
  const { setUser } = useAuth()

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const validPassword = password.length >= 6

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Login failed'); return }
      setUser(data.user)
      // Dynamic import so socket.io-client never loads during SSR/prerender
      const { resetSocket } = await import('@/lib/socket')
      resetSocket()
      router.push('/lobby')
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card-accent p-8 animate-fade-up-1">
      {/* Icon header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
        </div>
        <div>
          <h2 className="font-black text-white text-base leading-tight">Sign in to EBK</h2>
          <p className="text-white/35 text-xs mt-0.5">Enter your credentials to access your account</p>
        </div>
      </div>

      {error && (
        <div id="login-error" role="alert" className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 mb-5 text-sm animate-slide-up flex items-start gap-2">
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email */}
        <div>
          <label htmlFor="login-email" className="text-label block mb-2">Email</label>
          <div className="relative flex items-center">
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onBlur={() => setTouchedEmail(true)}
              required
              aria-describedby={error ? 'login-error' : undefined}
              className={`input-field pr-9 ${touchedEmail ? (validEmail ? 'valid' : 'invalid') : ''}`}
              placeholder="you@example.com"
              autoComplete="email"
            />
            {touchedEmail && (
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
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="login-password" className="text-label">Password</label>
            <Link href="/forgot-password" className="text-orange-500/70 hover:text-orange-400 text-[10px] font-bold uppercase tracking-widest transition-colors">
              Forgot?
            </Link>
          </div>
          <div className="relative flex items-center">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onBlur={() => setTouchedPassword(true)}
              required
              aria-describedby={error ? 'login-error' : undefined}
              className={`input-field pr-16 ${touchedPassword ? (validPassword ? 'valid' : 'invalid') : ''}`}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            {/* Show/hide toggle */}
            <button
              type="button"
              onClick={() => setShowPassword(s => !s)}
              className="absolute right-8 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
            {touchedPassword && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
                {validPassword ? (
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
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full text-sm font-display tracking-widest mt-2">
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Signing in…
            </span>
          ) : 'Sign In'}
        </button>
      </form>

      {/* Divider */}
      <div className="section-divider mt-6 mb-5">
        <span className="text-white/20 text-xs font-bold tracking-widest uppercase">new here?</span>
      </div>

      <Link href="/register" className="btn-secondary w-full text-sm text-center block">
        Create Free Account
      </Link>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16 animate-fade-in">
      <div className="w-full max-w-sm">

        {/* EBK wordmark */}
        <div className="text-center mb-10 animate-fade-up">
          <h1
            className="font-display text-7xl text-white leading-none mb-1"
            style={{ textShadow: '0 0 60px rgba(249,115,22,0.35)' }}
          >
            EBK
          </h1>
          <p className="text-label tracking-[0.4em]">Welcome Back</p>
        </div>

        <LoginForm />

        {/* Footer hint */}
        <p className="text-center text-white/20 text-xs mt-6 animate-fade-up-2">
          Forgot your password?{' '}
          <Link href="/forgot-password" className="text-orange-500/60 hover:text-orange-400 transition-colors">
            Reset it here
          </Link>
        </p>
      </div>
    </div>
  )
}
