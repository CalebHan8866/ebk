'use client'
import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

function ResetContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong'); return }
      setDone(true)
      setTimeout(() => router.push('/login'), 2500)
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="text-center py-2">
        <h2 className="font-black text-white text-lg mb-2">Invalid Link</h2>
        <p className="text-gray-400 text-sm mb-6">This reset link is missing or invalid.</p>
        <Link href="/forgot-password" className="text-orange-400 hover:text-orange-300 text-sm font-semibold transition-colors">
          Request a new one →
        </Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="text-center py-2">
        <div className="w-12 h-12 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="font-black text-white text-lg mb-2">Password Reset!</h2>
        <p className="text-gray-400 text-sm">Redirecting you to login…</p>
      </div>
    )
  }

  return (
    <>
      <h2 className="font-black text-white text-lg mb-1">New Password</h2>
      <p className="text-gray-500 text-sm mb-6">Choose a new password for your account.</p>
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 mb-5 text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-gray-500 text-xs font-semibold tracking-wide uppercase mb-2">New Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            required placeholder="••••••••" className="input-field" />
        </div>
        <div>
          <label className="block text-gray-500 text-xs font-semibold tracking-wide uppercase mb-2">Confirm Password</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            required placeholder="••••••••" className="input-field" />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full text-sm uppercase">
          {loading ? 'Resetting…' : 'Reset Password'}
        </button>
      </form>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-6xl text-white leading-none mb-1"
            style={{ textShadow: '0 0 60px rgba(249,115,22,0.3)' }}>
            EBK
          </h1>
          <p className="text-[10px] font-bold tracking-[0.4em] text-gray-600 uppercase">Reset Password</p>
        </div>
        <div className="card-surface p-8">
          <Suspense fallback={<div className="text-gray-500 text-center text-sm">Loading…</div>}>
            <ResetContent />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
