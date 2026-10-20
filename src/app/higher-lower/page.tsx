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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const badgeClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMounted = useRef(true)
  const isGuessingRef = useRef(false)
  // Server-issued game session token — required when claiming a badge to prove
  // this request originated from an actual game session rather than a direct API call.
  const gameTokenRef = useRef<string | null>(null)

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
      }, 1300)
    } else {
      timerRef.current = setTimeout(() => {
        if (!isMounted.current) return
        isGuessingRef.current = false
        setScreen('gameover')
      }, 1600)
    }
  }

  function restart() {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (badgeClearRef.current) clearTimeout(badgeClearRef.current)
    isGuessingRef.current = false
    setIdx(0)
    setStreak(0)
    setStreakBumpKey(0)
    setLastCorrect(null)
    setLastTied(false)
    setUnlockedBadge(null)
    setClaimStatus(null)
    if (allPlayers.length > 0) {
      const seed = Math.floor(Math.random() * 1_000_000)
      setSequence(seededShuffle(allPlayers, seed).slice(0, TOTAL_PLAYERS))
    }
    // Fetch a fresh game token for the new session so the previous gauntlet's
    // consumed nonce does not block milestone claims in the next play-through.
    if (user) {
      gameTokenRef.current = null
      fetch('/api/higher-lower/start')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.gameToken) gameTokenRef.current = d.gameToken })
        .catch(() => {})
    }
    setScreen('playing')
  }

  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (screen === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-gray-400 mb-4">Couldn&apos;t load players. Check your connection and try again.</p>
          <button onClick={() => window.location.reload()} className="btn-primary">Retry</button>
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
    const isNewRecord = streak > 0 && streak >= bestStreak
    // Encouraging messages based on streak length
    const encouragement =
      streak === 0 ? "Everyone starts somewhere. Jump back in!" :
      streak < 5   ? "Getting started — keep at it!" :
      streak < 10  ? "Nice run! You're getting the hang of it." :
      streak < 20  ? "Impressive! You really know these players." :
                     "Elite basketball IQ. Truly."

    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          {/* ── Outcome header ── */}
          <div className="mb-4 animate-loss-drop">
            <div className="font-display text-6xl sm:text-7xl text-red-500/70 leading-none select-none">RIP</div>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl text-white leading-none mb-1 animate-fade-up-1">Game Over</h1>
          <p className="text-gray-500 text-sm mb-4 animate-fade-up-1">{encouragement}</p>

          {/* ── What went wrong ── */}
          {current && challenger && (
            <div className="card-surface rounded-2xl px-4 py-3 mb-5 text-sm text-left animate-fade-up-2">
              <p className="text-gray-400 leading-relaxed">
                <span className="text-white/90 font-bold">{challenger.firstName} {challenger.lastName}</span>
                {' '}had{' '}
                <span className="text-orange-400 font-bold">{correctDir} EBK</span>
                {' '}than {current.firstName} {current.lastName}
              </p>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex-1 bg-white/[0.04] rounded-lg px-3 py-1.5 text-center">
                  <div className="text-white/60 text-[10px] font-bold uppercase tracking-wide truncate">{current.lastName}</div>
                  <div className="font-display text-lg text-white/80 leading-none tabular-nums">{current.ebkScore.toFixed(1)}</div>
                </div>
                <div className="text-gray-700 font-display text-sm">VS</div>
                <div className="flex-1 bg-orange-950/30 rounded-lg px-3 py-1.5 text-center border border-orange-700/20">
                  <div className="text-orange-300/60 text-[10px] font-bold uppercase tracking-wide truncate">{challenger.lastName}</div>
                  <div className="font-display text-lg text-orange-400 leading-none tabular-nums">{challenger.ebkScore.toFixed(1)}</div>
                </div>
              </div>
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
              <div className="relative mb-3 flex items-center justify-center gap-2">
                <div className="h-px flex-1 bg-yellow-500/20" />
                <span className="text-[10px] font-black text-yellow-500/80 uppercase tracking-[0.2em]">New Personal Best!</span>
                <div className="h-px flex-1 bg-yellow-500/20" />
              </div>
            )}
            <div className="relative grid grid-cols-2 gap-6">
              <div className="text-center">
                <div className="font-display text-6xl text-orange-400 leading-none tabular-nums">{streak}</div>
                <div className="text-label mt-2">This Run</div>
                {streak >= 10 && (
                  <div className="text-[10px] font-black text-orange-400/60 mt-1">
                    {streak >= 25 ? 'EBK Savant level' : streak >= 10 ? 'Stat Nerd level' : ''}
                  </div>
                )}
              </div>
              <div className="text-center border-l border-white/[0.06]">
                <div className={`font-display text-6xl leading-none tabular-nums ${isNewRecord ? 'win-shimmer-text' : bestStreak > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
                  {bestStreak}
                </div>
                <div className="text-label mt-2">Personal Best</div>
                {!user && bestStreak === 0 && (
                  <div className="text-gray-700 text-[10px] mt-1">log in to save</div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-center animate-fade-up-3">
            <button onClick={restart} className="btn-primary">
              Try Again
            </button>
            <Link href="/lobby" className="btn-secondary">
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
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          {claimStatus === 'unlocked' && unlockedBadge && (
            <div className="mb-6 bg-yellow-900/30 border border-yellow-500/50 rounded-2xl px-6 py-4 animate-slide-up">
              <div className="text-yellow-500 text-xs font-black uppercase tracking-widest mb-1">Badge Unlocked</div>
              <div className="text-white font-black text-xl">{unlockedBadge.name}</div>
            </div>
          )}

          <div className="font-display text-6xl sm:text-7xl text-orange-500 leading-none mb-2 select-none animate-win-pop">⚡</div>
          <h1 className="font-display text-4xl sm:text-5xl text-orange-500 leading-none mb-2 animate-fade-up-1">The Gauntlet</h1>
          <p className="text-gray-400 text-sm mb-1 animate-fade-up-2">You ran the full {totalComparisons}-question gauntlet.</p>

          {!user && <p className="text-gray-400 text-sm mb-6">Log in to claim the one-of-a-kind badge.</p>}
          {user && claimStatus === 'pending' && <p className="text-gray-400 text-sm mb-6">Claiming your badge...</p>}
          {user && claimStatus === 'already' && <p className="text-gray-400 text-sm mb-6">You&apos;ve already earned this badge.</p>}
          {user && claimStatus === 'failed' && <p className="text-red-700 text-sm mb-6">Couldn&apos;t claim badge — try refreshing.</p>}
          {user && claimStatus === null && <p className="text-gray-400 text-sm mb-6">Claiming your badge...</p>}

          <div className="card-accent p-6 mb-6">
            <div className="font-display text-6xl text-orange-400 leading-none">{streak}</div>
            <div className="text-label mt-2">Final Streak</div>
          </div>

          <div className="flex gap-3 justify-center">
            <button onClick={restart} className="btn-primary">
              Play Again
            </button>
            <Link href="/lobby" className="btn-secondary">
              Lobby
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!current || !challenger) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">No players available</div>
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
      ? 'bg-green-900/15 border-green-500/70 shadow-[0_0_24px_rgba(34,197,94,0.14)]'
      : 'bg-red-900/15 border-red-500/60 shadow-[0_0_24px_rgba(239,68,68,0.14)]'
    : 'bg-[#111118] border-white/[0.07] border-dashed'

  return (
    <div className="min-h-screen px-4 py-8">

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
          <Link href="/lobby" className="text-gray-500 hover:text-white text-sm transition-colors flex items-center gap-1">
            <span className="text-gray-600">←</span> Lobby
          </Link>
          <h1 className="font-display text-xl sm:text-2xl text-orange-500 leading-none tracking-wide">Higher or Lower</h1>
          <div className="text-gray-600 text-xs tabular-nums font-bold bg-white/[0.04] px-2 py-1 rounded-lg border border-white/[0.06]">
            {idx + 1}<span className="text-gray-700"> / {totalComparisons}</span>
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
            <div className="flex items-center gap-2.5">
              <div
                key={streakBumpKey}
                className={`font-display leading-none tabular-nums transition-colors duration-200 ${
                  streak >= 10 ? 'text-5xl text-orange-400 animate-streak-bump' :
                  streak >= 3  ? 'text-4xl text-orange-300 animate-streak-bump' :
                  streak >= 1  ? 'text-4xl text-orange-200 animate-streak-bump' :
                  'text-4xl text-white'
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
              <div className="text-label mb-0.5">Personal Best</div>
              <div className={`font-display text-2xl leading-none tabular-nums ${bestStreak > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
                {bestStreak}
              </div>
              {!user && <div className="text-gray-700 text-[10px] mt-0.5">log in to save</div>}
            </div>
          </div>

          {/* Progress track */}
          <div className="relative h-2.5 bg-black/50 rounded-full">
            <div
              className="absolute h-full rounded-full bg-gradient-to-r from-orange-700 to-orange-400 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
            {/* Milestone: 10 */}
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                 style={{ left: `${badge10Pct}%` }}>
              <div className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-300 ${streak >= 10 ? 'bg-cyan-400 border-cyan-300 shadow-[0_0_6px_rgba(34,211,238,0.6)]' : 'bg-white/[0.05] border-white/[0.15]'}`} />
            </div>
            {/* Milestone: 25 */}
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                 style={{ left: `${badge25Pct}%` }}>
              <div className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-300 ${streak >= 25 ? 'bg-indigo-400 border-indigo-300 shadow-[0_0_6px_rgba(129,140,248,0.6)]' : 'bg-white/[0.05] border-white/[0.15]'}`} />
            </div>
            {/* Milestone: Gauntlet */}
            <div className="absolute top-1/2 -translate-y-1/2" style={{ right: 0 }}>
              <div className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-300 ${streak >= totalComparisons ? 'bg-yellow-400 border-yellow-200 shadow-[0_0_6px_rgba(250,204,21,0.6)]' : 'bg-white/[0.05] border-white/[0.15]'}`} />
            </div>
          </div>

          <div className="flex justify-between mt-2.5 text-[9px] font-bold uppercase tracking-wide">
            <span className={`transition-colors duration-300 ${streak >= 10 ? 'text-cyan-600' : 'text-gray-700'}`}>Stat Nerd</span>
            <span className={`transition-colors duration-300 ${streak >= 25 ? 'text-indigo-500' : 'text-gray-700'}`}>EBK Savant</span>
            <span className={`transition-colors duration-300 ${streak >= totalComparisons ? 'text-yellow-600' : 'text-gray-700'}`}>Gauntlet ⚡</span>
          </div>
        </div>

        {/* ── Player cards ──────────────────────────────────────────────── */}
        <div className="relative grid grid-cols-2 gap-3 mb-4 animate-fade-up-2">
          {/* VS divider */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
            <div className={`font-display text-xs leading-none px-2 py-1 rounded-lg border transition-all duration-300 ${
              isRevealing
                ? lastCorrect
                  ? 'text-green-400 border-green-500/40 bg-green-950/60'
                  : 'text-red-400 border-red-500/40 bg-red-950/60'
                : 'text-gray-600 border-white/[0.07] bg-[#0d0d14]'
            }`}>VS</div>
          </div>

          {/* Current player — always revealed */}
          <div className="card-stat p-4 flex flex-col">
            <div className="text-label mb-2.5 text-orange-500/70">Current</div>
            <div className="font-black text-white text-sm leading-tight mb-0.5">
              {current.firstName} {current.lastName}
            </div>
            <div className="flex items-center gap-1.5 mb-3">
              <span className={`pos-badge pos-${current.position.toLowerCase()}`}>{current.position}</span>
              <span className="text-gray-500 text-xs truncate">{current.team}</span>
            </div>
            <div className="text-gray-400 text-[11px] space-y-0.5 mb-3 flex-1">
              <div className="text-gray-300">{current.careerGames} <span className="text-gray-500">GP</span></div>
              <div>
                <span className="text-gray-300">{current.careerPPG.toFixed(1)}</span> <span className="text-gray-500">PPG</span>
                {' · '}<span className="text-gray-300">{current.careerRPG.toFixed(1)}</span> <span className="text-gray-500">RPG</span>
                {' · '}<span className="text-gray-300">{current.careerAPG.toFixed(1)}</span> <span className="text-gray-500">APG</span>
              </div>
            </div>
            {/* EBK score highlight */}
            <div className="stat-highlight rounded-xl px-3 py-2.5 text-center">
              <div className="font-display text-4xl text-orange-400 leading-none">{current.ebkScore.toFixed(1)}</div>
              <div className="text-label mt-1">EBK Score</div>
            </div>
          </div>

          {/* Challenger — hidden until reveal */}
          <div className={`rounded-2xl p-4 border-2 transition-all duration-300 flex flex-col ${challengerCardClass}`}>
            <div className={`text-label mb-2.5 ${
              isRevealing && lastCorrect  ? 'text-green-500/70' :
              isRevealing && !lastCorrect ? 'text-red-500/70' :
              'text-gray-600'
            }`}>
              Challenger
            </div>
            <div className="font-black text-white text-sm leading-tight mb-0.5">
              {challenger.firstName} {challenger.lastName}
            </div>
            <div className="flex items-center gap-1.5 mb-3">
              <span className={`pos-badge pos-${challenger.position.toLowerCase()}`}>{challenger.position}</span>
              <span className="text-gray-500 text-xs truncate">{challenger.team}</span>
            </div>

            {isRevealing ? (
              /* Revealed state — animate in */
              <div className="flex flex-col flex-1 animate-card-reveal">
                <div className="text-gray-400 text-[11px] space-y-0.5 mb-3 flex-1">
                  <div className="text-gray-300">{challenger.careerGames} <span className="text-gray-500">GP</span></div>
                  <div>
                    <span className="text-gray-300">{challenger.careerPPG.toFixed(1)}</span> <span className="text-gray-500">PPG</span>
                    {' · '}<span className="text-gray-300">{challenger.careerRPG.toFixed(1)}</span> <span className="text-gray-500">RPG</span>
                    {' · '}<span className="text-gray-300">{challenger.careerAPG.toFixed(1)}</span> <span className="text-gray-500">APG</span>
                  </div>
                </div>
                <div className={`rounded-xl px-3 py-2.5 text-center ${
                  isTie       ? 'bg-yellow-900/40 border border-yellow-700/40' :
                  lastCorrect ? 'bg-green-900/40  border border-green-700/40' :
                                'bg-red-900/40    border border-red-700/40'
                }`}>
                  <div className={`font-display text-4xl leading-none ${
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
                <div className="text-gray-700 text-[11px] space-y-0.5 mb-3 flex-1 select-none">
                  <div>— GP</div>
                  <div>—.— PPG · —.— RPG</div>
                </div>
                <div className="rounded-xl px-3 py-2.5 text-center border border-dashed border-orange-900/30 bg-orange-950/10">
                  <div className="font-display text-4xl text-gray-700 leading-none select-none tracking-widest">???</div>
                  <div className="text-label mt-1">EBK Score</div>
                </div>
              </div>
            )}
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
              className="btn-hl-lower py-5 sm:py-6 text-center w-full"
            >
              <div className="hl-arrow font-display text-3xl sm:text-4xl text-blue-400 leading-none mb-1.5">▼</div>
              <div className="text-xs sm:text-sm font-black tracking-wider uppercase text-blue-200/90">Lower EBK</div>
              <div className="text-[10px] text-blue-400/50 mt-0.5 font-semibold">bigger career</div>
            </button>

            {/* HIGHER */}
            <button
              onClick={() => guess('higher')}
              aria-label="Guess higher EBK score (keyboard: H or Arrow Up)"
              className="btn-hl-higher py-5 sm:py-6 text-center w-full"
            >
              <div className="hl-arrow font-display text-3xl sm:text-4xl text-orange-400 leading-none mb-1.5">▲</div>
              <div className="text-xs sm:text-sm font-black tracking-wider uppercase text-orange-200/90">Higher EBK</div>
              <div className="text-[10px] text-orange-400/50 mt-0.5 font-semibold">unknown gem</div>
            </button>
          </div>
          <p className="text-center text-[10px] text-gray-700 mt-2 tracking-wide hidden sm:block">
            Keyboard: <kbd className="bg-white/[0.06] border border-white/[0.10] rounded px-1.5 py-0.5 text-[10px] font-mono text-gray-500">H</kbd> or <kbd className="bg-white/[0.06] border border-white/[0.10] rounded px-1.5 py-0.5 text-[10px] font-mono text-gray-500">↑</kbd> Higher &nbsp;·&nbsp; <kbd className="bg-white/[0.06] border border-white/[0.10] rounded px-1.5 py-0.5 text-[10px] font-mono text-gray-500">L</kbd> or <kbd className="bg-white/[0.06] border border-white/[0.10] rounded px-1.5 py-0.5 text-[10px] font-mono text-gray-500">↓</kbd> Lower
          </p>
          </>
        )}

        {/* ── Reveal verdict ────────────────────────────────────────────── */}
        {isRevealing && (
          <div className={`flex items-center justify-center h-[80px] rounded-2xl border transition-all duration-300 ${
            isTie
              ? 'bg-yellow-950/20 border-yellow-700/30'
              : lastCorrect
                ? 'bg-green-950/20 border-green-700/30 animate-correct-flash'
                : 'bg-red-950/20 border-red-700/30 animate-wrong-shake'
          }`}>
            <span
              className={`font-display text-4xl animate-verdict-pop ${
                isTie       ? 'text-yellow-400' :
                lastCorrect ? 'text-green-400' :
                              'text-red-400'
              }`}
            >
              {isTie ? '~ Tie — Free Pass!' : lastCorrect ? '✓  Correct!' : '✗  Wrong!'}
            </span>
          </div>
        )}

      </div>

      {/* Explore More */}
      <div className="max-w-2xl mx-auto px-4 pb-16 sm:pb-8 mt-6">
        <p className="text-center text-xs font-bold text-gray-600 tracking-[0.2em] uppercase mb-3">Explore More</p>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/fun-facts" className="card-surface explore-card p-4 hover:border-orange-700/40 hover:bg-orange-950/10 group rounded-xl">
            <p className="font-black text-white/80 text-sm mb-1 group-hover:text-orange-300 transition-colors">Fun Facts</p>
            <p className="text-gray-600 text-xs leading-relaxed">NBA earnings in wild perspective</p>
          </Link>
          <Link href="/salary" className="card-surface explore-card p-4 hover:border-orange-700/40 hover:bg-orange-950/10 group rounded-xl">
            <p className="font-black text-white/80 text-sm mb-1 group-hover:text-orange-300 transition-colors">Salary Rankings</p>
            <p className="text-gray-600 text-xs leading-relaxed">Who got paid most in NBA history</p>
          </Link>
        </div>
      </div>
    </div>
  )
}
