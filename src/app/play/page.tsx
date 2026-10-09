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

const modeConfig: Record<string, { label: string; icon: string; question: string; statLabel: string }> = {
  games_played: { label: 'Fewest Games', icon: '🎮', question: 'Which player played FEWER career games?', statLabel: 'Career Games' },
  ppg: { label: 'Lowest PPG', icon: '🏀', question: 'Which player averaged FEWER points per game?', statLabel: 'PPG' },
  rpg: { label: 'Lowest RPG', icon: '💪', question: 'Which player averaged FEWER rebounds per game?', statLabel: 'RPG' },
  apg: { label: 'Lowest APG', icon: '🤝', question: 'Which player averaged FEWER assists per game?', statLabel: 'APG' },
}

function PlayGame() {
  const searchParams = useSearchParams()
  const [mode, setMode] = useState(searchParams.get('mode') || 'games_played')
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [gameResult, setGameResult] = useState<GameResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [streak, setStreak] = useState(0)
  const [record, setRecord] = useState({ wins: 0, losses: 0, draws: 0 })

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

  useEffect(() => {
    loadChallenge()
  }, [loadChallenge])

  async function handlePick(chosenId: number) {
    if (!challenge || gameResult) return

    const res = await fetch('/api/game/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player1Id: challenge.player1.id,
        player2Id: challenge.player2.id,
        chosenId,
        mode,
      }),
    })
    const data: GameResult = await res.json()
    setGameResult(data)

    if (data.result === 'win') {
      setStreak(s => s + 1)
      setRecord(r => ({ ...r, wins: r.wins + 1 }))
    } else if (data.result === 'loss') {
      setStreak(0)
      setRecord(r => ({ ...r, losses: r.losses + 1 }))
    } else {
      setRecord(r => ({ ...r, draws: r.draws + 1 }))
    }
  }

  const config = modeConfig[mode]

  return (
    <div className="min-h-screen bg-[#0A0A0A] py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap gap-2 justify-center mb-8">
          {Object.entries(modeConfig).map(([id, m]) => (
            <button
              key={id}
              onClick={() => { setMode(id); setGameResult(null) }}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                mode === id ? 'bg-orange-600 text-white' : 'bg-[#1A1A2E] text-gray-300 hover:bg-[#16213E]'
              }`}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        <div className="text-center mb-6">
          <span className="text-gray-400 text-sm">Session: </span>
          <span className="text-green-400 font-bold">{record.wins}W</span>
          <span className="text-gray-400 mx-1">-</span>
          <span className="text-red-400 font-bold">{record.losses}L</span>
          <span className="text-gray-400 mx-1">-</span>
          <span className="text-yellow-400 font-bold">{record.draws}D</span>
          {streak > 1 && <span className="ml-3 text-orange-400 font-bold">🔥 {streak} streak</span>}
        </div>

        <h2 className="text-center text-xl font-bold text-white mb-8">{config.question}</h2>

        {loading && (
          <div className="text-center text-gray-400 py-20">
            <div className="text-4xl animate-bounce inline-block mb-4">🏀</div>
            <div>Loading...</div>
          </div>
        )}

        {challenge && !loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {[challenge.player1, challenge.player2].map((player) => {
              const resultPlayer = gameResult
                ? (player.id === gameResult.player1.id ? gameResult.player1 : gameResult.player2)
                : null

              let borderClass = 'border-2 border-gray-700 hover:border-orange-500'
              if (gameResult) {
                borderClass = player.id === gameResult.correctId
                  ? 'border-2 border-green-500'
                  : 'border-2 border-red-500/50'
              }

              return (
                <button
                  key={player.id}
                  onClick={() => handlePick(player.id)}
                  disabled={!!gameResult}
                  className={`${borderClass} bg-[#1A1A2E] rounded-2xl p-6 text-left transition-all hover:bg-[#16213E] disabled:cursor-default`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-black text-white">
                        {player.firstName} {player.lastName}
                      </h3>
                      <p className="text-gray-400 text-sm">{player.team} · {player.position}</p>
                    </div>
                    {gameResult && (
                      <span className="text-2xl">
                        {player.id === gameResult.correctId ? '✅' : '❌'}
                      </span>
                    )}
                  </div>

                  {gameResult && resultPlayer ? (
                    <div className="mt-4 pt-4 border-t border-gray-700">
                      <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">{config.statLabel}</p>
                      <p className="text-3xl font-black text-orange-400">
                        {mode === 'games_played'
                          ? resultPlayer.stat.toLocaleString()
                          : resultPlayer.stat.toFixed(1)}
                      </p>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-gray-500">
                        <div><span className="text-gray-400">{player.careerGames}</span> GP</div>
                        <div><span className="text-gray-400">{player.careerPPG}</span> PPG</div>
                        <div><span className="text-gray-400">{player.careerRPG}</span> RPG</div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      {['GP', 'PPG', 'POS'].map((label, i) => (
                        <div key={label} className="bg-[#0A0A0A] rounded-lg p-2">
                          <div className="text-xs text-gray-500">{label}</div>
                          <div className="font-bold text-gray-300 text-sm">
                            {i === 2 ? player.position : '?'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {gameResult && (
          <div className={`text-center py-6 rounded-2xl mb-6 ${
            gameResult.result === 'win' ? 'bg-green-900/50 border border-green-500' :
            gameResult.result === 'loss' ? 'bg-red-900/50 border border-red-500' :
            'bg-yellow-900/50 border border-yellow-500'
          }`}>
            <div className="text-4xl mb-2">
              {gameResult.result === 'win' ? '🎉' : gameResult.result === 'loss' ? '😤' : '🤝'}
            </div>
            <div className="text-2xl font-black text-white mb-1">
              {gameResult.result === 'win' ? 'CORRECT!' : gameResult.result === 'loss' ? 'WRONG!' : 'DRAW!'}
            </div>
          </div>
        )}

        {gameResult && (
          <div className="text-center">
            <button
              onClick={loadChallenge}
              className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-8 rounded-xl text-lg transition-all transform hover:scale-105"
            >
              Next Challenge →
            </button>
          </div>
        )}

        <div className="mt-10 text-center">
          <Link href="/register" className="text-gray-500 text-sm hover:text-orange-400">
            Create an account to save your record →
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function PlayPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-gray-400">Loading...</div>}>
      <PlayGame />
    </Suspense>
  )
}
