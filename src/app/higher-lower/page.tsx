'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { BADGES } from '@/lib/accessories'

interface Player {
  id: number
  firstName: string
  lastName: string
  team: string
  position: string
  careerGames: number
  careerPPG: number
  careerRPG: number
  careerAPG: number
  ebkScore: number
}

type GameScreen = 'loading' | 'playing' | 'revealing' | 'gameover' | 'complete' | 'error'
type ClaimStatus = 'pending' | 'unlocked' | 'already' | 'failed' | null

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let s = seed
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s ^ (s >>> 17), 1664525) + 1013904223) | 0
    const j = Math.abs(s) % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const TOTAL_PLAYERS = 67

/* Streak heat label — shown at milestone thresholds */
function streakHeat(streak: number): string | null {
  if (streak >= 25) return 'On Fire'
  if (streak >= 10) return 'Heating Up'
  if (streak >= 5)  return 'Hot'
  if (streak >= 3)  return 'Warming Up'
  return null
}

export default function HigherLowerPage() {
  const { user } = useAuth()
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [sequence, setSequence] = useState<Player[]>([])
  const [idx, setIdx] = useState(0)
  const [screen, setScreen] = useState<GameScreen>('loading')
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null)
  const [lastTied, setLastTied] = useState(false)
  const [unlockedBadge, setUnlockedBadge] = useState<{ id: string; name: string } | null>(null)
  const [claimStatus, setClaimStatus] = useState<ClaimStatus>(null)
  // Bump key — changes each time streak increases, re-triggers the bump animation
  const [streakBumpKey, setStreakBumpKey] = useState(0)
  // Flip key — unique per round so the card-reveal CSS plays fresh each time
  const [flipKey, setFlipKey] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const badgeClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMounted = useRef(true)
  const isGuessingRef = useRef(false)
  // Server-issued game session token — required when claiming a badge to prove
  // this request originated from an actual game session rather than a direct API call.
  const gameTokenRef = useRef<string | null>(null)
  // Snapshot of bestStreak at the start of each session (before any guesses).
  // Used to determine whether the current run set a *new* personal best on the
  // gameover screen — comparing against the live `bestStreak` state would
  // incorrectly show "New Personal Best!" when the player ties their old record
  // (because bestStreak is updated in-run via setBestStreak).
  const sessionBestRef = useRef(0)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      if (badgeClearRef.current) clearTimeout(badgeClearRef.current)
    }
  }, [])

  // Keyboard shortcuts: ArrowUp / H = Higher, ArrowDown / L = Lower
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Ignore if focus is on an input to avoid swallowing form input
      if (document.activeElement?.tagName === 'INPUT') return
      if (e.key === 'ArrowUp' || e.key === 'h' || e.key === 'H') {
        e.preventDefault()
        guess('higher')
      } else if (e.key === 'ArrowDown' || e.key === 'l' || e.key === 'L') {
        e.preventDefault()
        guess('lower')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, sequence, idx, streak])

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? parseInt(localStorage.getItem('hl_best') || '0') : 0
    setBestStreak(saved)
    // Snapshot the pre-session best so gameover can correctly distinguish a new
    // record from merely tying the old one (bestStreak is mutated during play).
    sessionBestRef.current = saved

    const playersFetch = fetch('/api/players').then(r => r.json())
    const tokenFetch: Promise<string | null> = user
      ? fetch('/api/higher-lower/start')
          .then(r => r.ok ? r.json() : null)
          .then(d => d?.gameToken ?? null)
          .catch(() => null)
      : Promise.resolve(null)

    Promise.all([playersFetch, tokenFetch])
      .then(([all, gameToken]: [Player[], string | null]) => {
        if (!isMounted.current) return
        if (gameToken) gameTokenRef.current = gameToken
        const filtered = all.filter(p => p.careerGames >= 80 && p.ebkScore >= 5 && p.ebkScore <= 88)
        const byGames = [...filtered].sort((a, b) => b.careerGames - a.careerGames).slice(0, 200)
        setAllPlayers(byGames)
        const seed = Math.floor(Math.random() * 1_000_000)
        setSequence(seededShuffle(byGames, seed).slice(0, TOTAL_PLAYERS))
        setScreen('playing')
      })
      .catch(() => { if (isMounted.current) setScreen('error') })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function tryUnlock(milestone: string, currentStreak: number) {
    if (!user) return
    const isGauntlet = milestone === 'hl_gauntlet'
    if (isGauntlet && isMounted.current) setClaimStatus('pending')
    try {
      const res = await fetch('/api/higher-lower/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestone, streak: currentStreak, complete: isGauntlet, gameToken: gameTokenRef.current }),
      })
      if (!isMounted.current) return
      if (!res.ok) {
        if (isGauntlet) setClaimStatus('failed')
        return
      }
      const data = await res.json()
      if (data.unlocked) {
        const badge = BADGES.find(b => b.id === milestone)
        if (badge) {
          setUnlockedBadge({ id: badge.id, name: badge.name })
          if (isGauntlet) {
            setClaimStatus('unlocked')
          } else {
            if (badgeClearRef.current) clearTimeout(badgeClearRef.current)
            badgeClearRef.current = setTimeout(() => {
              if (isMounted.current) setUnlockedBadge(null)
            }, 5000)
          }
        }
      } else if (data.alreadyUnlocked) {
        if (isGauntlet) setClaimStatus('already')
      }
    } catch {
      if (isMounted.current && isGauntlet) setClaimStatus('failed')
    }
  }

  function guess(direction: 'higher' | 'lower') {
    if (screen !== 'playing' || sequence.length < 2 || idx >= sequence.length - 1) return
    if (isGuessingRef.current) return
    isGuessingRef.current = true
    if (timerRef.current) clearTimeout(timerRef.current)

    const current    = sequence[idx]
    const challenger = sequence[idx + 1]

    const tied     = challenger.ebkScore === current.ebkScore
    const actualDir = challenger.ebkScore > current.ebkScore ? 'higher' : 'lower'
    const correct  = tied || direction === actualDir

    setLastCorrect(correct)
    setLastTied(tied)
    setFlipKey(k => k + 1)
    setScreen('revealing')

    if (correct) {
      const newStreak = streak + 1
      setStreak(newStreak)
      setStreakBumpKey(k => k + 1)

      if (newStreak > bestStreak) {
        setBestStreak(newStreak)
        if (typeof window !== 'undefined') localStorage.setItem('hl_best', String(newStreak))
      }

      if (newStreak === 10) tryUnlock('hl_10', newStreak)
      if (newStreak === 25) tryUnlock('hl_25', newStreak)

      timerRef.current = setTimeout(() => {
        if (!isMounted.current) return
        isGuessingRef.current = false
        const nextIdx = idx + 1
        if (nextIdx >= sequence.length - 1) {
          tryUnlock('hl_gauntlet', newStreak)
          setScreen('complete')
        } else {
          setIdx(nextIdx)
          setLastCorrect(null)
          setLastTied(false)
          setScreen('playing')
        }
      }, 1400)
    } else {
      timerRef.current = setTimeout(() => {
        if (!isMounted.current) return
        isGuessingRef.current = false
        setScreen('gameover')
      }, 1700)
    }
  }

  function restart() {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (badgeClearRef.current) clearTimeout(badgeClearRef.current)
    isGuessingRef.current = false
    setIdx(0)
    setStreak(0)
    setStreakBumpKey(0)
    setFlipKey(0)
    setLastCorrect(null)
    setLastTied(false)
    setUnlockedBadge(null)
    setClaimStatus(null)
    if (allPlayers.length > 0) {
      const seed = Math.floor(Math.random() * 1_000_000)
      setSequence(seededShuffle(allPlayers, seed).slice(0, TOTAL_PLAYERS))
    }
    // Snapshot the current best streak so gameover can correctly detect a new record
    // after this session (streak is reset above; bestStreak reflects the all-time high).
    sessionBestRef.current = bestStreak

    // Fetch a fresh game token for the new session so the previous gauntlet's
    // consumed nonce does not block milestone claims in the next play-through.
    // We hold at 'loading' until the token arrives (or fails) to guarantee that
    // gameTokenRef is populated before the player can trigger a badge claim.
    // Without this guard a fast player could reach streak=10 in the window
    // between setScreen('playing') and the token fetch resolving, causing the
    // /complete POST to send gameToken: null and receive a 403.
    if (user) {
      gameTokenRef.current = null
      setScreen('loading')
      fetch('/api/higher-lower/start')
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.gameToken) gameTokenRef.current = d.gameToken
          if (isMounted.current) setScreen('playing')
        })
        .catch(() => { if (isMounted.current) setScreen('playing') })
    } else {
      setScreen('playing')
    }
  }

  /* ── LOADING ────────────────────────────────────────────────────────────── */
  if (screen === 'loading') {
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
          <p className="text-label tracking-[0.3em] animate-ellipsis">LOADING PLAYERS</p>
          <p className="text-white/25 text-xs mt-2">Fetching the roster...</p>
        </div>
      </div>
    )
  }

  /* ── ERROR ──────────────────────────────────────────────────────────────── */
  if (screen === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 animate-fade-in">
        <div className="max-w-sm w-full text-center">
          <div className="card-accent p-8 mb-4">
            <div className="w-14 h-14 rounded-full bg-red-900/30 border border-red-500/30 flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>
            <h2 className="font-display text-2xl text-white mb-2">Couldn&apos;t Load Players</h2>
            <p className="text-white/50 text-sm leading-relaxed mb-6">
              Something went wrong fetching the roster. Check your connection and try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary w-full"
            >
              Retry
            </button>
          </div>
          <Link href="/lobby" className="text-white/30 hover:text-white/60 text-xs transition-colors">
            ← Back to Lobby
          </Link>
        </div>
      </div>
    )
  }

  const totalComparisons = sequence.length > 1 ? sequence.length - 1 : 66
  const current    = sequence[idx]
  const challenger = sequence[idx + 1]

  /* ── GAME OVER ──────────────────────────────────────────────────────────── */
  if (screen === 'gameover') {
    const correctDir = challenger && current
      ? (challenger.ebkScore > current.ebkScore ? 'HIGHER' : challenger.ebkScore < current.ebkScore ? 'LOWER' : 'THE SAME')
      : ''
    // Use the pre-session snapshot so tying an old record does not falsely
    // show "New Personal Best!" — only strictly beating it qualifies.
    const isNewRecord = streak > 0 && streak > sessionBestRef.current
    // Encouraging messages based on streak length
    const encouragement =
      streak === 0 ? "Everyone starts somewhere. Jump back in!" :
      streak < 5   ? "Getting started — keep at it!" :
      streak < 10  ? "Nice run! You're getting the hang of it." :
      streak < 20  ? "Impressive! You really know these players." :
                     "Elite basketball IQ. Truly."

    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10">
        <div className="max-w-md w-full text-center">
          {/* ── Outcome header ── */}
          <div className="mb-4 animate-loss-drop">
            <div className="font-display text-6xl sm:text-7xl text-red-500/70 leading-none select-none">RIP</div>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl text-white leading-none mb-1 animate-fade-up-1">Game Over</h1>
          <p className="text-white/40 text-sm mb-5 animate-fade-up-1">{encouragement}</p>

          {/* ── What went wrong ── */}
          {current && challenger && (
            <div className="card-surface rounded-2xl px-4 py-4 mb-5 text-sm text-left animate-fade-up-2">
              <p className="text-white/55 leading-relaxed mb-3">
                <span className="text-white/90 font-bold">{challenger.firstName} {challenger.lastName}</span>
                {' '}had{' '}
                <span className={`font-black ${correctDir === 'HIGHER' ? 'text-orange-400' : correctDir === 'LOWER' ? 'text-blue-400' : 'text-yellow-400'}`}>{correctDir} EBK</span>
                {' '}than {current.firstName} {current.lastName}
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-white/[0.04] rounded-xl px-3 py-2.5 text-center">
                  <div className="text-white/40 text-[10px] font-black uppercase tracking-wide truncate mb-1">{current.lastName}</div>
                  <div className="font-display text-3xl text-white/80 leading-none tabular-nums">{current.ebkScore.toFixed(1)}</div>
                  <div className="text-white/25 text-[9px] mt-1 font-bold">EBK</div>
                </div>
                <div className="shrink-0 text-center">
                  <div className={`font-display text-xl leading-none ${correctDir === 'HIGHER' ? 'text-orange-500' : correctDir === 'LOWER' ? 'text-blue-500' : 'text-yellow-400'}`}>
                    {correctDir === 'HIGHER' ? '▲' : correctDir === 'LOWER' ? '▼' : '='}
                  </div>
                </div>
                <div className="flex-1 bg-red-950/25 rounded-xl px-3 py-2.5 text-center border border-red-700/25">
                  <div className="text-red-300/50 text-[10px] font-black uppercase tracking-wide truncate mb-1">{challenger.lastName}</div>
                  <div className="font-display text-3xl text-red-400 leading-none tabular-nums">{challenger.ebkScore.toFixed(1)}</div>
                  <div className="text-red-300/30 text-[9px] mt-1 font-bold">EBK</div>
                </div>
              </div>
              <p className="text-white/25 text-[10px] mt-2.5 font-bold text-center tracking-wide">Higher EBK = more obscure · Lower EBK = bigger career</p>
            </div>
          )}

          {/* ── Streak stats ── */}
          <div className={`rounded-2xl p-6 mb-6 animate-scale-in overflow-hidden relative ${
            isNewRecord
              ? 'bg-gradient-to-br from-yellow-950/40 to-orange-950/30 border border-yellow-500/30 shadow-[0_0_32px_rgba(234,179,8,0.1)]'
              : 'card-stat'
          }`}>
            {isNewRecord && (
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(234,179,8,0.07) 0%, transparent 70%)' }} />
            )}
            {isNewRecord && (
              <div className="relative mb-4 flex items-center justify-center gap-2">
                <div className="h-px flex-1 bg-yellow-500/20" />
                <span className="text-[10px] font-black text-yellow-500/80 uppercase tracking-[0.2em]">New Personal Best!</span>
                <div className="h-px flex-1 bg-yellow-500/20" />
              </div>
            )}
            <div className="relative grid grid-cols-2 gap-6">
              <div className="text-center">
                <div className="font-display text-7xl text-orange-400 leading-none tabular-nums">{streak}</div>
                <div className="text-label mt-2">This Run</div>
                {streak >= 10 && (
                  <div className="text-[10px] font-black text-orange-400/60 mt-1.5">
                    {streak >= 25 ? 'EBK Savant level' : 'Stat Nerd level'}
                  </div>
                )}
              </div>
              <div className="text-center border-l border-white/[0.06]">
                <div className={`font-display text-7xl leading-none tabular-nums ${isNewRecord ? 'win-shimmer-text' : bestStreak > 0 ? 'text-yellow-400' : 'text-white/30'}`}>
                  {bestStreak}
                </div>
                <div className="text-label mt-2">Personal Best</div>
                {!user && (
                  <div className="text-white/25 text-[10px] mt-1.5">log in to save</div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-center animate-fade-up-3">
            <button onClick={restart} className="btn-primary min-w-[120px]">
              Try Again
            </button>
            <Link href="/lobby" className="btn-secondary min-w-[100px]">
              Lobby
            </Link>
          </div>
        </div>
      </div>
    )
  }

  /* ── COMPLETE / GAUNTLET ────────────────────────────────────────────────── */
  if (screen === 'complete') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10">
        <div className="max-w-md w-full text-center">
          {claimStatus === 'unlocked' && unlockedBadge && (
            <div className="mb-6 bg-yellow-900/30 border border-yellow-500/50 rounded-2xl px-6 py-4 animate-slide-up">
              <div className="text-yellow-500 text-xs font-black uppercase tracking-widest mb-1">Badge Unlocked</div>
              <div className="text-white font-black text-xl">{unlockedBadge.name}</div>
            </div>
          )}

          <div className="font-display text-6xl sm:text-7xl text-orange-500 leading-none mb-2 select-none animate-win-pop">⚡</div>
          <h1 className="font-display text-4xl sm:text-5xl text-orange-500 leading-none mb-2 animate-fade-up-1">The Gauntlet</h1>
          <p className="text-white/60 text-sm mb-1 animate-fade-up-2">You ran the full {totalComparisons}-question gauntlet.</p>

          {!user && <p className="text-white/50 text-sm mb-6">Log in to claim the one-of-a-kind badge.</p>}
          {user && claimStatus === 'pending' && (
            <p className="text-white/60 text-sm mb-6 flex items-center justify-center gap-2">
              <span className="w-3 h-3 rounded-full border border-orange-500 border-t-transparent animate-spin inline-block" />
              Claiming your badge...
            </p>
          )}
          {user && claimStatus === 'already' && <p className="text-white/60 text-sm mb-6">You&apos;ve already earned this badge.</p>}
          {user && claimStatus === 'failed' && <p className="text-red-400 text-sm mb-6">Couldn&apos;t claim badge — try refreshing.</p>}
          {user && claimStatus === null && (
            <p className="text-white/60 text-sm mb-6 flex items-center justify-center gap-2">
              <span className="w-3 h-3 rounded-full border border-orange-500 border-t-transparent animate-spin inline-block" />
              Claiming your badge...
            </p>
          )}

          <div className="card-accent p-6 mb-6 animate-fade-up-2">
            <div className="font-display text-7xl text-orange-400 leading-none tabular-nums">{streak}</div>
            <div className="text-label mt-2">Final Streak</div>
            {streak > 0 && streak > sessionBestRef.current && (
              <div className="mt-3 flex items-center justify-center gap-2">
                <div className="h-px flex-1 bg-yellow-500/20" />
                <span className="text-[10px] font-black text-yellow-500/70 uppercase tracking-widest">Personal Best</span>
                <div className="h-px flex-1 bg-yellow-500/20" />
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-center animate-fade-up-3">
            <button onClick={restart} className="btn-primary min-w-[120px]">
              Play Again
            </button>
            <Link href="/lobby" className="btn-secondary min-w-[100px]">
              Lobby
            </Link>
          </div>
        </div>
      </div>
    )
  }

  /* ── EMPTY STATE ────────────────────────────────────────────────────────── */
  if (!current || !challenger) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 animate-fade-in">
        <div className="max-w-sm w-full text-center">
          <div className="card-accent p-8">
            <div className="empty-state-icon">🏀</div>
            <div className="empty-state-title mb-2">No Players Found</div>
            <div className="empty-state-body mb-6">
              The player pool couldn&apos;t be assembled right now. Try again.
            </div>
            <button onClick={() => window.location.reload()} className="btn-primary w-full">
              Reload Game
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── PLAYING / REVEALING ────────────────────────────────────────────────── */
  const progressPct = Math.min(100, (streak / totalComparisons) * 100)
  const badge10Pct  = (10 / totalComparisons) * 100
  const badge25Pct  = (25 / totalComparisons) * 100
  const isRevealing = screen === 'revealing'
  const isTie       = isRevealing && lastTied

  const heatLabel = streakHeat(streak)

  // Challenger card border/glow state
  const challengerCardClass = isRevealing
    ? lastCorrect
      ? `bg-green-900/15 border-green-500/70 ${lastCorrect ? 'animate-reveal-glow-correct' : ''}`
      : `bg-red-900/15 border-red-500/60 animate-reveal-glow-wrong`
    : 'bg-[#111118] border-white/[0.07] border-dashed'

  return (
    <div className="min-h-screen px-4 py-6 sm:py-8">

      {/* Badge toast */}
      {unlockedBadge && (
        <div className="toast toast-badge">
          <span className="text-xl leading-none shrink-0">🏅</span>
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest mb-0.5 text-yellow-400/70">Badge Unlocked</div>
            <div className="font-black text-sm leading-tight">{unlockedBadge.name}</div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-5 animate-fade-up">
          <Link
            href="/lobby"
            className="text-white/40 hover:text-white text-sm transition-colors flex items-center gap-1.5 min-h-[44px] min-w-[44px] -ml-1 px-1 rounded-xl hover:bg-white/[0.04]"
          >
            <span className="text-white/30 text-lg leading-none">←</span>
            <span className="hidden xs:inline">Lobby</span>
          </Link>
          <h1 className="font-display text-xl sm:text-2xl text-orange-500 leading-none tracking-wide">Higher or Lower</h1>
          <div className="text-white/50 text-xs tabular-nums font-bold bg-white/[0.04] px-2.5 py-1.5 rounded-lg border border-white/[0.06]">
            {idx + 1}<span className="text-white/25"> / {totalComparisons}</span>
          </div>
        </div>

        {/* ── Streak panel ──────────────────────────────────────────────── */}
        <div
          className={`p-4 mb-5 rounded-2xl border transition-all duration-300 animate-fade-up-1 ${
            streak >= 10
              ? 'card-accent bg-orange-950/10 border-orange-600/40 streak-fire-glow'
              : 'card-surface'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            {/* Streak counter */}
            <div className="flex items-center gap-3">
              <div
                key={streakBumpKey}
                className={`font-display leading-none tabular-nums transition-colors duration-200 ${
                  streak >= 10 ? 'text-6xl text-orange-400 animate-streak-bump' :
                  streak >= 3  ? 'text-5xl text-orange-300 animate-streak-bump' :
                  streak >= 1  ? 'text-5xl text-orange-200 animate-streak-bump' :
                  'text-5xl text-white/40'
                }`}
              >
                {streak}
              </div>
              <div>
                <div className="text-label">Streak</div>
                {heatLabel && (
                  <div className={`text-[11px] font-black leading-tight mt-0.5 tracking-wide ${
                    streak >= 25 ? 'text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.55)]' :
                    streak >= 10 ? 'text-orange-400 drop-shadow-[0_0_4px_rgba(249,115,22,0.45)]' :
                    streak >= 5  ? 'text-orange-300 drop-shadow-[0_0_3px_rgba(249,115,22,0.3)]' :
                    'text-orange-300/70'
                  }`}>
                    {streak >= 25 ? '🔥🔥🔥' : streak >= 10 ? '🔥🔥' : streak >= 5 ? '🔥' : '🌡️'} {heatLabel}
                  </div>
                )}
              </div>
            </div>

            {/* Personal best */}
            <div className="text-right">
              <div className="text-label mb-1">Personal Best</div>
              <div className={`font-display text-3xl leading-none tabular-nums ${bestStreak > 0 ? 'text-yellow-400' : 'text-white/25'}`}>
                {bestStreak > 0 ? bestStreak : '—'}
              </div>
              {!user && <div className="text-white/25 text-[10px] mt-1">log in to save</div>}
            </div>
          </div>

          {/* Progress track */}
          <div className="relative h-3 bg-black/50 rounded-full mb-1">
            <div
              className="absolute h-full rounded-full bg-gradient-to-r from-orange-700 to-orange-400 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
            {/* Milestone pip: 10 */}
            <div className="milestone-pip" style={{ left: `${badge10Pct}%` }}>
              <div className={`milestone-pip-dot ${
                streak >= 10
                  ? 'bg-cyan-400 border-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.7)] animate-milestone-pop'
                  : 'bg-white/[0.05] border-white/[0.15]'
              }`} />
            </div>
            {/* Milestone pip: 25 */}
            <div className="milestone-pip" style={{ left: `${badge25Pct}%` }}>
              <div className={`milestone-pip-dot ${
                streak >= 25
                  ? 'bg-indigo-400 border-indigo-300 shadow-[0_0_8px_rgba(129,140,248,0.7)] animate-milestone-pop'
                  : 'bg-white/[0.05] border-white/[0.15]'
              }`} />
            </div>
            {/* Milestone pip: Gauntlet */}
            <div className="absolute top-1/2 -translate-y-1/2" style={{ right: 0 }}>
              <div className={`milestone-pip-dot ${
                streak >= totalComparisons
                  ? 'bg-yellow-400 border-yellow-200 shadow-[0_0_8px_rgba(250,204,21,0.7)] animate-milestone-pop'
                  : 'bg-white/[0.05] border-white/[0.15]'
              }`} />
            </div>
          </div>

          {/* Milestone labels */}
          <div className="flex justify-between mt-1.5 text-[9px] font-bold uppercase tracking-wide">
            <span className={`transition-colors duration-300 ${streak >= 10 ? 'text-cyan-500' : 'text-white/20'}`}>Stat Nerd</span>
            <span className={`transition-colors duration-300 ${streak >= 25 ? 'text-indigo-400' : 'text-white/20'}`}>EBK Savant</span>
            <span className={`transition-colors duration-300 ${streak >= totalComparisons ? 'text-yellow-500' : 'text-white/20'}`}>Gauntlet ⚡</span>
          </div>
        </div>

        {/* ── EBK hint ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-1.5 mb-3 animate-fade-up-2">
          <span className="text-blue-400/70 text-[10px] font-black uppercase tracking-widest">Lower EBK = bigger career</span>
          <span className="text-white/20 text-[10px]">·</span>
          <span className="text-orange-400/70 text-[10px] font-black uppercase tracking-widest">Higher EBK = hidden gem</span>
        </div>

        {/* ── Player cards ──────────────────────────────────────────────── */}
        <div className="relative grid grid-cols-2 gap-3 mb-4 animate-fade-up-2">
          {/* VS divider */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
            <div className={`font-display text-xs leading-none px-2 py-1 rounded-lg border transition-all duration-300 ${
              isRevealing
                ? lastCorrect
                  ? 'text-green-400 border-green-500/40 bg-green-950/70'
                  : 'text-red-400 border-red-500/40 bg-red-950/70'
                : 'text-white/30 border-white/[0.07] bg-[#0d0d14]'
            }`}>VS</div>
          </div>

          {/* Current player — always revealed */}
          <div className="card-stat p-3 sm:p-4 flex flex-col min-w-0">
            <div className="text-label mb-2 text-orange-500/70">Current</div>
            <div className="font-black text-white text-sm leading-tight mb-0.5 truncate">
              {current.firstName} {current.lastName}
            </div>
            <div className="flex items-center gap-1.5 mb-3 min-w-0">
              <span className={`pos-badge pos-${current.position.toLowerCase()} shrink-0`}>{current.position}</span>
              <span className="text-white/40 text-xs truncate">{current.team}</span>
            </div>
            <div className="text-white/55 text-[11px] space-y-0.5 mb-3 flex-1">
              <div className="text-white/70">{current.careerGames} <span className="text-white/35">GP</span></div>
              <div>
                <span className="text-white/70">{current.careerPPG.toFixed(1)}</span> <span className="text-white/35">PPG</span>
                {' · '}<span className="text-white/70">{current.careerRPG.toFixed(1)}</span> <span className="text-white/35">RPG</span>
              </div>
              <div>
                <span className="text-white/70">{current.careerAPG.toFixed(1)}</span> <span className="text-white/35">APG</span>
              </div>
            </div>
            {/* EBK score highlight */}
            <div className="stat-highlight rounded-xl px-3 py-2.5 text-center">
              <div className="font-display text-4xl text-orange-400 leading-none tabular-nums">{current.ebkScore.toFixed(1)}</div>
              <div className="text-label mt-1">EBK Score</div>
            </div>
          </div>

          {/* Challenger — hidden until reveal, uses card-flip-scene for 3D depth */}
          <div className="card-flip-scene min-w-0">
            <div className={`rounded-2xl p-3 sm:p-4 border-2 transition-colors duration-300 flex flex-col h-full min-w-0 ${challengerCardClass}`}>
              <div className={`text-label mb-2 ${
                isRevealing && lastCorrect  ? 'text-green-500/70' :
                isRevealing && !lastCorrect ? 'text-red-500/70' :
                'text-white/30'
              }`}>
                Challenger
              </div>
              <div className="font-black text-white text-sm leading-tight mb-0.5 truncate">
                {challenger.firstName} {challenger.lastName}
              </div>
              <div className="flex items-center gap-1.5 mb-3 min-w-0">
                <span className={`pos-badge pos-${challenger.position.toLowerCase()} shrink-0`}>{challenger.position}</span>
                <span className="text-white/40 text-xs truncate">{challenger.team}</span>
              </div>

              {isRevealing ? (
                /* Revealed state — 3D flip entrance */
                <div key={flipKey} className="flex flex-col flex-1 animate-card-reveal">
                  <div className="text-white/55 text-[11px] space-y-0.5 mb-3 flex-1">
                    <div className="text-white/70">{challenger.careerGames} <span className="text-white/35">GP</span></div>
                    <div>
                      <span className="text-white/70">{challenger.careerPPG.toFixed(1)}</span> <span className="text-white/35">PPG</span>
                      {' · '}<span className="text-white/70">{challenger.careerRPG.toFixed(1)}</span> <span className="text-white/35">RPG</span>
                    </div>
                    <div>
                      <span className="text-white/70">{challenger.careerAPG.toFixed(1)}</span> <span className="text-white/35">APG</span>
                    </div>
                  </div>
                  <div className={`rounded-xl px-3 py-2.5 text-center ${
                    isTie       ? 'bg-yellow-900/40 border border-yellow-700/40' :
                    lastCorrect ? 'bg-green-900/40  border border-green-700/40' :
                                  'bg-red-900/40    border border-red-700/40'
                  }`}>
                    <div className={`font-display text-4xl leading-none tabular-nums ${
                      isTie       ? 'text-yellow-400' :
                      lastCorrect ? 'text-green-400' :
                                    'text-red-400'
                    }`}>
                      {challenger.ebkScore.toFixed(1)}
                    </div>
                    {/* Arrow showing direction vs current */}
                    <div className="flex items-center justify-center gap-1 mt-1">
                      {!isTie && (
                        <span className={`text-xs font-black ${lastCorrect ? 'text-green-500/80' : 'text-red-500/80'}`}>
                          {challenger.ebkScore > current.ebkScore ? '▲' : '▼'}
                          {' '}{Math.abs(challenger.ebkScore - current.ebkScore).toFixed(1)}
                        </span>
                      )}
                      {isTie && (
                        <span className="text-xs font-black text-yellow-500/80">= Tie</span>
                      )}
                    </div>
                    <div className="text-label mt-0.5">EBK Score</div>
                  </div>
                </div>
              ) : (
                /* Hidden state */
                <div className="flex flex-col flex-1">
                  <div className="text-white/15 text-[11px] space-y-0.5 mb-3 flex-1 select-none">
                    <div>— GP</div>
                    <div>—.— PPG · —.— RPG</div>
                    <div>—.— APG</div>
                  </div>
                  <div className="rounded-xl px-3 py-2.5 text-center border border-dashed border-orange-900/30 bg-orange-950/10">
                    <div className="font-display text-4xl text-white/15 leading-none select-none tracking-widest">???</div>
                    <div className="text-label mt-1">EBK Score</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Action buttons ────────────────────────────────────────────── */}
        {!isRevealing && (
          <>
          <div className="grid grid-cols-2 gap-3 animate-fade-up-3">
            {/* LOWER */}
            <button
              onClick={() => guess('lower')}
              aria-label="Guess lower EBK score (keyboard: L or Arrow Down)"
              className="btn-hl-lower py-5 sm:py-7 text-center w-full min-h-[80px] sm:min-h-[96px]"
            >
              <div className="hl-arrow font-display text-3xl sm:text-5xl text-blue-400 leading-none mb-1.5">▼</div>
              <div className="text-sm sm:text-base font-black tracking-wider uppercase text-blue-200/90">Lower EBK</div>
              <div className="text-[10px] text-blue-400/50 mt-0.5 font-semibold hidden sm:block">bigger career</div>
            </button>

            {/* HIGHER */}
            <button
              onClick={() => guess('higher')}
              aria-label="Guess higher EBK score (keyboard: H or Arrow Up)"
              className="btn-hl-higher py-5 sm:py-7 text-center w-full min-h-[80px] sm:min-h-[96px]"
            >
              <div className="hl-arrow font-display text-3xl sm:text-5xl text-orange-400 leading-none mb-1.5">▲</div>
              <div className="text-sm sm:text-base font-black tracking-wider uppercase text-orange-200/90">Higher EBK</div>
              <div className="text-[10px] text-orange-400/50 mt-0.5 font-semibold hidden sm:block">unknown gem</div>
            </button>
          </div>
          <p className="text-center text-[10px] text-white/20 mt-2 tracking-wide hidden sm:block">
            Keyboard: <kbd className="bg-white/[0.06] border border-white/[0.10] rounded px-1.5 py-0.5 text-[10px] font-mono text-white/30">H</kbd> or <kbd className="bg-white/[0.06] border border-white/[0.10] rounded px-1.5 py-0.5 text-[10px] font-mono text-white/30">↑</kbd> Higher &nbsp;·&nbsp; <kbd className="bg-white/[0.06] border border-white/[0.10] rounded px-1.5 py-0.5 text-[10px] font-mono text-white/30">L</kbd> or <kbd className="bg-white/[0.06] border border-white/[0.10] rounded px-1.5 py-0.5 text-[10px] font-mono text-white/30">↓</kbd> Lower
          </p>
          </>
        )}

        {/* ── Reveal verdict ────────────────────────────────────────────── */}
        {isRevealing && (
          <div className={`flex flex-col items-center justify-center min-h-[80px] sm:min-h-[88px] py-4 rounded-2xl border transition-all duration-300 ${
            isTie
              ? 'bg-yellow-950/20 border-yellow-700/30'
              : lastCorrect
                ? 'bg-green-950/20 border-green-700/30 animate-correct-flash'
                : 'bg-red-950/20 border-red-700/30 animate-wrong-shake'
          }`}>
            <span
              className={`font-display text-3xl sm:text-4xl animate-verdict-pop ${
                isTie       ? 'text-yellow-400' :
                lastCorrect ? 'text-green-400' :
                              'text-red-400'
              }`}
            >
              {isTie ? '~ Tie — Free Pass!' : lastCorrect ? '✓  Correct!' : '✗  Wrong!'}
            </span>
            {!lastCorrect && !isTie && (
              <p className="text-red-300/50 text-xs font-bold mt-1.5 tracking-wide">
                Next up after reveal…
              </p>
            )}
          </div>
        )}

      </div>

      {/* Explore More */}
      <div className="max-w-2xl mx-auto px-0 pb-16 sm:pb-8 mt-6">
        <p className="text-center text-xs font-bold text-white/25 tracking-[0.2em] uppercase mb-3">Explore More</p>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/fun-facts" className="card-surface explore-card p-4 hover:border-orange-700/40 hover:bg-orange-950/10 group rounded-xl">
            <p className="font-black text-white/75 text-sm mb-1 group-hover:text-orange-300 transition-colors">Fun Facts</p>
            <p className="text-white/35 text-xs leading-relaxed">NBA earnings in wild perspective</p>
          </Link>
          <Link href="/salary" className="card-surface explore-card p-4 hover:border-orange-700/40 hover:bg-orange-950/10 group rounded-xl">
            <p className="font-black text-white/75 text-sm mb-1 group-hover:text-orange-300 transition-colors">Salary Rankings</p>
            <p className="text-white/35 text-xs leading-relaxed">Who got paid most in NBA history</p>
          </Link>
        </div>
      </div>
    </div>
  )
}
