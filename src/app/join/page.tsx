'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

/**
 * /join?code=XXXX — invite link handler for draft game rooms.
 *
 * • With ?code=XXXX  → validates the code then redirects to /game/[CODE]?role=guest
 * • Without ?code=   → renders a manual entry form so the user can type the code
 * • Invalid code     → shows an inline error with a shake animation
 *
 * Security: room codes are generated server-side as 6-character strings from
 * [A-Z2-9].  We enforce that constraint here so an attacker cannot craft a
 * ?code=../../../evil URL that escapes the /game/ prefix via path traversal
 * (open redirect).  Anything that doesn't match is treated as absent.
 */
const ROOM_CODE_RE = /^[A-Z0-9]{6}$/

// ── Auto-redirect flow (when ?code= is present) ─────────────────────────────
function JoinRedirect({ code }: { code: string }) {
  const router = useRouter()

  useEffect(() => {
    router.replace(`/game/${code}?role=guest`)
  }, [code, router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 animate-fade-in">
      {/* Ambient glow */}
      <div className="absolute inset-x-0 top-0 h-64 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(234,88,12,0.12) 0%, transparent 70%)' }} />

      {/* Spinner */}
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-2 border-white/[0.04]" />
        <div className="absolute inset-0 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
        <div className="absolute inset-3 rounded-full bg-orange-600/10 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
        </div>
      </div>

      <div className="text-center">
        <p className="text-label tracking-[0.3em] animate-ellipsis">JOINING DRAFT ROOM</p>
        <p className="font-display text-3xl text-orange-500 mt-1 tracking-widest">{code}</p>
        <p className="text-white/25 text-xs mt-2">Connecting you now...</p>
      </div>
    </div>
  )
}

// ── Manual entry form (no ?code= in URL) ─────────────────────────────────────
function JoinForm() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shakeKey, setShakeKey] = useState(0)
  const [joining, setJoining] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Auto-focus the input on mount so mobile keyboard opens
    inputRef.current?.focus()
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const cleaned = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    setValue(cleaned)
    if (error) setError(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const code = value.trim().toUpperCase()

    if (!ROOM_CODE_RE.test(code)) {
      setError(
        code.length < 6
          ? `Room codes are 6 characters — you've entered ${code.length}.`
          : 'Invalid room code. Codes use letters and numbers only.'
      )
      setShakeKey(k => k + 1)
      inputRef.current?.focus()
      return
    }

    setJoining(true)
    router.push(`/game/${code}?role=guest`)
  }

  const isReady = ROOM_CODE_RE.test(value)

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 animate-fade-in">
      {/* Ambient glow */}
      <div className="absolute inset-x-0 top-0 h-72 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(234,88,12,0.14) 0%, transparent 70%)' }} />

      <div className="relative w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8 animate-fade-up">
          {/* Basketball icon */}
          <div className="w-16 h-16 rounded-full bg-orange-500/10 border border-orange-500/25 flex items-center justify-center mx-auto mb-5"
            style={{ boxShadow: '0 0 32px rgba(249,115,22,0.18)' }}>
            <svg className="w-9 h-9 text-orange-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M12 3c0 5 3 8 9 9M12 3C12 8 9 11 3 12M12 21c0-5-3-8-9-9M12 21c0-5 3-8 9-9" />
            </svg>
          </div>
          <p className="text-label tracking-[0.35em] mb-2">Elite Ball Knowledge</p>
          <h1 className="font-display text-3xl sm:text-4xl text-white leading-none">Join a Draft Room</h1>
          <p className="text-white/40 text-sm mt-2">Enter the 6-character room code from your invite</p>
        </div>

        {/* Card */}
        <div className="card-accent p-6 sm:p-7 animate-fade-up-1">
          <form onSubmit={handleSubmit} noValidate>
            {/* Input wrapper — shake on error */}
            <div
              key={shakeKey}
              className={shakeKey > 0 ? 'animate-join-shake' : undefined}
            >
              <label htmlFor="room-code" className="text-label mb-2 block tracking-widest">
                Room Code
              </label>
              <input
                ref={inputRef}
                id="room-code"
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={value}
                onChange={handleChange}
                placeholder="A1B2C3"
                maxLength={6}
                disabled={joining}
                aria-describedby={error ? 'join-error' : undefined}
                aria-invalid={!!error}
                className={`input-room-code ${
                  error ? 'input-error' :
                  isReady ? 'input-valid' : ''
                }`}
              />
            </div>

            {/* Error message */}
            {error && (
              <div
                id="join-error"
                role="alert"
                className="flex items-start gap-2 mt-3 p-3 rounded-xl bg-red-900/20 border border-red-500/25 animate-slide-up"
              >
                <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <path strokeLinecap="round" d="M12 8v4m0 4h.01" />
                </svg>
                <p className="text-red-300 text-sm leading-snug">{error}</p>
              </div>
            )}

            {/* Character progress pips */}
            <div className="flex gap-1.5 justify-center mt-4 mb-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-all duration-200 ${
                    i < value.length
                      ? isReady ? 'bg-green-400' : 'bg-orange-500'
                      : 'bg-white/[0.08]'
                  }`}
                />
              ))}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={joining}
              className="btn-primary w-full"
            >
              {joining ? (
                <span className="flex items-center gap-2 justify-center">
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Joining...
                </span>
              ) : (
                'Join Room'
              )}
            </button>
          </form>
        </div>

        {/* Footer links */}
        <div className="mt-5 text-center animate-fade-up-2">
          <p className="text-white/30 text-xs mb-3">Don&apos;t have an invite?</p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/lobby" className="text-xs font-bold text-white/40 hover:text-orange-400 transition-colors px-3 py-1.5 rounded-lg border border-white/[0.06] hover:border-orange-500/30 bg-white/[0.02] hover:bg-orange-950/20">
              Browse Lobby
            </Link>
            <Link href="/" className="text-xs font-bold text-white/40 hover:text-orange-400 transition-colors px-3 py-1.5 rounded-lg border border-white/[0.06] hover:border-orange-500/30 bg-white/[0.02] hover:bg-orange-950/20">
              Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Router — reads search params and picks the right view ───────────────────
function JoinRouter() {
  const searchParams = useSearchParams()
  const raw = searchParams.get('code')?.toUpperCase().trim() ?? ''
  // Only accept well-formed room codes — reject path traversal or arbitrary strings.
  const code = ROOM_CODE_RE.test(raw) ? raw : null

  if (code) {
    return <JoinRedirect code={code} />
  }

  return <JoinForm />
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col items-center justify-center gap-5">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-white/[0.04]" />
          <div className="absolute inset-0 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
        </div>
        <p className="text-label tracking-[0.3em]">LOADING...</p>
      </div>
    }>
      <JoinRouter />
    </Suspense>
  )
}
