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
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">📧</div>
          <h1 className="text-3xl font-black text-white mb-3">Check Your Email</h1>
          <p className="text-gray-400 mb-4">
            We sent a verification link to <span className="text-orange-400">{email}</span>.
          </p>
          {process.env.NODE_ENV === 'development' && (
            <p className="text-gray-500 text-sm mb-8">
              Dev mode: link is in the <strong className="text-gray-300">server terminal</strong>.
            </p>
          )}
          <Link href="/login" className="text-orange-400 hover:text-orange-300 font-semibold">
            Go to Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-5xl text-orange-500 leading-none">EBK</h1>
          <p className="text-gray-400 text-sm">Create Your Account</p>
        </div>
        <div className="bg-[#111827] rounded-2xl p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Join EBK</h2>
          {error && <div className="bg-red-900/50 border border-red-500 text-red-300 rounded-lg p-3 mb-4 text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-gray-400 text-sm mb-1">Username</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} required minLength={3}
                className="w-full bg-[#0A0A0A] border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                placeholder="YourTag23" />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full bg-[#0A0A0A] border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                placeholder="you@example.com" />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                className="w-full bg-[#0A0A0A] border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                placeholder="Min 6 characters" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors">
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
          <p className="text-center text-gray-400 text-sm mt-4">
            Already have an account? <Link href="/login" className="text-orange-400 hover:text-orange-300">Login</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
