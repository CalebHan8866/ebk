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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const badgeClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMounted = useRef(true)
  const isGuessingRef = useRef(false)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      if (badgeClearRef.current) clearTimeout(badgeClearRef.current)
    }
  }, [])

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? parseInt(localStorage.getItem('hl_best') || '0') : 0
    setBestStreak(saved)

    fetch('/api/players')
      .then(r => r.json())
      .then((all: Player[]) => {
        if (!isMounted.current) return
        const filtered = all.filter(p => p.careerGames >= 80 && p.ebkScore >= 5 && p.ebkScore <= 88)
        const byGames = [...filtered].sort((a, b) => b.careerGames - a.careerGames).slice(0, 200)
        setAllPlayers(byGames)
        const seed = Math.floor(Math.random() * 1_000_000)
        setSequence(seededShuffle(byGames, seed).slice(0, TOTAL_PLAYERS))
        setScreen('playing')
      })
      .catch(() => { if (isMounted.current) setScreen('error') })
  }, [])

  async function tryUnlock(milestone: string, currentStreak: number) {
    if (!user) return
    const isGauntlet = milestone === 'hl_gauntlet'
    if (isGauntlet && isMounted.current) setClaimStatus('pending')
    try {
      const res = await fetch('/api/higher-lower/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestone, streak: currentStreak, complete: isGauntlet }),
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

    const current = sequence[idx]
    const challenger = sequence[idx + 1]

    const tied = challenger.ebkScore === current.ebkScore
    const actualDir = challenger.ebkScore > current.ebkScore ? 'higher' : 'lower'
    const correct = tied || direction === actualDir

    setLastCorrect(correct)
    setLastTied(tied)
    setScreen('revealing')

    if (correct) {
      const newStreak = streak + 1
      setStreak(newStreak)

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
    setLastCorrect(null)
    setLastTied(false)
    setUnlockedBadge(null)
    setClaimStatus(null)
    if (allPlayers.length > 0) {
      const seed = Math.floor(Math.random() * 1_000_000)
      setSequence(seededShuffle(allPlayers, seed).slice(0, TOTAL_PLAYERS))
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
  const current = sequence[idx]
  const challenger = sequence[idx + 1]

  /* ── GAME OVER ──────────────────────────────────────────────────────────── */
  if (screen === 'gameover') {
    const correctDir = challenger && current
      ? (challenger.ebkScore > current.ebkScore ? 'HIGHER' : challenger.ebkScore < current.ebkScore ? 'LOWER' : 'THE SAME')
      : ''
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="font-display text-7xl text-red-500/80 leading-none mb-3 select-none">RIP</div>
          <h1 className="font-display text-5xl text-white leading-none mb-3">Game Over</h1>
          {current && challenger && (
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              <span className="text-white font-bold">{challenger.firstName} {challenger.lastName}</span>
              {' '}had{' '}
              <span className="text-orange-400 font-bold">{correctDir} EBK</span>
              {' '}than {current.firstName} {current.lastName}
              <br />
              <span className="text-gray-700 text-xs">
                ({current.firstName} {current.lastName}: {current.ebkScore.toFixed(1)} · {challenger.firstName} {challenger.lastName}: {challenger.ebkScore.toFixed(1)})
              </span>
            </p>
          )}

          <div className="card-stat p-6 mb-6 grid grid-cols-2 gap-6 animate-scale-in">
            <div className="text-center">
              <div className="font-display text-6xl text-orange-400 leading-none tabular-nums">{streak}</div>
              <div className="text-label mt-2">This Run</div>
            </div>
            <div className="text-center border-l border-white/[0.06]">
              <div className={`font-display text-6xl leading-none tabular-nums ${streak >= bestStreak && streak > 0 ? 'win-shimmer-text' : 'text-yellow-400'}`}>{bestStreak}</div>
              <div className="text-label mt-2">Personal Best</div>
              {streak >= bestStreak && streak > 0 && (
                <div className="text-[9px] font-black text-yellow-500/70 uppercase tracking-wider mt-0.5">New record!</div>
              )}
            </div>
          </div>

          <div className="flex gap-3 justify-center">
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

          <div className="font-display text-7xl text-orange-500 leading-none mb-2 select-none">⚡</div>
          <h1 className="font-display text-5xl text-orange-500 leading-none mb-2">The Gauntlet</h1>
          <p className="text-gray-400 mb-1">You ran the full {totalComparisons}-question gauntlet.</p>

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
  const badge10Pct = (10 / totalComparisons) * 100
  const badge25Pct = (25 / totalComparisons) * 100
  const isRevealing = screen === 'revealing'
  const isTie = isRevealing && lastTied

  return (
    <div className="min-h-screen px-4 py-8">
      {/* Badge toast */}
      {unlockedBadge && (
        <div className="fixed top-4 right-4 z-50 bg-yellow-900/95 border border-yellow-500 rounded-2xl px-5 py-4 shadow-2xl max-w-[220px] animate-slide-up">
          <div className="text-yellow-500 text-[10px] font-black uppercase tracking-widest mb-1">Badge Unlocked!</div>
          <div className="text-white font-black text-base leading-tight">{unlockedBadge.name}</div>
        </div>
      )}

      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/lobby" className="text-gray-400 hover:text-white text-sm transition-colors">← Lobby</Link>
          <h1 className="font-display text-2xl text-orange-500 leading-none">Higher or Lower</h1>
          <div className="text-gray-400 text-xs tabular-nums">{idx + 1} / {totalComparisons}</div>
        </div>

        {/* Streak bar */}
        <div className={`p-4 mb-5 rounded-2xl border transition-all duration-300 ${streak >= 10 ? 'card-accent bg-orange-950/10 border-orange-600/40' : 'card-surface'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`font-display leading-none tabular-nums transition-all duration-200 ${streak >= 10 ? 'text-5xl text-orange-400' : streak >= 3 ? 'text-4xl text-orange-300' : 'text-4xl text-white'}`}>
                {streak}
              </span>
              <div>
                <div className="text-label">Streak</div>
                {streak >= 3 && (
                  <div className="text-orange-400 text-[10px] font-black leading-tight">
                    {streak >= 25 ? '🔥🔥🔥 On Fire' : streak >= 10 ? '🔥🔥 Heating Up' : '🔥 Hot'}
                  </div>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-label mb-0.5">Personal Best</div>
              <div className={`font-display text-2xl leading-none tabular-nums ${bestStreak > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>{bestStreak}</div>
              {!user && <div className="text-gray-700 text-[10px] mt-0.5">log in to save</div>}
            </div>
          </div>

          {/* Progress track */}
          <div className="relative h-3 bg-black/40 rounded-full mb-6">
            <div
              className="absolute h-full rounded-full bg-gradient-to-r from-orange-700 to-orange-400 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
            {/* Milestone: 10 */}
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
                 style={{ left: `${badge10Pct}%` }}>
              <div className={`w-3.5 h-3.5 rounded-full border-2 transition-colors ${streak >= 10 ? 'bg-cyan-400 border-cyan-300' : 'bg-[#1a1a1a] border-gray-700'}`} />
              <span className="absolute top-5 text-[9px] text-gray-400 whitespace-nowrap">10</span>
            </div>
            {/* Milestone: 25 */}
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
                 style={{ left: `${badge25Pct}%` }}>
              <div className={`w-3.5 h-3.5 rounded-full border-2 transition-colors ${streak >= 25 ? 'bg-indigo-400 border-indigo-300' : 'bg-[#1a1a1a] border-gray-700'}`} />
              <span className="absolute top-5 text-[9px] text-indigo-600 whitespace-nowrap">25</span>
            </div>
            {/* Milestone: Gauntlet */}
            <div className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center" style={{ right: 0 }}>
              <div className={`w-3.5 h-3.5 rounded-full border-2 transition-colors ${streak >= totalComparisons ? 'bg-yellow-400 border-yellow-200' : 'bg-[#1a1a1a] border-gray-700'}`} />
              <span className="absolute top-5 right-0 text-[9px] text-yellow-600 whitespace-nowrap">⚡</span>
            </div>
          </div>

          <div className="flex justify-between text-[10px] text-gray-700">
            <span>Stat Nerd @ 10</span>
            <span className="text-indigo-800">EBK Savant @ 25</span>
            <span className="text-yellow-800">The Gauntlet ⚡</span>
          </div>
        </div>

        {/* Challenger label — self-intuitive, no question text needed */}
        <div className="text-center mb-5">
          <p className="text-gray-600 text-[11px] uppercase tracking-widest">Challenger</p>
        </div>

        {/* Player cards */}
        <div className="grid grid-cols-2 gap-4 mb-5">

          {/* Current player — always revealed */}
          <div className="card-stat p-5 flex flex-col">
            <div className="text-label mb-3 text-orange-500/70">Current</div>
            <div className="font-black text-white text-base leading-tight mb-0.5">
              {current.firstName} {current.lastName}
            </div>
            <div className="flex items-center gap-1.5 mb-3">
              <span className={`pos-badge pos-${current.position.toLowerCase()}`}>{current.position}</span>
              <span className="text-gray-500 text-xs">{current.team}</span>
            </div>
            <div className="text-gray-500 text-[11px] space-y-0.5 mb-4 flex-1">
              <div className="text-gray-600">{current.careerGames} GP</div>
              <div>{current.careerPPG.toFixed(1)} <span className="text-gray-700">PPG</span> · {current.careerRPG.toFixed(1)} <span className="text-gray-700">RPG</span> · {current.careerAPG.toFixed(1)} <span className="text-gray-700">APG</span></div>
            </div>
            <div className="stat-highlight rounded-xl px-3 py-3 text-center">
              <div className="font-display text-4xl text-orange-400 leading-none">{current.ebkScore.toFixed(1)}</div>
              <div className="text-label mt-1">EBK Score</div>
            </div>
          </div>

          {/* Challenger — hidden until reveal */}
          <div className={[
            'rounded-2xl p-5 border-2 transition-all duration-300 flex flex-col',
            isRevealing && lastCorrect  ? 'bg-green-900/15 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.12)]'  : '',
            isRevealing && !lastCorrect ? 'bg-red-900/15 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.12)]'      : '',
            !isRevealing                ? 'bg-[#111118] border-white/[0.07] border-dashed'  : '',
          ].join(' ')}>
            <div className={`text-label mb-3 ${isRevealing && lastCorrect ? 'text-green-500/70' : isRevealing && !lastCorrect ? 'text-red-500/70' : 'text-gray-600'}`}>Challenger</div>
            <div className="font-black text-white text-base leading-tight mb-0.5">
              {challenger.firstName} {challenger.lastName}
            </div>
            <div className="flex items-center gap-1.5 mb-3">
              <span className={`pos-badge pos-${challenger.position.toLowerCase()}`}>{challenger.position}</span>
              <span className="text-gray-500 text-xs">{challenger.team}</span>
            </div>

            {isRevealing ? (
              <>
                <div className="text-gray-500 text-[11px] space-y-0.5 mb-4 flex-1 animate-scale-in">
                  <div className="text-gray-600">{challenger.careerGames} GP</div>
                  <div>{challenger.careerPPG.toFixed(1)} <span className="text-gray-700">PPG</span> · {challenger.careerRPG.toFixed(1)} <span className="text-gray-700">RPG</span> · {challenger.careerAPG.toFixed(1)} <span className="text-gray-700">APG</span></div>
                </div>
                <div className={`rounded-xl px-3 py-3 text-center animate-scale-in ${isTie ? 'bg-yellow-900/40 border border-yellow-700/40' : lastCorrect ? 'bg-green-900/40 border border-green-700/40' : 'bg-red-900/40 border border-red-700/40'}`}>
                  <div className={`font-display text-4xl leading-none ${isTie ? 'text-yellow-400' : lastCorrect ? 'text-green-400' : 'text-red-400'}`}>
                    {challenger.ebkScore.toFixed(1)}
                  </div>
                  <div className={`text-[10px] font-bold mt-1 ${isTie ? 'text-yellow-600' : lastCorrect ? 'text-green-600' : 'text-red-600'}`}>
                    {isTie ? '~ Tie!' : lastCorrect ? '✓ Correct' : '✗ Wrong'}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="text-gray-800 text-[11px] space-y-0.5 mb-4 flex-1">
                  <div>??? GP</div>
                  <div>??.? PPG · ??.? RPG · ??.? APG</div>
                </div>
                <div className="rounded-xl px-3 py-3 text-center border border-dashed border-white/[0.06] bg-black/20">
                  <div className="font-display text-4xl text-gray-700 leading-none select-none">???</div>
                  <div className="text-label mt-1">EBK Score</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {!isRevealing && (
          <div className="grid grid-cols-2 gap-4">
            {/* LOWER = blue — bigger career, better known */}
            <button
              onClick={() => guess('lower')}
              className="group relative overflow-hidden bg-[#0c111f] hover:bg-blue-950/50 border border-blue-500/25 hover:border-blue-400/70 text-white font-black py-6 rounded-2xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-blue-900/30"
            >
              <div className="font-display text-4xl text-blue-400 leading-none mb-1 group-hover:scale-110 transition-transform">▼</div>
              <div className="text-sm tracking-wider uppercase">Lower EBK</div>
              <div className="text-[11px] text-blue-500/70 mt-0.5 font-normal">bigger career</div>
            </button>

            {/* HIGHER = orange — unknown gem, EBK brand color */}
            <button
              onClick={() => guess('higher')}
              className="group relative overflow-hidden bg-[#1a0e05] hover:bg-orange-950/50 border border-orange-500/25 hover:border-orange-400/70 text-white font-black py-6 rounded-2xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-orange-900/30"
            >
              <div className="font-display text-4xl text-orange-400 leading-none mb-1 group-hover:scale-110 transition-transform">▲</div>
              <div className="text-sm tracking-wider uppercase">Higher EBK</div>
              <div className="text-[11px] text-orange-500/70 mt-0.5 font-normal">unknown gem</div>
            </button>
          </div>
        )}

        {/* Reveal verdict */}
        {isRevealing && (
          <div className="flex items-center justify-center h-[88px]">
            <span className={`font-display text-4xl ${isTie ? 'text-yellow-400' : lastCorrect ? 'text-green-400' : 'text-red-400'}`}>
              {isTie ? '~ Tie — Free Pass!' : lastCorrect ? '✓  Correct!' : '✗  Wrong!'}
            </span>
          </div>
        )}

      </div>
    </div>
  )
}
