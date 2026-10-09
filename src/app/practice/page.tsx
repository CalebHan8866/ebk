'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type TeamMode = 'starter5' | 'bench8' | 'full12'
type Difficulty = 'casual' | 'ebk'

interface Player {
  id: number
  firstName: string
  lastName: string
  team: string
  position: string
  positions: string
  careerGames: number
  careerPPG: number
  careerRPG: number
  careerAPG: number
  ebkScore: number
  yearFrom: number
  yearTo: number
}

const TEAM_SIZES: Record<TeamMode, number> = { starter5: 5, bench8: 8, full12: 12 }
const STAT_LABELS: Record<string, string> = {
  games_played: 'Games Played',
  ppg: 'Points Per Game',
  rpg: 'Rebounds Per Game',
  apg: 'Assists Per Game',
}

function getStatValue(p: Player, mode: string): number {
  switch (mode) {
    case 'games_played': return p.careerGames
    case 'ppg': return p.careerPPG
    case 'rpg': return p.careerRPG
    case 'apg': return p.careerAPG
    default: return 0
  }
}

function getRequiredPositions(teamMode: TeamMode): string[] {
  const starters = ['PG', 'SG', 'SF', 'PF', 'C']
  const bench = Array(TEAM_SIZES[teamMode] - 5).fill('BENCH')
  return [...starters, ...bench]
}

function PracticeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [screen, setScreen] = useState<'setup' | 'draft' | 'result'>('setup')
  const [teamMode, setTeamMode] = useState<TeamMode>('starter5')
  const [difficulty, setDifficulty] = useState<Difficulty>('casual')
  const [sortStat, setSortStat] = useState<string>('games_played')

  const [players, setPlayers] = useState<Player[]>([])
  const [loadingPlayers, setLoadingPlayers] = useState(false)
  const [picks, setPicks] = useState<number[]>([])
  const [filterPos, setFilterPos] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Load players when entering draft
  useEffect(() => {
    if (screen !== 'draft' || players.length > 0) return
    setLoadingPlayers(true)
    fetch('/api/players')
      .then(r => r.json())
      .then((data: Player[]) => { setPlayers(data); setLoadingPlayers(false) })
      .catch(() => setLoadingPlayers(false))
  }, [screen, players.length])

  const teamSize = TEAM_SIZES[teamMode]
  const requiredSlots = getRequiredPositions(teamMode)
  const takenIds = new Set(picks)

  const filteredPlayers = players.filter(p => {
    if (takenIds.has(p.id)) return false
    if (filterPos !== 'ALL' && !p.positions.split(',').includes(filterPos)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!`${p.firstName} ${p.lastName}`.toLowerCase().includes(q) && !p.team.toLowerCase().includes(q)) return false
    }
    return true
  }).sort((a, b) => getStatValue(a, sortStat) - getStatValue(b, sortStat))

  function pick(id: number) {
    if (picks.length >= teamSize) return
    setPicks(prev => [...prev, id])
  }

  function unpick(id: number) {
    setPicks(prev => prev.filter(p => p !== id))
  }

  function reset() {
    setPicks([])
    setFilterPos('ALL')
    setSearchQuery('')
    setScreen('setup')
  }

  // ── Setup ──────────────────────────────────────────────────────────────────
  if (screen === 'setup') {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <button onClick={() => router.push('/lobby')} className="text-gray-500 hover:text-white text-sm mb-6 flex items-center gap-1">
            ← Back to Lobby
          </button>
          <div className="text-center mb-8">
            <div className="text-4xl mb-2">🏋️</div>
            <h1 className="text-2xl font-black text-white">Practice Mode</h1>
            <p className="text-gray-500 text-sm mt-1">Draft solo — no pressure, no timer</p>
          </div>

          <div className="bg-[#111827] rounded-2xl p-6 space-y-5">
            <div>
              <label className="block text-gray-400 text-xs mb-2 uppercase tracking-wide">Team Size</label>
              <div className="grid grid-cols-3 gap-2">
                {([['starter5', 'Starter 5', '5 players'], ['bench8', 'Bench 8', '8 players'], ['full12', 'Full 12', '12 players']] as const).map(([val, label, sub]) => (
                  <button key={val} onClick={() => setTeamMode(val)}
                    className={`rounded-lg p-2.5 text-center text-xs border transition-all ${teamMode === val ? 'border-orange-500 bg-orange-600/20 text-orange-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                    <div className="font-black text-sm">{label}</div>
                    <div className="text-gray-500">{sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-gray-400 text-xs mb-2 uppercase tracking-wide">Sort By</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(STAT_LABELS).map(([val, label]) => (
                  <button key={val} onClick={() => setSortStat(val)}
                    className={`rounded-lg p-2.5 text-center text-xs border transition-all ${sortStat === val ? 'border-orange-500 bg-orange-600/20 text-orange-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-gray-400 text-xs mb-2 uppercase tracking-wide">Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setDifficulty('casual')}
                  className={`rounded-lg p-3 text-center border transition-all ${difficulty === 'casual' ? 'border-orange-500 bg-orange-600/20 text-orange-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                  <div className="font-black text-sm">Casual</div>
                  <div className="text-xs opacity-70 mt-0.5">EBK scores shown</div>
                </button>
                <button onClick={() => setDifficulty('ebk')}
                  className={`rounded-lg p-3 text-center border transition-all ${difficulty === 'ebk' ? 'border-yellow-500 bg-yellow-600/10 text-yellow-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                  <div className="font-black text-sm">EBK ⚡</div>
                  <div className="text-xs opacity-70 mt-0.5">No scores — blind picks</div>
                </button>
              </div>
            </div>

            <button
              onClick={() => setScreen('draft')}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-black py-3 rounded-xl transition-colors text-lg">
              Start Practice
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Draft ──────────────────────────────────────────────────────────────────
  if (screen === 'draft') {
    const isDone = picks.length >= teamSize

    return (
      <div className="min-h-screen bg-[#0A0A0A] py-6 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-orange-500 font-black text-lg">
                Practice · {teamMode === 'starter5' ? 'Starter 5' : teamMode === 'bench8' ? 'Bench 8' : 'Full 12'}
                {difficulty === 'ebk' && <span className="ml-2 text-yellow-500">⚡ EBK</span>}
              </div>
              <div className="text-gray-500 text-xs">Sorted by ↑ {STAT_LABELS[sortStat]} · No timer · No opponent</div>
            </div>
            <button onClick={reset} className="text-gray-500 hover:text-white text-sm">← Exit</button>
          </div>

          {loadingPlayers ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="text-3xl animate-bounce mb-3">🏀</div>
                <p className="text-gray-400 text-sm">Loading players...</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {/* My Team */}
              <div className="bg-[#111827] rounded-2xl p-4">
                <h3 className="text-white font-black text-sm mb-3">
                  Your Team <span className="text-gray-500 font-normal">({picks.length}/{teamSize})</span>
                </h3>
                <div className="space-y-1.5">
                  {requiredSlots.map((slotPos, i) => {
                    const pickedId = picks[i]
                    const pickedPlayer = pickedId ? players.find(p => p.id === pickedId) : null
                    return (
                      <div key={i} className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${pickedPlayer ? 'bg-[#0A0A0A]' : 'bg-[#0A0A0A] border border-dashed border-gray-700'}`}>
                        <span className={`font-bold w-8 shrink-0 ${slotPos === 'BENCH' ? 'text-gray-600' : 'text-orange-400'}`}>
                          {slotPos === 'BENCH' ? 'BN' : slotPos}
                        </span>
                        {pickedPlayer ? (
                          <span className="text-white truncate flex-1">
                            {pickedPlayer.firstName} {pickedPlayer.lastName} <span className="text-gray-500">({pickedPlayer.team})</span>
                          </span>
                        ) : (
                          <span className="text-gray-600">empty</span>
                        )}
                        {pickedPlayer && (
                          <button onClick={() => unpick(pickedPlayer.id)} className="text-gray-600 hover:text-red-400 text-xs shrink-0">✕</button>
                        )}
                      </div>
                    )
                  })}
                </div>

                {isDone && (
                  <button
                    onClick={() => setScreen('result')}
                    className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-black py-2.5 rounded-xl text-sm transition-colors">
                    See Results →
                  </button>
                )}
              </div>

              {/* Player Pool */}
              <div className="lg:col-span-3">
                {/* Search */}
                <div className="relative mb-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search player or team..."
                    className="w-full bg-[#111827] border border-gray-700 rounded-lg pl-8 pr-8 py-2 text-white text-sm focus:outline-none focus:border-orange-500 placeholder-gray-600"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs">✕</button>
                  )}
                </div>

                {/* Position filter */}
                <div className="flex gap-1.5 mb-3 flex-wrap">
                  {['ALL', 'PG', 'SG', 'SF', 'PF', 'C'].map(pos => (
                    <button key={pos} onClick={() => setFilterPos(pos)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${filterPos === pos ? 'bg-orange-600 text-white' : 'bg-[#111827] text-gray-400 hover:text-white'}`}>
                      {pos}
                    </button>
                  ))}
                  <span className="ml-auto text-xs text-gray-500 self-center">{filteredPlayers.length} available</span>
                </div>

                <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
                  {filteredPlayers.map(player => {
                    const statVal = getStatValue(player, sortStat)
                    const playerPositions = player.positions.split(',')
                    const canPick = picks.length < teamSize

                    return (
                      <button
                        key={player.id}
                        onClick={() => canPick && pick(player.id)}
                        disabled={!canPick}
                        className={`w-full rounded-xl px-4 py-3 flex items-center gap-3 text-left transition-all ${
                          canPick
                            ? 'bg-[#111827] hover:bg-[#1e2d45] hover:border-orange-500 border-2 border-transparent cursor-pointer'
                            : 'bg-[#0D0D0D] border-2 border-transparent cursor-default opacity-40'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-bold text-sm truncate">{player.firstName} {player.lastName}</div>
                          <div className="text-gray-500 text-xs">{player.team} · {player.yearFrom}–{player.yearTo}</div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {playerPositions.map((pos: string) => (
                            <span key={pos} className="text-xs bg-orange-600/20 text-orange-400 px-1.5 py-0.5 rounded font-bold">{pos}</span>
                          ))}
                        </div>
                        {difficulty === 'casual' ? (
                          <div className="text-right shrink-0 min-w-[70px]">
                            <div className={`font-black text-sm ${
                              player.ebkScore >= 80 ? 'text-green-400' :
                              player.ebkScore >= 60 ? 'text-yellow-400' :
                              player.ebkScore >= 40 ? 'text-orange-400' : 'text-red-400'
                            }`}>
                              ⚡{player.ebkScore}
                            </div>
                            <div className="text-gray-500 text-xs">
                              {sortStat === 'games_played' ? statVal : statVal.toFixed(1)} {sortStat === 'games_played' ? 'GP' : sortStat.toUpperCase()}
                            </div>
                          </div>
                        ) : (
                          <div className="text-right shrink-0 min-w-[50px]">
                            <div className="text-yellow-500 font-black text-sm">⚡?</div>
                            <div className="text-gray-600 text-xs">hidden</div>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Results ────────────────────────────────────────────────────────────────
  const pickedPlayers = picks.map(id => players.find(p => p.id === id)!).filter(Boolean)
  const totals = {
    games_played: pickedPlayers.reduce((s, p) => s + p.careerGames, 0),
    ppg: pickedPlayers.reduce((s, p) => s + p.careerPPG, 0),
    rpg: pickedPlayers.reduce((s, p) => s + p.careerRPG, 0),
    apg: pickedPlayers.reduce((s, p) => s + p.careerAPG, 0),
  }
  const totalEBK = pickedPlayers.reduce((s, p) => s + p.ebkScore, 0)

  return (
    <div className="min-h-screen bg-[#0A0A0A] py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📋</div>
          <h1 className="text-3xl font-black text-white">Your Team</h1>
          <p className="text-gray-500 text-sm mt-1">
            {teamMode === 'starter5' ? 'Starter 5' : teamMode === 'bench8' ? 'Bench 8' : 'Full 12'} ·{' '}
            {difficulty === 'casual' ? 'Casual' : 'EBK ⚡'}
          </p>
        </div>

        {/* Roster */}
        <div className="bg-[#111827] rounded-2xl p-5 mb-5">
          <h2 className="text-gray-400 text-xs uppercase tracking-wide mb-3">Roster</h2>
          <div className="space-y-2">
            {requiredSlots.map((slotPos, i) => {
              const p = pickedPlayers[i]
              if (!p) return null
              return (
                <div key={i} className="flex items-center gap-3 bg-[#0A0A0A] rounded-lg px-4 py-2.5">
                  <span className={`font-bold text-xs w-8 shrink-0 ${slotPos === 'BENCH' ? 'text-gray-600' : 'text-orange-400'}`}>
                    {slotPos === 'BENCH' ? 'BN' : slotPos}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-white text-sm font-bold">{p.firstName} {p.lastName}</span>
                    <span className="text-gray-500 text-xs ml-2">({p.team}) {p.yearFrom}–{p.yearTo}</span>
                  </div>
                  <div className="text-right text-xs text-gray-400 shrink-0">
                    <span>{p.careerGames}GP</span>
                    <span className="mx-1.5 text-gray-700">·</span>
                    <span>{p.careerPPG.toFixed(1)}P</span>
                    <span className="mx-1.5 text-gray-700">·</span>
                    <span>{p.careerRPG.toFixed(1)}R</span>
                    <span className="mx-1.5 text-gray-700">·</span>
                    <span>{p.careerAPG.toFixed(1)}A</span>
                  </div>
                  {difficulty === 'casual' && (
                    <div className={`text-xs font-black shrink-0 w-12 text-right ${
                      p.ebkScore >= 80 ? 'text-green-400' :
                      p.ebkScore >= 60 ? 'text-yellow-400' :
                      p.ebkScore >= 40 ? 'text-orange-400' : 'text-red-400'
                    }`}>⚡{p.ebkScore}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Totals */}
        <div className="bg-[#111827] rounded-2xl p-5 mb-6">
          <h2 className="text-gray-400 text-xs uppercase tracking-wide mb-3">Team Totals</h2>
          <div className="grid grid-cols-2 gap-3">
            {(Object.entries(STAT_LABELS) as [string, string][]).map(([key, label]) => (
              <div key={key} className="bg-[#0A0A0A] rounded-xl p-4 text-center">
                <div className="text-gray-500 text-xs mb-1">{label}</div>
                <div className="text-white font-black text-2xl">
                  {key === 'games_played' ? Math.round(totals[key as keyof typeof totals]) : (totals[key as keyof typeof totals]).toFixed(1)}
                </div>
              </div>
            ))}
          </div>
          {difficulty === 'casual' && (
            <div className="mt-3 bg-[#0A0A0A] rounded-xl p-4 text-center">
              <div className="text-gray-500 text-xs mb-1">Total EBK Score</div>
              <div className={`font-black text-2xl ${
                totalEBK / teamSize >= 70 ? 'text-green-400' :
                totalEBK / teamSize >= 50 ? 'text-yellow-400' :
                totalEBK / teamSize >= 30 ? 'text-orange-400' : 'text-red-400'
              }`}>
                ⚡{totalEBK.toFixed(1)} <span className="text-sm font-normal text-gray-500">(avg {(totalEBK / teamSize).toFixed(1)})</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={() => { setPicks([]); setScreen('draft') }}
            className="flex-1 bg-[#111827] hover:bg-[#1e2d45] text-white font-black py-3 rounded-xl transition-colors border border-gray-700">
            Draft Again
          </button>
          <button onClick={reset}
            className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-black py-3 rounded-xl transition-colors">
            Change Settings
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PracticePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-4xl animate-bounce">🏀</div>
      </div>
    }>
      <PracticeContent />
    </Suspense>
  )
}
