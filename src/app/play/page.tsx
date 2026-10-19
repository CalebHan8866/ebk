'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

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
}

interface Challenge {
  player1: Player
  player2: Player
  mode: string
}

interface ResultPlayer extends Player {
  stat: number
}

interface GameResult {
  result: 'win' | 'loss' | 'draw'
  correctId: number
  player1: ResultPlayer
  player2: ResultPlayer
  mode: string
}

const modeConfig: Record<string, { label: string; question: string; statLabel: string }> = {
  games_played: { label: 'Fewest Games', question: 'Which player played FEWER career games?', statLabel: 'Career Games' },
  ppg:          { label: 'Lowest PPG',   question: 'Which player averaged FEWER points per game?', statLabel: 'PPG' },
  rpg:          { label: 'Lowest RPG',   question: 'Which player averaged FEWER rebounds per game?', statLabel: 'RPG' },
  apg:          { label: 'Lowest APG',   question: 'Which player averaged FEWER assists per game?', statLabel: 'APG' },
}

const POS_CLASS: Record<string, string> = {
  PG: 'pos-badge pos-pg', SG: 'pos-badge pos-sg', SF: 'pos-badge pos-sf',
  PF: 'pos-badge pos-pf', C:  'pos-badge pos-c',
}

const RESULT_LABELS: Record<string, { headline: string; sub: string }> = {
  win:  { headline: 'CORRECT',  sub: 'Elite Ball Knowledge' },
  loss: { headline: 'WRONG',    sub: 'Study up, rookie' },
  draw: { headline: 'DRAW',     sub: 'Dead even — rare call' },
}

