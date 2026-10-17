'use client'
import { useState } from 'react'
import Link from 'next/link'

export default function RegisterPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Registration failed'); return }
      setDone(true)
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card-surface p-10 max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-orange-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
          <h2 className="font-black text-white text-xl mb-2">Check Your Inbox</h2>
          <p className="text-gray-400 text-sm mb-1 leading-relaxed">
            We sent a verification link to
          </p>
          <p className="text-orange-400 font-semibold text-sm mb-6">{email}</p>
          {process.env.NODE_ENV === 'development' && (
            <p className="text-gray-600 text-xs mb-6">
              Dev mode: link is in the <strong className="text-gray-400">server terminal</strong>.
            </p>
          )}
          <Link href="/login" className="text-orange-400 hover:text-orange-300 font-semibold text-sm transition-colors">
            Go to Login →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-6xl text-white leading-none mb-1"
            style={{ textShadow: '0 0 60px rgba(249,115,22,0.3)' }}>
            EBK
          </h1>
          <p className="text-[10px] font-bold tracking-[0.4em] text-gray-600 uppercase">Create Your Account</p>
        </div>

        <div className="card-surface p-8">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 mb-6 text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-gray-500 text-xs font-semibold tracking-wide uppercase mb-2">Username</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                required minLength={3} maxLength={20}
                className="input-field" placeholder="YourTag23" />
            </div>
            <div>
              <label className="block text-gray-500 text-xs font-semibold tracking-wide uppercase mb-2">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="input-field" placeholder="you@example.com" />
            </div>
            <div>
              <label className="block text-gray-500 text-xs font-semibold tracking-wide uppercase mb-2">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                required minLength={6}
                className="input-field" placeholder="Min 6 characters" />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full text-sm uppercase mt-2">
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
          <p className="text-center text-gray-600 text-sm mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-orange-400 hover:text-orange-300 font-semibold transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
