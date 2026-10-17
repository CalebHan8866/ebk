'use client'
import { useState } from 'react'
import Link from 'next/link'

function FieldStatus({ valid, touched }: { valid: boolean; touched: boolean }) {
  if (!touched) return null
  if (valid) return (
    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
  return (
    <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

export default function RegisterPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMsg, setResendMsg] = useState('')

  async function handleResend() {
    setResendLoading(true)
    setResendMsg('')
    try {
      await fetch('/api/auth/resend-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setResendMsg('New link sent — check your inbox.')
    } catch {
      setResendMsg('Could not send. Try again.')
    } finally {
      setResendLoading(false)
    }
  }

  // Touched state for inline validation
  const [touchedUsername, setTouchedUsername] = useState(false)
  const [touchedEmail, setTouchedEmail] = useState(false)
  const [touchedPassword, setTouchedPassword] = useState(false)

  const validUsername = username.length >= 3 && username.length <= 20
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const validPassword = password.length >= 6

  // Password strength
  const passwordStrength = (() => {
    if (password.length === 0) return 0
    let score = 0
    if (password.length >= 6) score++
    if (password.length >= 10) score++
    if (/[A-Z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++
    return score
  })()
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'][passwordStrength]
  const strengthColor = ['', 'bg-red-500', 'bg-yellow-500', 'bg-yellow-400', 'bg-green-400', 'bg-green-500'][passwordStrength]

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
        <div className="card-surface p-10 max-w-sm w-full text-center animate-scale-in">
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
          <p className="text-gray-500 text-xs mb-6">Check your spam folder if you don&apos;t see it within a minute.</p>
          {resendMsg ? (
            <p className="text-green-400 text-xs mb-4">{resendMsg}</p>
          ) : (
            <button onClick={handleResend} disabled={resendLoading}
              className="text-gray-500 hover:text-gray-300 text-xs transition-colors mb-4 block mx-auto">
              {resendLoading ? 'Sending...' : 'Didn\'t get it? Resend email'}
            </button>
          )}
          <Link href="/login" className="text-orange-400 hover:text-orange-300 font-semibold text-sm transition-colors">
            Go to Login →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16 animate-fade-in">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-display text-6xl text-white leading-none mb-1"
            style={{ textShadow: '0 0 60px rgba(249,115,22,0.3)' }}>
            EBK
          </h1>
          <p className="text-[10px] font-bold tracking-[0.4em] text-gray-400 uppercase">Create Your Account</p>
        </div>

        {/* Value prop chips — what you unlock by registering */}
        <div className="flex items-center justify-center gap-2 flex-wrap mb-6">
          {['Track your W/L record', 'Unlock badges', 'Save your drafts'].map(item => (
            <span key={item} className="inline-flex items-center gap-1 bg-orange-950/30 border border-orange-900/40 rounded-full px-3 py-1 text-[10px] text-orange-300/80 font-semibold">
              <span className="text-green-400">✓</span>
              {item}
            </span>
          ))}
        </div>

        <div className="card-surface p-8">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 mb-6 text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Username */}
            <div>
              <label htmlFor="register-username" className="block text-gray-400 text-xs font-semibold tracking-wide uppercase mb-2">Username</label>
              <div className="relative flex items-center">
                <input
                  id="register-username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onBlur={() => setTouchedUsername(true)}
                  required minLength={3} maxLength={20}
                  aria-describedby={touchedUsername && !validUsername ? 'username-error' : undefined}
                  aria-invalid={touchedUsername && !validUsername ? true : undefined}
                  className={`input-field pr-9 ${touchedUsername ? (validUsername ? 'valid' : 'invalid') : ''}`}
                  placeholder="YourTag23"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
                  <FieldStatus valid={validUsername} touched={touchedUsername} />
                </span>
              </div>
              {touchedUsername && !validUsername && (
                <p id="username-error" role="alert" className="text-red-400 text-[10px] mt-1 ml-1">3–20 characters required</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="register-email" className="block text-gray-400 text-xs font-semibold tracking-wide uppercase mb-2">Email</label>
              <div className="relative flex items-center">
                <input
                  id="register-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onBlur={() => setTouchedEmail(true)}
                  required
                  className={`input-field pr-9 ${touchedEmail ? (validEmail ? 'valid' : 'invalid') : ''}`}
                  placeholder="you@example.com"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
                  <FieldStatus valid={validEmail} touched={touchedEmail} />
                </span>
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="register-password" className="block text-gray-400 text-xs font-semibold tracking-wide uppercase mb-2">Password</label>
              <div className="relative flex items-center">
                <input
                  id="register-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onBlur={() => setTouchedPassword(true)}
                  required minLength={6}
                  aria-describedby={password.length > 0 ? 'password-strength' : undefined}
                  className={`input-field pr-9 ${touchedPassword ? (validPassword ? 'valid' : 'invalid') : ''}`}
                  placeholder="Min 6 characters"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
                  <FieldStatus valid={validPassword} touched={touchedPassword} />
                </span>
              </div>
              {/* Password strength meter */}
              {password.length > 0 && (
                <div id="password-strength" className="mt-2" aria-live="polite">
                  <div className="flex gap-1 mb-1" aria-hidden="true">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= passwordStrength ? strengthColor : 'bg-white/10'}`}
                      />
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400">Password strength: {strengthLabel}</p>
                </div>
              )}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full text-sm uppercase mt-2">
              {loading ? 'Creating account…' : 'Create Free Account'}
            </button>
          </form>
          <p className="text-center text-gray-400 text-sm mt-6">
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