function PlayGame() {
  const searchParams = useSearchParams()
  const [mode, setMode] = useState(searchParams.get('mode') || 'games_played')
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [gameResult, setGameResult] = useState<GameResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [streak, setStreak] = useState(0)
  const [record, setRecord] = useState({ wins: 0, losses: 0, draws: 0 })
  const [streakBump, setStreakBump] = useState(false)

  const loadChallenge = useCallback(async () => {
    setLoading(true)
    setGameResult(null)
    try {
      const res = await fetch(`/api/game/challenge?mode=${mode}`)
      const data = await res.json()
      setChallenge(data)
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => { loadChallenge() }, [loadChallenge])

  // Keyboard shortcut: left arrow = player 1, right arrow = player 2
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!challenge || gameResult) return
      if (e.key === 'ArrowLeft' || e.key === '1') handlePick(challenge.player1.id)
      if (e.key === 'ArrowRight' || e.key === '2') handlePick(challenge.player2.id)
      if ((e.key === 'Enter' || e.key === ' ') && gameResult) loadChallenge()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge, gameResult])

  async function handlePick(chosenId: number) {
    if (!challenge || gameResult) return
    const res = await fetch('/api/game/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player1Id: challenge.player1.id, player2Id: challenge.player2.id, chosenId, mode }),
    })
    const data: GameResult = await res.json()
    setGameResult(data)
    if (data.result === 'win') {
      const newStreak = streak + 1
      setStreak(newStreak)
      setRecord(r => ({ ...r, wins: r.wins + 1 }))
      if (newStreak > 1) { setStreakBump(true); setTimeout(() => setStreakBump(false), 600) }
    } else if (data.result === 'loss') {
      setStreak(0)
      setRecord(r => ({ ...r, losses: r.losses + 1 }))
    } else {
      setRecord(r => ({ ...r, draws: r.draws + 1 }))
    }
  }

  const config = modeConfig[mode]

  return (
    <div className="min-h-screen py-8 px-4 animate-fade-in">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-label mb-1 tracking-[0.2em]">Quick Play</p>
          <h1 className="font-display text-5xl sm:text-6xl text-white leading-none tracking-wide">
            PICK THE <span className="text-orange-500">LOWER</span>
          </h1>
        </div>

        {/* Mode selector */}
        <div className="tab-pill mb-6">
          {Object.entries(modeConfig).map(([id, m]) => (
            <button
              key={id}
              onClick={() => { setMode(id); setGameResult(null) }}
              className={`tab-pill-item${mode === id ? ' active' : ''}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Session record + streak */}
        <div className="flex items-center justify-center gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-1.5">
            <span className="font-display text-green-400 text-lg leading-none">{record.wins}</span>
            <span className="text-green-400/60 text-[10px] font-black uppercase tracking-widest">W</span>
          </div>
          <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
            <span className="font-display text-red-400 text-lg leading-none">{record.losses}</span>
            <span className="text-red-400/60 text-[10px] font-black uppercase tracking-widest">L</span>
          </div>
          <div className="flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-1.5">
            <span className="font-display text-yellow-400 text-lg leading-none">{record.draws}</span>
            <span className="text-yellow-400/60 text-[10px] font-black uppercase tracking-widest">D</span>
          </div>
          {streak > 1 && (
            <div className={`flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-1.5 transition-transform ${streakBump ? 'scale-110' : 'scale-100'}`}>
              <span className="text-orange-400 font-black text-sm">🔥 {streak} streak</span>
            </div>
          )}
        </div>

        {/* Question */}
        <div className="text-center mb-6">
          <p className="text-white/70 font-black text-base sm:text-lg tracking-wide">{config.question}</p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
            <p className="text-label tracking-widest">Loading...</p>
          </div>
        )}

        {/* Player cards with VS divider */}
        {challenge && !loading && (
          <div className="relative mb-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[challenge.player1, challenge.player2].map((player, idx) => {
                const resultPlayer = gameResult
                  ? (player.id === gameResult.player1.id ? gameResult.player1 : gameResult.player2)
                  : null
                const isCorrect   = gameResult && player.id === gameResult.correctId
                const isIncorrect = gameResult && player.id !== gameResult.correctId

                return (
                  <button
                    key={player.id}
                    onClick={() => handlePick(player.id)}
                    disabled={!!gameResult}
                    aria-label={`Pick ${player.firstName} ${player.lastName}`}
                    className={`card-surface rounded-2xl p-5 sm:p-6 text-left transition-all w-full disabled:cursor-default relative
                      ${!gameResult ? 'hover:border-orange-500/50 hover:bg-orange-950/10 active:scale-[0.99]' : ''}
                      ${isCorrect  ? 'border-green-500/60 bg-green-950/20 shadow-[0_0_24px_rgba(34,197,94,0.12)]' : ''}
                      ${isIncorrect ? 'border-red-500/30 opacity-60' : ''}
                      border
                    `}
                  >
                    {/* Keyboard hint badge */}
                    {!gameResult && (
                      <span className="absolute top-3 right-3 hidden sm:flex items-center justify-center w-6 h-6 rounded-md bg-white/[0.04] border border-white/[0.07] text-white/20 text-[10px] font-bold">
                        {idx === 0 ? '←' : '→'}
                      </span>
                    )}

                    {/* Player name */}
                    <div className="flex items-start justify-between gap-2 mb-4">
                      <div className="min-w-0">
                        <h3 className="font-display text-2xl sm:text-3xl text-white leading-none mb-1">
                          {player.firstName} {player.lastName}
                        </h3>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={POS_CLASS[player.position] || 'pos-badge pos-pg'}>{player.position}</span>
                          <span className="text-gray-400 text-xs">{player.team}</span>
                        </div>
                      </div>
                      {gameResult && (
                        <span className="text-2xl shrink-0">{isCorrect ? '✅' : '❌'}</span>
                      )}
                    </div>

                    {/* Stat reveal / hidden placeholder */}
                    {gameResult && resultPlayer ? (
                      <div className="stat-highlight rounded-xl p-4 text-center">
                        <p className="text-label mb-1">{config.statLabel}</p>
                        <p className="font-display text-4xl text-orange-400 leading-none tabular-nums">
                          {mode === 'games_played'
                            ? resultPlayer.stat.toLocaleString()
                            : resultPlayer.stat.toFixed(1)}
                        </p>
                        <div className="grid grid-cols-3 gap-2 mt-3 text-xs text-gray-400">
                          <div className="text-center"><div className="text-white/70 font-bold">{player.careerGames}</div><div>GP</div></div>
                          <div className="text-center"><div className="text-white/70 font-bold">{player.careerPPG}</div><div>PPG</div></div>
                          <div className="text-center"><div className="text-white/70 font-bold">{player.careerRPG}</div><div>RPG</div></div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 text-center">
                        {['GP', 'PPG', 'POS'].map((label, i) => (
                          <div key={label} className="bg-white/[0.04] border border-white/[0.05] rounded-xl py-3">
                            <div className="text-label mb-1">{label}</div>
                            <div className="font-display text-lg text-white/60 leading-none">
                              {i === 2 ? player.position : '?'}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Pick CTA hint */}
                    {!gameResult && (
                      <div className="mt-4 text-center">
                        <span className="text-orange-400/50 text-[10px] font-black uppercase tracking-widest">Tap to pick</span>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {/* VS chip — centered over the gap on desktop, between cards on mobile */}
            {!gameResult && (
              <div className="flex items-center justify-center sm:absolute sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:z-10 my-2 sm:my-0">
                <div className="w-9 h-9 rounded-full bg-[#181818] border-2 border-white/[0.1] flex items-center justify-center shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
                  <span className="font-display text-base text-white/50 leading-none">VS</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Result banner */}
        {gameResult && (() => {
          const { result } = gameResult
          const labels = RESULT_LABELS[result]
          return (
            <div className={`rounded-2xl px-5 py-5 text-center mb-6 animate-scale-in ${
              result === 'win'  ? 'bg-green-950/40 border border-green-500/40 shadow-[0_0_24px_rgba(34,197,94,0.1)]' :
              result === 'loss' ? 'bg-red-950/30 border border-red-500/30' :
                                  'bg-yellow-950/30 border border-yellow-500/30'
            }`}>
              <div className={`font-display text-5xl leading-none mb-1 ${
                result === 'win'  ? 'win-shimmer-text' :
                result === 'loss' ? 'text-red-400' :
                                    'text-yellow-400'
              }`}>
                {labels.headline}
              </div>
              <div className={`text-xs font-black tracking-widest uppercase mt-1 ${
                result === 'win' ? 'text-green-400/70' : 'text-white/30'
              }`}>
                {labels.sub}
              </div>
              {streak >= 3 && result === 'win' && (
                <div className="mt-2 inline-flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/20 rounded-full px-3 py-1">
                  <span className="text-orange-400 font-black text-xs tracking-wide">🔥 {streak} in a row</span>
                </div>
              )}
            </div>
          )
        })()}

        {/* Next challenge CTA */}
        {gameResult && (
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
            <button
              onClick={loadChallenge}
              className="btn-primary flex-1 sm:flex-none py-4 px-10 text-base font-display tracking-widest"
            >
              Next Challenge →
            </button>
          </div>
        )}

        {/* Keyboard shortcut hint — desktop only */}
        {!gameResult && challenge && !loading && (
          <p className="hidden sm:block text-center text-white/20 text-[11px] mb-6 tracking-wide">
            Keyboard: <kbd className="font-mono bg-white/[0.05] border border-white/[0.08] rounded px-1.5 py-0.5 text-[10px]">←</kbd> left player &nbsp;·&nbsp; <kbd className="font-mono bg-white/[0.05] border border-white/[0.08] rounded px-1.5 py-0.5 text-[10px]">→</kbd> right player
          </p>
        )}

        {/* Bottom CTA */}
        <div className="text-center border-t border-white/[0.06] pt-8 mt-4">
          <p className="text-white/40 text-sm mb-4">Want head-to-head drafts, win records, and badges?</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/lobby" className="btn-primary py-3 px-8 text-sm tracking-widest">Play Live Draft</Link>
            <Link href="/register" className="btn-secondary py-3 px-8 text-sm">Create Free Account</Link>
          </div>
        </div>

      </div>
    </div>
  )
}

export default function PlayPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
      </div>
    }>
      <PlayGame />
    </Suspense>
  )
}
