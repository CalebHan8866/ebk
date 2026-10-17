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
    <div className="card-surface p-8">
      {error && (
        <div id="login-error" role="alert" className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 mb-6 text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="block text-gray-400 text-xs font-semibold tracking-wide uppercase mb-2">Email</label>
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
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="login-password" className="block text-gray-400 text-xs font-semibold tracking-wide uppercase">Password</label>
            <Link href="/forgot-password" className="text-orange-500/70 hover:text-orange-400 text-xs font-semibold transition-colors">
              Forgot password?
            </Link>
          </div>
          <div className="relative flex items-center">
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onBlur={() => setTouchedPassword(true)}
              required
              aria-describedby={error ? 'login-error' : undefined}
              className={`input-field pr-9 ${touchedPassword ? (validPassword ? 'valid' : 'invalid') : ''}`}
              placeholder="••••••••"
            />
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
        <button type="submit" disabled={loading} className="btn-primary w-full text-sm uppercase mt-2">
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
      <p className="text-center text-gray-400 text-sm mt-6">
        No account?{' '}
        <Link href="/register" className="text-orange-400 hover:text-orange-300 font-semibold transition-colors">
          Sign up free
        </Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-6xl text-white leading-none mb-1"
            style={{ textShadow: '0 0 60px rgba(249,115,22,0.3)' }}>
            EBK
          </h1>
          <p className="text-[10px] font-bold tracking-[0.4em] text-gray-400 uppercase">Welcome Back</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
