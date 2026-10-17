'use client'
import { useState, useEffect, useRef, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CURRENT_TEAMS, getCurrentTeam } from '@/lib/teams'
import { type TeamMode, type Difficulty, type Player, TEAM_SIZES, getRequiredPositions } from '@/types/game'

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

// Best possible given the exact teams that were spun during this draft session.
// For each pick turn i, only players from spunTeams[i] were available.
// Greedily assign the highest-EBK eligible player from each spin to the best open slot.
function getBestPossibleFromSpins(
  players: Player[],
  requiredSlots: string[],
  spunTeams: string[],
): number {
  const usedIds = new Set<number>()
  const filledSlots = new Set<number>()
  let total = 0

  for (let turn = 0; turn < spunTeams.length && turn < requiredSlots.length; turn++) {
    const team = spunTeams[turn]
    const pool = players
      .filter(p => getCurrentTeam(p.team) === team && !usedIds.has(p.id))
      .sort((a, b) => b.ebkScore - a.ebkScore)

    // Try to place the best player from this team into the best open slot
    let placed = false
    for (const p of pool) {
      const positions = p.positions.split(',')
      // Prefer a matching starter slot first
      for (let j = 0; j < Math.min(5, requiredSlots.length); j++) {
        if (!filledSlots.has(j) && positions.includes(requiredSlots[j])) {
          total += p.ebkScore
          usedIds.add(p.id)
          filledSlots.add(j)
          placed = true
          break
        }
      }
      if (placed) break
      // Fall back to any open bench slot
      for (let j = 5; j < requiredSlots.length; j++) {
        if (!filledSlots.has(j)) {
          total += p.ebkScore
          usedIds.add(p.id)
          filledSlots.add(j)
          placed = true
          break
        }
      }
      if (placed) break
    }
  }
  return total
}

function getGrade(pct: number): { grade: string; label: string; color: string } {
  if (pct >= 95) return { grade: 'S', label: 'Perfect',       color: 'text-purple-400' }
  if (pct >= 85) return { grade: 'A', label: 'Great',         color: 'text-green-400'  }
  if (pct >= 70) return { grade: 'B', label: 'Good',          color: 'text-blue-400'   }
  if (pct >= 55) return { grade: 'C', label: 'Average',       color: 'text-yellow-400' }
  if (pct >= 40) return { grade: 'D', label: 'Below Average', color: 'text-orange-400' }
  return              { grade: 'F', label: 'Rough Draft',   color: 'text-red-400'    }
}

function PracticeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [screen, setScreen] = useState<'setup' | 'draft' | 'result'>('setup')
  const [teamMode, setTeamMode] = useState<TeamMode>('starter5')
  const [difficulty, setDifficulty] = useState<Difficulty>('casual')

  const [players, setPlayers] = useState<Player[]>([])
  const playerById = useMemo(() => new Map(players.map(p => [p.id, p])), [players])
  const [loadingPlayers, setLoadingPlayers] = useState(false)
  // Slot-indexed: picks[i] = player id in slot i, null = empty
  const [picks, setPicks] = useState<(number | null)[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null)
  const [filterPos, setFilterPos] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [statMode, setStatMode] = useState('games_played')
  const [spunTeamsHistory, setSpunTeamsHistory] = useState<string[]>([])

  // Spinner
  const [spunTeam, setSpunTeam] = useState<string | null>(null)
  const [isSpinning, setIsSpinning] = useState(false)
  const [spinDisplay, setSpinDisplay] = useState('?')
  const spinRefs = useRef<ReturnType<typeof setTimeout>[]>([])
  const [shuffledIds, setShuffledIds] = useState<number[]>([])

  // Load players when entering draft
  useEffect(() => {
    if (screen !== 'draft' || players.length > 0) return
    const controller = new AbortController()
    setLoadingPlayers(true)
    fetch('/api/players', { signal: controller.signal })
      .then(r => r.json())
      .then((data: Player[]) => { setPlayers(data); setLoadingPlayers(false); triggerSpin(data, []) })
      .catch(err => { if (err.name !== 'AbortError') setLoadingPlayers(false) })
    return () => controller.abort()
  }, [screen, players.length])

  // Clean up any pending spin timers on unmount
  useEffect(() => {
    return () => {
      spinRefs.current.forEach(id => { clearTimeout(id); clearInterval(id) })
      spinRefs.current = []
    }
  }, [])

  const teamSize = TEAM_SIZES[teamMode]
  const requiredSlots = getRequiredPositions(teamMode)
  const filledCount = picks.filter(id => id !== null).length
  const takenIds = new Set(picks.filter((id): id is number => id !== null))

  // Track which starter slot positions are already filled (by slot label, not player's primary)
  const usedStarterPositions = new Set(
    requiredSlots.slice(0, 5).filter((_, i) => picks[i] !== null)
  )
  const isStarterSlot = picks.slice(0, 5).some(id => id === null)
  const remainingStarterPositions = ['PG', 'SG', 'SF', 'PF', 'C'].filter(p => !usedStarterPositions.has(p))

  function triggerSpin(afterPlayers: Player[], currentPicks: (number | null)[]) {
    // Cancel any in-progress spin before starting a new one
    spinRefs.current.forEach(id => { clearInterval(id); clearTimeout(id) })
    spinRefs.current = []

    const takenNow = new Set(currentPicks.filter((id): id is number => id !== null))
    const isNextStarter = currentPicks.slice(0, 5).some(id => id === null)
    // Which slot positions are consumed in current picks
    const usedPos = new Set(requiredSlots.slice(0, 5).filter((_, i) => currentPicks[i] !== null))
    const available = afterPlayers.filter(p => {
      if (takenNow.has(p.id)) return false
      // Block only if ALL of the player's positions are already used
      if (isNextStarter && p.positions.split(',').every(pos => usedPos.has(pos))) return false
      return true
    })
    const availableTeams = Array.from(new Set(available.map(p => getCurrentTeam(p.team))))
      .filter(t => CURRENT_TEAMS.some(ct => ct.abbr === t))
    if (availableTeams.length === 0) return
    const target = availableTeams[Math.floor(Math.random() * availableTeams.length)]

    setIsSpinning(true)
    setSpunTeam(null)
    setSpinDisplay('?')
    const allAbbrs = CURRENT_TEAMS.map(t => t.abbr)
    const rnd = () => allAbbrs[Math.floor(Math.random() * allAbbrs.length)]

    const p1 = setInterval(() => setSpinDisplay(rnd()), 80)
    spinRefs.current.push(p1)
    const t1 = setTimeout(() => {
      clearInterval(p1)
      const p2 = setInterval(() => setSpinDisplay(rnd()), 160)
      spinRefs.current.push(p2)
      const t2 = setTimeout(() => {
        clearInterval(p2)
        const p3 = setInterval(() => setSpinDisplay(rnd()), 320)
        spinRefs.current.push(p3)
        const t3 = setTimeout(() => {
          clearInterval(p3)
          setSpunTeam(target)
          setIsSpinning(false)
          setSpinDisplay(target)
          setSpunTeamsHistory(prev => [...prev, target])
          // Shuffle team's players once — stable for this pick turn
          const pool = afterPlayers.filter(p => getCurrentTeam(p.team) === target)
          setShuffledIds([...pool].sort(() => Math.random() - 0.5).map(p => p.id))
          spinRefs.current = []
        }, 640)
        spinRefs.current.push(t3)
      }, 800)
      spinRefs.current.push(t2)
    }, 1200)
    spinRefs.current.push(t1)
  }

  const spunTeamInfo = spunTeam ? CURRENT_TEAMS.find(t => t.abbr === spunTeam) : null

  const filteredPlayers = shuffledIds
    .map(id => playerById.get(id))
    .filter((p): p is Player => {
      if (!p) return false
      if (difficulty === 'ebk' && searchQuery.length < 3) return false
      if (takenIds.has(p.id)) return false
      // Starter slots: hide player only if ALL their positions are already used
      if (isStarterSlot && p.positions.split(',').every(pos => usedStarterPositions.has(pos))) return false
      if (filterPos !== 'ALL' && !p.positions.split(',').includes(filterPos)) return false
      if (searchQuery) {
        const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        const q = norm(searchQuery)
        if (!norm(`${p.firstName} ${p.lastName}`).includes(q) && !norm(p.team).includes(q)) return false
      }
      return true
    })

  const selectedPlayer = selectedPlayerId !== null ? playerById.get(selectedPlayerId) ?? null : null

  // Which slots are valid targets for the selected player
  function getValidSlots(player: Player): Set<number> {
    const valid = new Set<number>()
    const playerPositions = player.positions.split(',')
    requiredSlots.forEach((s, i) => {
      if (picks[i] !== null) return // already filled
      if (playerPositions.includes(s)) valid.add(i) // any of the player's positions
      if (s === 'BENCH') valid.add(i)               // any bench slot
    })
    return valid
  }

  function selectPlayer(id: number) {
    if (filledCount >= teamSize) return
    const player = playerById.get(id)
    if (!player) return
    if (spunTeam && getCurrentTeam(player.team) !== spunTeam) return
    // Toggle: clicking selected player again deselects
    setSelectedPlayerId(prev => prev === id ? null : id)
  }

  function placeInSlot(slotIndex: number) {
    if (!selectedPlayer) return
    const validSlots = getValidSlots(selectedPlayer)
    if (!validSlots.has(slotIndex)) return

    const newPicks = [...picks]
    newPicks[slotIndex] = selectedPlayer.id
    setPicks(newPicks)
    setSelectedPlayerId(null)

    const newFilled = newPicks.filter(id => id !== null).length
    if (newFilled < teamSize) triggerSpin(players, newPicks)
  }

  function unpick(fromSlot: number) {
    const newPicks = [...picks]
    newPicks[fromSlot] = null
    setPicks(newPicks)
    setSelectedPlayerId(null)
    triggerSpin(players, newPicks)
  }

  function reset() {
    spinRefs.current.forEach(id => { clearTimeout(id); clearInterval(id) }); spinRefs.current = []
    setIsSpinning(false); setSpunTeam(null)
    setPicks([])
    setSpunTeamsHistory([])
    setFilterPos('ALL')
    setSearchQuery('')
    setScreen('setup')
  }

  // ── Setup ──────────────────────────────────────────────────────────────────
  if (screen === 'setup') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <button onClick={() => router.push('/lobby')} className="text-gray-400 hover:text-white text-sm mb-6 flex items-center gap-1">
            ← Back to Lobby
          </button>
          <div className="text-center mb-8">
            <h1 className="font-display text-5xl text-white leading-none">Practice</h1>
            <p className="text-gray-400 text-sm mt-2">Draft solo — no pressure, no timer</p>
          </div>

          <div className="card-surface rounded-2xl p-6 space-y-5">
            <div>
              <label className="text-label block mb-3">Team Size</label>
              <div className="grid grid-cols-3 gap-2">
                {([['starter5', 'Starter 5', '5 players'], ['bench8', 'Bench 8', '8 players'], ['full12', 'Full 12', '12 players']] as const).map(([val, label, sub]) => (
                  <button key={val} onClick={() => setTeamMode(val)}
                    className={`rounded-xl p-3 text-center border transition-all ${teamMode === val ? 'border-orange-500 bg-orange-600/20 text-orange-400 shadow-[0_0_12px_rgba(234,88,12,0.15)]' : 'border-white/[0.07] bg-white/[0.02] text-gray-400 hover:border-white/[0.15] hover:text-white'}`}>
                    <div className={`font-black text-sm ${teamMode === val ? 'text-orange-400' : 'text-white'}`}>{label}</div>
                    <div className="text-[11px] mt-0.5 opacity-60">{sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-label block mb-3">Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setDifficulty('casual')}
                  className={`rounded-xl p-3 text-center border transition-all ${difficulty === 'casual' ? 'border-orange-500 bg-orange-600/20 shadow-[0_0_12px_rgba(234,88,12,0.15)]' : 'border-white/[0.07] bg-white/[0.02] text-gray-400 hover:border-white/[0.15] hover:text-white'}`}>
                  <div className={`font-black text-sm ${difficulty === 'casual' ? 'text-orange-400' : 'text-white'}`}>Casual</div>
                  <div className="text-[11px] opacity-60 mt-0.5">EBK scores shown</div>
                </button>
                <button onClick={() => setDifficulty('ebk')}
                  className={`rounded-xl p-3 text-center border transition-all ${difficulty === 'ebk' ? 'border-yellow-500 bg-yellow-600/10 shadow-[0_0_12px_rgba(234,179,8,0.12)]' : 'border-white/[0.07] bg-white/[0.02] text-gray-400 hover:border-white/[0.15] hover:text-white'}`}>
                  <div className={`font-black text-sm ${difficulty === 'ebk' ? 'text-yellow-400' : 'text-white'}`}>EBK Mode</div>
                  <div className="text-[11px] opacity-60 mt-0.5">Blind picks — no scores</div>
                </button>
              </div>
            </div>

            <button
              onClick={() => { setPicks(Array(TEAM_SIZES[teamMode]).fill(null)); setSpunTeamsHistory([]); setScreen('draft') }}
              className="btn-primary w-full py-4 text-base">
              Start Practice
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Draft ──────────────────────────────────────────────────────────────────
  if (screen === 'draft') {
    const isDone = filledCount >= teamSize

    return (
      <div className="min-h-screen py-6 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-orange-500 font-black text-lg">
                Practice · {teamMode === 'starter5' ? 'Starter 5' : teamMode === 'bench8' ? 'Bench 8' : 'Full 12'}
                {difficulty === 'ebk' && <span className="ml-2 text-yellow-500">EBK</span>}
              </div>
              <div className="text-gray-400 text-xs">No timer · No opponent · Stats revealed at the end</div>
            </div>
            <button onClick={reset} className="text-gray-400 hover:text-white text-sm">← Exit</button>
          </div>

          {loadingPlayers ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="w-7 h-7 rounded-full border-2 border-orange-500 border-t-transparent animate-spin mx-auto mb-3"></div>
                <p className="text-gray-400 text-sm">Loading players...</p>
              </div>
            </div>
          ) : (
            <>
            {/* Mobile: compact team strip on top */}
          <div className="lg:hidden mb-4">
            <div className="card-surface rounded-2xl p-3">
              <div className="text-orange-400 font-black text-xs mb-2">
                Your Team <span className="text-gray-400 font-normal">({filledCount}/{teamSize})</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {requiredSlots.map((slotPos, i) => {
                  const pickedId = picks[i]
                  const pickedPlayer = (pickedId !== null && pickedId !== undefined) ? playerById.get(pickedId) ?? null : null
                  const isBench = slotPos === 'BENCH'
                  const validSlots = selectedPlayer ? getValidSlots(selectedPlayer) : new Set<number>()
                  const isValidTarget = selectedPlayer !== null && validSlots.has(i) && pickedPlayer === null
                  return (
                    <div
                      key={i}
                      onClick={() => isValidTarget ? placeInSlot(i) : undefined}
                      className={`rounded px-2 py-1 text-xs flex items-center gap-1.5 transition-all ${
                        isValidTarget
                          ? 'bg-orange-600/20 border border-orange-500 cursor-pointer'
                          : pickedPlayer
                          ? 'bg-[#0A0A0A]'
                          : 'bg-[#0A0A0A] border border-dashed border-gray-700'
                      }`}
                    >
                      <span className={`font-bold w-6 shrink-0 text-[10px] ${isBench ? 'text-gray-400' : 'text-orange-400'}`}>
                        {isBench ? 'BN' : slotPos}
                      </span>
                      <span className={`truncate flex-1 ${pickedPlayer ? 'text-white' : isValidTarget ? 'text-orange-300' : 'text-gray-400'}`}>
                        {pickedPlayer ? pickedPlayer.lastName : isValidTarget ? 'tap' : '—'}
                      </span>
                      {pickedPlayer && (
                        <button onClick={e => { e.stopPropagation(); unpick(i) }} className="text-gray-400 hover:text-red-400 text-[10px] shrink-0">✕</button>
                      )}
                    </div>
                  )
                })}
              </div>
              {isDone && (
                <button onClick={() => setScreen('result')} className="w-full mt-3 bg-green-600 hover:bg-green-700 text-white font-black py-2 rounded-xl text-sm transition-colors">
                  See Results →
                </button>
              )}
            </div>
          </div>

          <div className="lg:grid lg:grid-cols-4 lg:gap-4">
            {/* My Team (desktop only) */}
            <div className="hidden lg:block card-surface rounded-2xl p-4">
              <h3 className="text-white font-black text-sm mb-3">
                Your Team <span className="text-gray-400 font-normal">({filledCount}/{teamSize})</span>
              </h3>
              <div className="space-y-1.5">
                {requiredSlots.map((slotPos, i) => {
                  const pickedId = picks[i]
                  const pickedPlayer = (pickedId !== null && pickedId !== undefined) ? playerById.get(pickedId) ?? null : null
                  const isBench = slotPos === 'BENCH'
                  const displayLabel = isBench ? 'BN' : slotPos
                  const validSlots = selectedPlayer ? getValidSlots(selectedPlayer) : new Set<number>()
                  const isValidTarget = selectedPlayer !== null && validSlots.has(i) && pickedPlayer === null
                  const isBlocked = selectedPlayer !== null && !validSlots.has(i) && pickedPlayer === null
                  return (
                    <div
                      key={i}
                      onClick={() => isValidTarget ? placeInSlot(i) : undefined}
                      className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 transition-all ${
                        isValidTarget
                          ? 'bg-orange-600/20 border border-orange-500 cursor-pointer hover:bg-orange-600/40'
                          : isBlocked
                          ? 'bg-[#0A0A0A] border border-dashed border-gray-800 opacity-30'
                          : pickedPlayer
                          ? 'bg-[#0A0A0A]'
                          : 'bg-[#0A0A0A] border border-dashed border-gray-700'
                      }`}
                    >
                      <span className={`font-bold w-8 shrink-0 ${isBench ? 'text-gray-400' : 'text-orange-400'}`}>{displayLabel}</span>
                      {pickedPlayer ? (
                        <span className="text-white truncate flex-1" title={`${pickedPlayer.firstName} ${pickedPlayer.lastName}`}>
                          {pickedPlayer.firstName} {pickedPlayer.lastName} <span className="text-gray-400">({pickedPlayer.team})</span>
                        </span>
                      ) : (
                        <span className={isValidTarget ? 'text-orange-300' : 'text-gray-400'}>
                          {isValidTarget ? 'tap to place' : 'empty'}
                        </span>
                      )}
                      {pickedPlayer && (
                        <button onClick={e => { e.stopPropagation(); unpick(i) }} className="text-gray-400 hover:text-red-400 text-xs shrink-0">✕</button>
                      )}
                    </div>
                  )
                })}
              </div>
              {isDone && (
                <button onClick={() => setScreen('result')} className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-black py-2.5 rounded-xl text-sm transition-colors">
                  See Results →
                </button>
              )}
            </div>

              {/* Player Pool */}
              <div className="lg:col-span-3">
                {/* Team Spinner */}
                <div className={`rounded-xl p-3 mb-3 flex items-center gap-3 border-2 transition-all duration-300 ${
                  isSpinning ? 'border-yellow-500/60 bg-yellow-900/15 shadow-[0_0_16px_rgba(234,179,8,0.12)]' :
                  spunTeam   ? 'border-orange-500/60 bg-orange-900/15 shadow-[0_0_16px_rgba(249,115,22,0.1)]' : 'border-white/[0.08] bg-white/[0.02]'
                }`}>
                  <div className={`font-display text-4xl w-16 text-center shrink-0 leading-none transition-all ${isSpinning ? 'text-yellow-400 animate-pulse' : spunTeam ? 'text-orange-400' : 'text-gray-600'}`}>
                    {spinDisplay}
                  </div>
                  <div className="flex-1">
                    {isSpinning ? (
                      <div>
                        <div className="text-yellow-400 font-black text-sm">Spinning...</div>
                        <div className="text-label mt-0.5">Your team is being assigned</div>
                      </div>
                    ) : spunTeam && spunTeamInfo ? (
                      <div>
                        <div className="text-white font-black text-sm">{spunTeamInfo.city} {spunTeamInfo.name}</div>
                        <div className="text-label mt-0.5">{filteredPlayers.length} available · Pick from this team only</div>
                      </div>
                    ) : (
                      <div className="text-gray-500 text-sm">Loading teams...</div>
                    )}
                  </div>
                  {spunTeam && !isSpinning && (
                    <div className="live-banner shrink-0 text-[9px]">
                      <span className="live-dot" />
                      PICK
                    </div>
                  )}
                </div>

                {/* Search */}
                <div className="relative mb-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search player or team..."
                    className="w-full bg-[#111] border border-gray-700 rounded-lg pl-8 pr-8 py-2 text-white text-sm focus:outline-none focus:border-orange-500 placeholder-gray-600"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs">✕</button>
                  )}
                </div>

                {/* Position availability banner */}
                {!isDone && (
                  <div className="flex items-center gap-2 mb-2 card-surface rounded-lg px-3 py-2 flex-wrap">
                    {isStarterSlot ? (
                      <>
                        <span className="text-gray-400 text-xs shrink-0">Still need:</span>
                        {remainingStarterPositions.map(pos => (
                          <span key={pos} className="text-xs font-black px-2 py-0.5 rounded bg-orange-600 text-white">{pos}</span>
                        ))}
                      </>
                    ) : (
                      <span className="text-gray-400 text-xs">Bench slot — any player</span>
                    )}
                  </div>
                )}

                {/* Position filter — hidden in EBK mode */}
                <div className="flex gap-1.5 mb-2 flex-wrap">
                  {difficulty !== 'ebk' && ['ALL', 'PG', 'SG', 'SF', 'PF', 'C'].map(pos => (
                    <button key={pos} onClick={() => setFilterPos(pos)}
                      className={`pos-badge transition-all ${
                        pos === 'ALL'
                          ? filterPos === pos ? 'bg-orange-600/30 border-orange-500/60 text-orange-300' : 'bg-white/[0.04] border-white/[0.08] text-gray-400 hover:text-white'
                          : pos === 'PG' ? (filterPos === pos ? 'pos-pg ring-1 ring-blue-400/40' : 'bg-transparent border-blue-500/20 text-blue-500/50 hover:pos-pg')
                          : pos === 'SG' ? (filterPos === pos ? 'pos-sg ring-1 ring-cyan-400/40' : 'bg-transparent border-cyan-500/20 text-cyan-500/50 hover:pos-sg')
                          : pos === 'SF' ? (filterPos === pos ? 'pos-sf ring-1 ring-green-400/40' : 'bg-transparent border-green-500/20 text-green-500/50 hover:pos-sf')
                          : pos === 'PF' ? (filterPos === pos ? 'pos-pf ring-1 ring-yellow-400/40' : 'bg-transparent border-yellow-500/20 text-yellow-500/50 hover:pos-pf')
                          : (filterPos === pos ? 'pos-c ring-1 ring-red-400/40' : 'bg-transparent border-red-500/20 text-red-500/50 hover:pos-c')
                      }`}>
                      {pos}
                    </button>
                  ))}
                  <span className="ml-auto text-xs text-gray-400 self-center">
                    {difficulty === 'ebk' && searchQuery.length < 3 ? 'type 3+ letters to search' : `${filteredPlayers.length} players`}
                  </span>
                </div>

                {/* Stat mode selector (casual only) */}
                {difficulty === 'casual' && (
                  <div className="flex gap-1.5 mb-3 flex-wrap">
                    {([['games_played', 'GP'], ['ppg', 'PPG'], ['rpg', 'RPG'], ['apg', 'APG']] as const).map(([val, label]) => (
                      <button key={val} onClick={() => setStatMode(val)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${statMode === val ? 'bg-blue-600 text-white' : 'bg-[#111] text-gray-400 hover:text-white'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                {isSpinning && (
                  <div className="flex items-center justify-center h-24 rounded-xl bg-yellow-900/10 border border-yellow-600/30 mb-3">
                    <p className="text-yellow-400 font-bold text-sm animate-pulse">🔒 Locked — waiting for spin to finish...</p>
                  </div>
                )}

                {selectedPlayer && (
                  <div className="mb-2 bg-orange-600/10 border border-orange-500 rounded-lg px-3 py-2 text-xs text-orange-300 flex items-center justify-between">
                    <span><span className="font-black text-orange-400">{selectedPlayer.firstName} {selectedPlayer.lastName}</span> selected — tap a slot on the left</span>
                    <button onClick={() => setSelectedPlayerId(null)} className="text-orange-400 hover:text-white ml-2">✕</button>
                  </div>
                )}

                <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
                  {filteredPlayers.map(player => {
                    const playerPositions = player.positions.split(',')
                    const canSelect = filledCount < teamSize && !isSpinning && spunTeam !== null
                    const isSelected = selectedPlayerId === player.id

                    return (
                      <button
                        key={player.id}
                        onClick={() => canSelect && selectPlayer(player.id)}
                        disabled={!canSelect}
                        className={`w-full rounded-xl px-4 py-3 flex items-center gap-3 text-left transition-all ${
                          isSelected
                            ? 'bg-orange-600/30 border-2 border-orange-500 cursor-pointer'
                            : canSelect
                            ? 'bg-[#111] hover:bg-[#1e2d45] hover:border-orange-500 border-2 border-transparent cursor-pointer'
                            : 'bg-[#0D0D0D] border-2 border-transparent cursor-default opacity-40'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-bold text-sm truncate" title={`${player.firstName} ${player.lastName}`}>{player.firstName} {player.lastName}</div>
                          <div className="text-gray-400 text-xs">{player.team} · {player.yearFrom}–{player.yearTo}</div>
                        </div>
                        {difficulty === 'casual' && (
                          <div className="text-right shrink-0 min-w-[56px]">
                            <div className="text-white font-black text-sm">
                              {statMode === 'games_played' ? getStatValue(player, statMode) : getStatValue(player, statMode).toFixed(1)}
                            </div>
                            <div className="text-gray-400 text-xs">
                              {statMode === 'games_played' ? 'GP' : statMode.toUpperCase()}
                            </div>
                          </div>
                        )}
                        <div className="flex gap-1 shrink-0">
                          {playerPositions.map((pos: string) => (
                            <span key={pos} className="text-xs bg-orange-600/20 text-orange-400 px-1.5 py-0.5 rounded font-bold">{pos}</span>
                          ))}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </>
          )}
        </div>
      </div>
    )
  }

  // ── Results ────────────────────────────────────────────────────────────────
  // Use slot-indexed lookup to preserve the slot↔player mapping in the results display.
  // filter(Boolean) after map() would compress nulls and misalign slot labels.
  const pickedPlayersBySlot = picks.map(id => (id !== null ? playerById.get(id) ?? null : null))
  const pickedPlayers = pickedPlayersBySlot.filter((p): p is Player => p !== null)
  const totals = {
    games_played: pickedPlayers.reduce((s, p) => s + p.careerGames, 0),
    ppg: pickedPlayers.reduce((s, p) => s + p.careerPPG, 0),
    rpg: pickedPlayers.reduce((s, p) => s + p.careerRPG, 0),
    apg: pickedPlayers.reduce((s, p) => s + p.careerAPG, 0),
  }
  const totalEBK = pickedPlayers.reduce((s, p) => s + p.ebkScore, 0)
  const bestEBK = getBestPossibleFromSpins(players, requiredSlots, spunTeamsHistory)
  const pct = bestEBK > 0 ? (totalEBK / bestEBK) * 100 : 0
  const { grade, label: gradeLabel, color: gradeColor } = getGrade(pct)

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-2xl mx-auto">

        {/* EBK Score + Grade */}
        <div className="card-accent rounded-2xl p-6 mb-5 text-center animate-scale-in">
          <div className="text-label mb-3">Practice Result</div>
          <div className={`font-display leading-none mb-1 ${gradeColor}`} style={{ fontSize: 'clamp(5rem, 22vw, 8rem)' }}>
            {grade}
          </div>
          <div className={`font-black text-lg mb-5 ${gradeColor}`}>{gradeLabel}</div>

          {/* Score comparison row */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="card-surface rounded-xl p-3 text-center">
              <div className={`font-display text-3xl leading-none tabular-nums ${gradeColor}`}>{totalEBK.toFixed(1)}</div>
              <div className="text-label mt-1.5">Your EBK</div>
            </div>
            <div className="card-surface rounded-xl p-3 text-center flex flex-col items-center justify-center">
              <div className={`font-display text-2xl leading-none tabular-nums ${gradeColor}`}>{pct.toFixed(0)}%</div>
              <div className="text-label mt-1.5">of Optimal</div>
            </div>
            <div className="card-surface rounded-xl p-3 text-center">
              <div className="font-display text-3xl leading-none text-gray-400 tabular-nums">{bestEBK.toFixed(1)}</div>
              <div className="text-label mt-1.5">Best Possible</div>
            </div>
          </div>

          {/* Score bar */}
          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden mb-1">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                pct >= 85 ? 'bg-gradient-to-r from-green-600 to-green-400' : pct >= 70 ? 'bg-gradient-to-r from-blue-600 to-blue-400' : pct >= 55 ? 'bg-gradient-to-r from-yellow-600 to-yellow-400' : pct >= 40 ? 'bg-gradient-to-r from-orange-700 to-orange-400' : 'bg-gradient-to-r from-red-700 to-red-500'
              }`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <div className="text-label text-center">EBK = career stats weighted by impact</div>
        </div>

        {/* Roster */}
        <div className="card-surface rounded-2xl p-4 mb-5 animate-fade-up-1">
          <h2 className="text-gray-400 text-xs uppercase tracking-wide mb-3">Your Roster</h2>
          <div className="space-y-2">
            {requiredSlots.map((slotPos, i) => {
              const p = pickedPlayersBySlot[i]
              if (!p) return null
              return (
                <div key={i} className="draft-slot draft-slot-filled rounded-lg px-3 py-2.5 flex items-center gap-2">
                  <span className={`font-display text-sm w-8 shrink-0 leading-none ${slotPos === 'BENCH' ? 'text-gray-500' : 'text-orange-400'}`}>
                    {slotPos === 'BENCH' ? 'BN' : slotPos}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-bold truncate">{p.firstName} {p.lastName}</div>
                    <div className="text-gray-500 text-[11px]">{p.team} · {p.careerGames}GP · {p.careerPPG.toFixed(1)}P/{p.careerRPG.toFixed(1)}R/{p.careerAPG.toFixed(1)}A</div>
                  </div>
                  <div className={`font-display text-xl leading-none shrink-0 tabular-nums ${
                    p.ebkScore >= 80 ? 'text-green-400' :
                    p.ebkScore >= 60 ? 'text-yellow-400' :
                    p.ebkScore >= 40 ? 'text-orange-400' : 'text-red-400'
                  }`}>{p.ebkScore.toFixed(1)}</div>
                </div>
              )
            })}
          </div>
          <div className="mt-3 border-t border-gray-800 pt-3 flex justify-between items-center px-1">
            <span className="text-gray-400 text-xs uppercase tracking-wide">Team EBK Total</span>
            <span className={`font-black text-lg ${gradeColor}`}>{totalEBK.toFixed(1)}</span>
          </div>
        </div>

        {/* Totals */}
        <div className="card-surface rounded-2xl p-5 mb-6">
          <h2 className="text-gray-400 text-xs uppercase tracking-wide mb-3">Team Totals</h2>
          <div className="grid grid-cols-2 gap-3">
            {(Object.entries(STAT_LABELS) as [string, string][]).map(([key, label]) => (
              <div key={key} className="bg-[#0A0A0A] rounded-xl p-4 text-center">
                <div className="text-gray-400 text-xs mb-1">{label}</div>
                <div className="text-white font-black text-2xl">
                  {key === 'games_played' ? Math.round(totals[key as keyof typeof totals]) : (totals[key as keyof typeof totals]).toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 animate-fade-up-2">
          <button onClick={() => { const newPicks = Array(TEAM_SIZES[teamMode]).fill(null); setPicks(newPicks); setSpunTeamsHistory([]); setScreen('draft'); triggerSpin(players, newPicks) }}
            className="btn-secondary flex-1">
            Draft Again
          </button>
          <button onClick={reset} className="btn-primary flex-1">
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin"></div>
      </div>
    }>
      <PracticeContent />
    </Suspense>
  )
}
