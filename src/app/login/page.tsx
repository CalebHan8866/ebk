'use client'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const justVerified = searchParams.get('verified') === '1'
  const { setUser } = useAuth()

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
      router.push('/lobby')
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-[#111827] rounded-2xl p-8">
      <h2 className="text-2xl font-bold text-white mb-6">Welcome Back</h2>
      {justVerified && <div className="bg-green-900/50 border border-green-500 text-green-300 rounded-lg p-3 mb-4 text-sm">Email verified! You can now log in.</div>}
      {error && <div className="bg-red-900/50 border border-red-500 text-red-300 rounded-lg p-3 mb-4 text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-gray-400 text-sm mb-1">Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
            className="w-full bg-[#0A0A0A] border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500"
            placeholder="you@example.com" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-gray-400 text-sm">Password</label>
            <Link href="/forgot-password" className="text-orange-400 hover:text-orange-300 text-xs">Forgot password?</Link>
          </div>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
            className="w-full bg-[#0A0A0A] border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500"
            placeholder="••••••••" />
        </div>
        <button type="submit" disabled={loading}
          className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors">
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
      <p className="text-center text-gray-400 text-sm mt-4">
        No account? <Link href="/register" className="text-orange-400 hover:text-orange-300">Sign up</Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-5xl text-orange-500 leading-none">EBK</h1>
          <p className="text-gray-400 text-sm">Elite Ball Knowledge</p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
