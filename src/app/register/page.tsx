'use client'
import { useState } from 'react'
import Link from 'next/link'

// ── Shared SVGs ──────────────────────────────────────────────────────────────

function IconCheck() {
  return (
    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

function IconX() {
  return (
    <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function IconEyeOff() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  )
}

function IconEye() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
}

function FieldStatus({ valid, touched }: { valid: boolean; touched: boolean }) {
  if (!touched) return null
  return valid ? <IconCheck /> : <IconX />
}

// ── Ambient glow (shared across auth pages) ─────────────────────────────────
function AuthGlow() {
  return (
    <div
      className="absolute inset-x-0 top-0 h-[480px] pointer-events-none"
      style={{ background: 'radial-gradient(ellipse 80% 90% at 50% 0%, rgba(234,88,12,0.15) 0%, transparent 65%)' }}
    />
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMsg, setResendMsg] = useState('')

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
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Success / email-sent state ──────────────────────────────────────────────
  if (done) {
    return (
      <div className="relative min-h-screen flex items-center justify-center px-4 py-16 animate-fade-in">
        <AuthGlow />
        <div className="w-full max-w-sm relative">

          <div className="text-center mb-10 animate-fade-up">
            <h1
              className="font-display text-7xl text-white leading-none mb-1"
              style={{ textShadow: '0 0 60px rgba(249,115,22,0.35)' }}
            >
              EBK
            </h1>
            <p className="text-label tracking-[0.4em]">Account Created</p>
          </div>

          <div className="card-accent p-8 animate-fade-up-1 text-center">
            <div
              className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-6"
              style={{ boxShadow: '0 0 24px rgba(249,115,22,0.12)' }}
            >
              <svg className="w-8 h-8 text-orange-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>

            <h2 className="font-display text-4xl text-white leading-none mb-2 tracking-wide">CHECK YOUR INBOX</h2>
            <p className="text-white/45 text-sm leading-relaxed mb-1">
              We sent a verification link to
            </p>
            <p className="text-orange-400 font-semibold text-sm mb-2">{email}</p>
            <p className="text-white/25 text-xs leading-relaxed mb-8">
              Check your spam folder if you don&apos;t see it within a minute.
            </p>

            <Link href="/login" className="btn-primary w-full text-sm font-display tracking-widest mb-4">
              Go to Login
            </Link>

            {resendMsg ? (
              <p className={`text-xs mt-3 ${resendMsg.startsWith('Could') ? 'text-red-400' : 'text-green-400'}`}>
                {resendMsg}
              </p>
            ) : (
              <button
                onClick={handleResend}
                disabled={resendLoading}
                className="btn-secondary w-full text-xs mt-3"
              >
                {resendLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner />
                    Sending…
                  </span>
                ) : "Didn't get it? Resend email"}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Registration form ───────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-16 animate-fade-in">
      <AuthGlow />
      <div className="w-full max-w-sm relative">

        {/* Header */}
        <div className="text-center mb-8 animate-fade-up">
          <h1
            className="font-display text-7xl text-white leading-none mb-1"
            style={{ textShadow: '0 0 60px rgba(249,115,22,0.3)' }}
          >
            EBK
          </h1>
          <p className="text-label tracking-[0.4em]">Create Your Account</p>
        </div>

        {/* Value prop chips */}
        <div className="flex items-center justify-center gap-2 flex-wrap mb-6 animate-fade-up-1">
          {['Track your W/L record', 'Unlock badges', 'Save your drafts'].map(item => (
            <span key={item} className="inline-flex items-center gap-1 bg-orange-950/30 border border-orange-900/40 rounded-full px-3 py-1 text-[10px] text-orange-300/80 font-semibold">
              <span className="text-green-400">✓</span>
              {item}
            </span>
          ))}
        </div>

        <div className="card-accent p-8 animate-fade-up-2">
          {/* Icon header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
              </svg>
            </div>
            <div>
              <h2 className="font-black text-white text-base leading-tight">Create your account</h2>
              <p className="text-white/35 text-xs mt-0.5">Free forever — no credit card needed</p>
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

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Username */}
            <div>
              <label htmlFor="register-username" className="text-label block mb-2">Username</label>
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
                  autoComplete="username"
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
              <label htmlFor="register-email" className="text-label block mb-2">Email</label>
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
                  autoComplete="email"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
                  <FieldStatus valid={validEmail} touched={touchedEmail} />
                </span>
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="register-password" className="text-label block mb-2">Password</label>
              <div className="relative flex items-center">
                <input
                  id="register-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onBlur={() => setTouchedPassword(true)}
                  required minLength={6}
                  aria-describedby={password.length > 0 ? 'password-strength' : undefined}
                  className={`input-field pr-16 ${touchedPassword ? (validPassword ? 'valid' : 'invalid') : ''}`}
                  placeholder="Min 6 characters"
                  autoComplete="new-password"
                />
                {/* Show / hide toggle */}
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-8 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors p-1 -m-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <IconEyeOff /> : <IconEye />}
                </button>
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
                  <p className="text-[10px] text-white/40">
                    Password strength: <span className="text-white/60">{strengthLabel}</span>
                  </p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full text-sm font-display tracking-widest mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner />
                  Creating account…
                </span>
              ) : 'Create Free Account'}
            </button>
          </form>

          {/* Divider */}
          <div className="section-divider mt-6 mb-5">
            <span className="text-white/20 text-xs font-bold tracking-widest uppercase">already a member?</span>
          </div>

          <Link href="/login" className="btn-secondary w-full text-sm text-center block">
            Sign In
          </Link>
        </div>

        <p className="text-center text-white/20 text-xs mt-6 animate-fade-up-3">
          By creating an account you agree to our{' '}
          <Link href="/terms" className="text-orange-500/60 hover:text-orange-400 transition-colors">Terms</Link>
          {' '}and{' '}
          <Link href="/privacy" className="text-orange-500/60 hover:text-orange-400 transition-colors">Privacy Policy</Link>
        </p>
      </div>
    </div>
  )
}
