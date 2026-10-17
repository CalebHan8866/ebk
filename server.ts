import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { Server as SocketServer } from 'socket.io'
import { PrismaClient } from '@prisma/client'
import { BADGES, EMOTES, MILESTONES } from './src/lib/accessories'
import { verifyToken } from './src/lib/auth'

const dev = process.env.NODE_ENV !== 'production'
const hostname = '0.0.0.0'
const port = parseInt(process.env.PORT || '3000')
const app = next({ dev, hostname, port, dir: process.cwd() })
const handle = app.getRequestHandler()
const prisma = new PrismaClient()

// ─── Types ───────────────────────────────────────────────────────────────────

type TeamMode = 'starter5' | 'bench8' | 'full12'
type SeriesLength = 1 | 3 | 5
type Difficulty = 'casual' | 'ebk'

// ─── Team Lineage ────────────────────────────────────────────────────────────

const CURRENT_TEAM_ABBRS = [
  'ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GSW',
  'HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NOP','NYK',
  'OKC','ORL','PHI','PHX','POR','SAC','SAS','TOR','UTA','WAS',
]

const TEAM_LINEAGE: Record<string, string> = {
  'ATL':'ATL','STL':'ATL','MHK':'ATL','TCB':'ATL','TRI':'ATL','MLH':'ATL',
  'BOS':'BOS',
  'BKN':'BKN','NJN':'BKN','NJA':'BKN','NYN':'BKN','BRK':'BKN',
  'CHA':'CHA','CHH':'CHA','CHB':'CHA','CHO':'CHA',
  'CHI':'CHI',
  'CLE':'CLE',
  'DAL':'DAL',
  'DEN':'DEN','DNV':'DEN',
  'DET':'DET','FTW':'DET',
  'GSW':'GSW','SFW':'GSW','PHW':'GSW',
  'HOU':'HOU','SDR':'HOU',
  'IND':'IND',
  'LAC':'LAC','SDC':'LAC','BUF':'LAC',
  'LAL':'LAL','MNL':'LAL',
  'MEM':'MEM','VAN':'MEM',
  'MIA':'MIA',
  'MIL':'MIL',
  'MIN':'MIN',
  'NOP':'NOP','NOH':'NOP','NOK':'NOP',
  'NYK':'NYK',
  'OKC':'OKC','SEA':'OKC',
  'ORL':'ORL',
  'PHI':'PHI','SYR':'PHI',
  'PHX':'PHX','PHO':'PHX',
  'POR':'POR',
  'SAC':'SAC','KCK':'SAC','KCO':'SAC','CIN':'SAC','ROC':'SAC',
  'SAS':'SAS',
  'TOR':'TOR',
  'UTA':'UTA','NOJ':'UTA',
  'WAS':'WAS','WSB':'WAS','CAP':'WAS','BAL':'WAS','BLB':'WAS','CHZ':'WAS',
}

const CURRENT_TEAM_NAMES: Record<string, string> = {
  'Hawks':'ATL','Celtics':'BOS','Nets':'BKN','Hornets':'CHA','Bulls':'CHI',
  'Cavaliers':'CLE','Mavericks':'DAL','Nuggets':'DEN','Pistons':'DET','Warriors':'GSW',
  'Rockets':'HOU','Pacers':'IND','Clippers':'LAC','Lakers':'LAL','Grizzlies':'MEM',
  'Heat':'MIA','Bucks':'MIL','Timberwolves':'MIN','Pelicans':'NOP','Knicks':'NYK',
  'Thunder':'OKC','Magic':'ORL','76ers':'PHI','Suns':'PHX','Trail Blazers':'POR',
  'Kings':'SAC','Spurs':'SAS','Raptors':'TOR','Jazz':'UTA','Wizards':'WAS',
}

function getCurrentTeam(teamStr: string): string {
  if (TEAM_LINEAGE[teamStr]) return TEAM_LINEAGE[teamStr]
  if (CURRENT_TEAM_NAMES[teamStr]) return CURRENT_TEAM_NAMES[teamStr]
  return teamStr
}

function getRequiredPositions(teamMode: TeamMode): string[] {
  const starters = ['PG', 'SG', 'SF', 'PF', 'C']
  const benchCount = TEAM_SIZES[teamMode] - 5
  const bench = Array(benchCount).fill('BENCH')
  return [...starters, ...bench]
}

function getPickerUsedPositions(room: Room): { usedPositions: Set<string>; remainingBenchSlots: number } {
  const picker = room.draftOrder[room.currentPickIndex]
  const pickerSlots = picker === 'host' ? room.hostPickSlots : room.guestPickSlots
  const starterPositions = new Set(['PG', 'SG', 'SF', 'PF', 'C'])
  const usedPositions = new Set(pickerSlots.filter(s => starterPositions.has(s)))
  const benchUsed = pickerSlots.filter(s => s === 'BENCH').length
  const totalBench = TEAM_SIZES[room.teamMode] - 5
  return { usedPositions, remainingBenchSlots: totalBench - benchUsed }
}

function spinTeam(room: Room): string {
  const takenIds = new Set([...room.hostPicks, ...room.guestPicks])
  const { usedPositions, remainingBenchSlots } = getPickerUsedPositions(room)
  const starterSlotOpen = usedPositions.size < 5
  // Only spin teams that have players eligible for this pick
  const available = new Set<string>()
  for (const p of allPlayers) {
    if (takenIds.has(p.id)) continue
    const playerPositions = p.positions.split(',')
    const canFitStarter = starterSlotOpen && playerPositions.some(pos => !usedPositions.has(pos))
    const canFitBench = remainingBenchSlots > 0
    if (!canFitStarter && !canFitBench) continue
    available.add(getCurrentTeam(p.team))
  }
  const choices = CURRENT_TEAM_ABBRS.filter(t => available.has(t))
  if (choices.length === 0) return CURRENT_TEAM_ABBRS[Math.floor(Math.random() * CURRENT_TEAM_ABBRS.length)]
  return choices[Math.floor(Math.random() * choices.length)]
}

const TEAM_SIZES: Record<TeamMode, number> = {
  starter5: 5,
  bench8: 8,
  full12: 12,
}

const STAT_CYCLE = ['games_played', 'ppg', 'rpg', 'apg']

interface GameResult {
  game: number
  statMode: string
  hostTotal: number
  guestTotal: number
  winner: 'host' | 'guest' | 'draw'
}

interface Room {
  code: string
  hostSocketId: string
  guestSocketId: string | null
  hostUserId: string | null
  guestUserId: string | null
  hostName: string
  guestName: string | null
  teamMode: TeamMode
  series: SeriesLength
  difficulty: Difficulty
  source: 'online' | 'friends'
  status: 'waiting' | 'drafting' | 'result' | 'complete'
  draftOrder: ('host' | 'guest')[]
  currentPickIndex: number
  hostPicks: number[]
  guestPicks: number[]
  hostPickSlots: string[]
  guestPickSlots: string[]
  currentGame: number
  hostSeriesScore: number
  guestSeriesScore: number
  gameResults: GameResult[]
  currentSpunTeam: string | null
  hostJCGames: number
  guestJCGames: number
}

interface PlayerData {
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
  careerMPG: number
  ebkScore: number
  yearFrom: number
  yearTo: number
}

interface QueueEntry {
  socketId: string
  userId: string | null
  userName: string
  teamMode: TeamMode
  series: SeriesLength
  difficulty: Difficulty
  userRecord: { wins: number; losses: number; draws: number }
}

interface ReadyRoom {
  code: string
  hostEntry: QueueEntry
  guestEntry: QueueEntry
  hostReady: boolean
  guestReady: boolean
  timer: ReturnType<typeof setTimeout>
}

interface GameListing {
  code: string
  hostSocketId: string
  hostUserId: string | null
  hostName: string
  hostRecord: { wins: number; losses: number; draws: number }
  hostBadge: string
  hostStreak: number
  teamMode: TeamMode
  series: SeriesLength
}

// ─── Room Store ──────────────────────────────────────────────────────────────

const rooms = new Map<string, Room>()
const readyRooms = new Map<string, ReadyRoom>()
const gameListings = new Map<string, GameListing>()
const listingTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pickTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pickTimerStartedAt = new Map<string, number>()
const consecutiveTimeouts = new Map<string, { host: number; guest: number }>()
const emoteLastSent = new Map<string, number>() // socketId → timestamp
const pendingListingCreate = new Set<string>() // socketId → in-flight guard
// cooldown: userId → Map(opponentId → timestamp of last game end)
const recentMatchups = new Map<string, Map<string, number>>()
// grudge: userId → Map(opponentId → total games played together)
const matchupCount = new Map<string, Map<string, number>>()
let allPlayers: PlayerData[] = []
let playerById = new Map<number, PlayerData>() // fast O(1) lookup by id
// Seed DB uses id=71; after scrape-bbref runs it gets a hash-based ID — resolve dynamically.
let JAMESON_CURRY_ID = 71
function refreshJCId() {
  const jc = allPlayers.find(p => p.firstName === 'Jameson' && p.lastName === 'Curry')
  if (jc) JAMESON_CURRY_ID = jc.id
}

// ─── Cooldown helpers ────────────────────────────────────────────────────────

const COOLDOWN_MS = 30 * 60 * 1000
// Comma-separated user IDs that bypass the rematch cooldown (for automated testing)
const NOCOOLDOWN_USER_IDS = new Set(
  (process.env.NOCOOLDOWN_USER_IDS || '').split(',').filter(Boolean)
)

function recordMatchup(userId1: string | null, userId2: string | null) {
  if (!userId1 || !userId2) return
  const now = Date.now()
  if (!recentMatchups.has(userId1)) recentMatchups.set(userId1, new Map())
  if (!recentMatchups.has(userId2)) recentMatchups.set(userId2, new Map())
  recentMatchups.get(userId1)!.set(userId2, now)
  recentMatchups.get(userId2)!.set(userId1, now)
  // Increment grudge count
  if (!matchupCount.has(userId1)) matchupCount.set(userId1, new Map())
  if (!matchupCount.has(userId2)) matchupCount.set(userId2, new Map())
  const prev = matchupCount.get(userId1)!.get(userId2) || 0
  matchupCount.get(userId1)!.set(userId2, prev + 1)
  matchupCount.get(userId2)!.set(userId1, prev + 1)
}

function getMatchupCount(userId1: string | null, userId2: string | null): number {
  if (!userId1 || !userId2) return 0
  return matchupCount.get(userId1)?.get(userId2) || 0
}

async function saveGameRecords(room: Room, seriesWinner: 'host' | 'guest' | 'draw') {
  try {
    const records = []
    if (room.hostUserId) {
      records.push({
        userId: room.hostUserId,
        opponentName: room.guestName || 'Unknown',
        opponentId: room.guestUserId ?? undefined,
        result: seriesWinner === 'host' ? 'win' : seriesWinner === 'draw' ? 'draw' : 'loss',
        mySeriesScore: room.hostSeriesScore,
        oppSeriesScore: room.guestSeriesScore,
        teamMode: room.teamMode,
        series: room.series,
        source: room.source,
      })
    }
    if (room.guestUserId) {
      records.push({
        userId: room.guestUserId,
        opponentName: room.hostName,
        opponentId: room.hostUserId ?? undefined,
        result: seriesWinner === 'guest' ? 'win' : seriesWinner === 'draw' ? 'draw' : 'loss',
        mySeriesScore: room.guestSeriesScore,
        oppSeriesScore: room.hostSeriesScore,
        teamMode: room.teamMode,
        series: room.series,
        source: room.source,
      })
    }
    if (records.length) await prisma.gameRecord.createMany({ data: records })
  } catch { /* non-critical */ }
}

function cooldownRemaining(userId1: string | null, userId2: string | null): number {
  if (!userId1 || !userId2) return 0
  if (NOCOOLDOWN_USER_IDS.has(userId1) || NOCOOLDOWN_USER_IDS.has(userId2)) return 0
  const last = recentMatchups.get(userId1)?.get(userId2)
  if (!last) return 0
  return Math.max(0, COOLDOWN_MS - (Date.now() - last))
}

// ─── Accessories unlock ───────────────────────────────────────────────────────

async function updateStatsAndUnlock(
  io: SocketServer,
  userId: string,
  socketId: string,
  won: boolean,
  isDraw: boolean,
  jcGamesThisSeries: number = 0,
  isHost: boolean = false,
) {
  try {
    // Update wins/losses/draws/gamesPlayed/winStreak/jamesonCurryGames/firstPick atomically
    await prisma.user.update({
      where: { id: userId },
      data: {
        wins:              won    ? { increment: 1 } : undefined,
        losses:            !won && !isDraw ? { increment: 1 } : undefined,
        draws:             isDraw ? { increment: 1 } : undefined,
        gamesPlayed:       { increment: 1 },
        winStreak:         won    ? { increment: 1 } : { set: 0 },
        jamesonCurryGames: jcGamesThisSeries > 0 ? { increment: jcGamesThisSeries } : undefined,
        firstPickGames:    isHost ? { increment: 1 } : undefined,
        firstPickWins:     isHost && won ? { increment: 1 } : undefined,
      },
    })

    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { wins: true, gamesPlayed: true, winStreak: true, maxWinStreak: true,
                jamesonCurryGames: true,
                unlockedBadges: true, unlockedEmotes: true, unlockedMilestones: true },
    })
    if (!u) return

    // Update maxWinStreak if beaten
    if (u.winStreak > u.maxWinStreak) {
      await prisma.user.update({ where: { id: userId }, data: { maxWinStreak: u.winStreak } })
    }
    const effectiveMaxStreak = Math.max(u.maxWinStreak, u.winStreak)

    const stats = { wins: u.wins, gamesPlayed: u.gamesPlayed, winStreak: u.winStreak, maxWinStreak: effectiveMaxStreak, jcGames: u.jamesonCurryGames }
    const curBadges:     string[] = JSON.parse(u.unlockedBadges     || '[]')
    const curEmotes:     string[] = JSON.parse(u.unlockedEmotes     || '[]')
    const curMilestones: string[] = JSON.parse(u.unlockedMilestones || '[]')

    const newBadges:     string[] = []
    const newEmotes:     string[] = []
    const newMilestones: string[] = []
    const newlyUnlocked: { type: string; id: string; name: string }[] = []

    for (const b of BADGES) {
      if (curBadges.includes(b.id)) continue
      const ok = (b.winsRequired          !== undefined && stats.wins        >= b.winsRequired)
              || (b.gamesRequired         !== undefined && stats.gamesPlayed >= b.gamesRequired)
              || (b.streakRequired        !== undefined && stats.maxWinStreak >= b.streakRequired)
              || (b.jamesonCurryRequired  !== undefined && stats.jcGames     >= b.jamesonCurryRequired)
      if (ok) { newBadges.push(b.id); newlyUnlocked.push({ type: 'badge', id: b.id, name: b.name }) }
    }
    for (const e of EMOTES) {
      if (curEmotes.includes(e.id)) continue
      if (stats.wins >= e.winsRequired) { newEmotes.push(e.id); newlyUnlocked.push({ type: 'emote', id: e.id, name: e.label }) }
    }
    for (const m of MILESTONES) {
      if (curMilestones.includes(m.id)) continue
      const ok = (m.winsRequired   !== undefined && stats.wins         >= m.winsRequired)
              || (m.gamesRequired  !== undefined && stats.gamesPlayed  >= m.gamesRequired)
              || (m.streakRequired !== undefined && stats.maxWinStreak >= m.streakRequired)
      if (ok) { newMilestones.push(m.id); newlyUnlocked.push({ type: 'milestone', id: m.id, name: m.name }) }
    }

    if (newBadges.length || newEmotes.length || newMilestones.length) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          unlockedBadges:     JSON.stringify([...curBadges,     ...newBadges]),
          unlockedEmotes:     JSON.stringify([...curEmotes,     ...newEmotes]),
          unlockedMilestones: JSON.stringify([...curMilestones, ...newMilestones]),
        },
      })
    }
    if (newlyUnlocked.length) {
      io.to(socketId).emit('accessories-unlocked', { items: newlyUnlocked })
    }
  } catch { /* non-critical */ }
}

function scheduleRoomCleanup(code: string, ioRef?: SocketServer) {
  setTimeout(() => {
    const t = pickTimers.get(code)
    if (t) clearTimeout(t)
    pickTimers.delete(code)
    rooms.delete(code)
    pickTimerStartedAt.delete(code)
    consecutiveTimeouts.delete(code)
    // Evict all remaining Socket.IO room members so the code can be safely reused
    if (ioRef) ioRef.in(code).socketsLeave(code)
  }, 60_000) // 60s grace — lets clients receive final event before room disappears
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

function buildSnakeDraft(teamSize: number): ('host' | 'guest')[] {
  const order: ('host' | 'guest')[] = []
  const totalPicks = teamSize * 2
  let current: 'host' | 'guest' = 'host'
  let consecutive = 0
  for (let i = 0; i < totalPicks; i++) {
    order.push(current)
    consecutive++
    if (i === 0) { current = 'guest'; consecutive = 0 }
    else if (consecutive >= 2) { current = current === 'host' ? 'guest' : 'host'; consecutive = 0 }
  }
  return order
}

function getStatForMode(player: PlayerData, statMode: string): number {
  switch (statMode) {
    case 'games_played': return player.careerGames
    case 'ppg': return player.careerPPG
    case 'rpg': return player.careerRPG
    case 'apg': return player.careerAPG
    default: return player.careerGames
  }
}

function getStatModeForGame(gameNum: number): string {
  return STAT_CYCLE[(gameNum - 1) % STAT_CYCLE.length]
}

function calculateResult(room: Room): GameResult {
  const statMode = getStatModeForGame(room.currentGame)
  let hostTotal = 0
  let guestTotal = 0

  for (const id of room.hostPicks) {
    const p = playerById.get(id)
    if (p) hostTotal += getStatForMode(p, statMode)
  }
  for (const id of room.guestPicks) {
    const p = playerById.get(id)
    if (p) guestTotal += getStatForMode(p, statMode)
  }

  const winner = hostTotal < guestTotal ? 'host' : guestTotal < hostTotal ? 'guest' : 'draw'
  return { game: room.currentGame, statMode, hostTotal, guestTotal, winner }
}

function autoPickPlayer(room: Room): { playerId: number; slotPos: string } | null {
  const takenIds = new Set([...room.hostPicks, ...room.guestPicks])
  const { usedPositions, remainingBenchSlots } = getPickerUsedPositions(room)
  const starterSlotOpen = usedPositions.size < 5
  let available = allPlayers.filter(p => {
    if (takenIds.has(p.id)) return false
    const playerPositions = p.positions.split(',')
    const canFitStarter = starterSlotOpen && playerPositions.some(pos => !usedPositions.has(pos))
    const canFitBench = remainingBenchSlots > 0
    return canFitStarter || canFitBench
  })
  if (available.length === 0) {
    // Fallback: ignore position filter if no eligible players
    available = allPlayers.filter(p => !takenIds.has(p.id))
  }
  if (available.length === 0) return null
  // Respect spun team constraint if set
  if (room.currentSpunTeam) {
    const teamAvail = available.filter(p => getCurrentTeam(p.team) === room.currentSpunTeam)
    if (teamAvail.length > 0) available = teamAvail
  }
  const statMode = getStatModeForGame(room.currentGame)
  available.sort((a, b) => getStatForMode(a, statMode) - getStatForMode(b, statMode))
  const chosenPlayer = available[0]
  // Determine slot using greedy algo (reuse already-computed usedPositions/remainingBenchSlots)
  const starterOpen = usedPositions.size < 5
  const playerPositions = chosenPlayer.positions.split(',')
  let slotPos = 'BENCH'
  if (starterOpen) {
    for (const pos of playerPositions) {
      if (!usedPositions.has(pos) && ['PG', 'SG', 'SF', 'PF', 'C'].includes(pos)) {
        slotPos = pos
        break
      }
    }
  }
  if (slotPos === 'BENCH' && remainingBenchSlots <= 0) {
    // fallback: force into first open starter slot if no bench left
    for (const pos of playerPositions) {
      if (['PG', 'SG', 'SF', 'PF', 'C'].includes(pos) && !usedPositions.has(pos)) {
        slotPos = pos; break
      }
    }
  }
  return { playerId: chosenPlayer.id, slotPos }
}

function startPickTimer(io: SocketServer, room: Room) {
  const code = room.code
  // Clear any existing timer
  const existing = pickTimers.get(code)
  if (existing) clearTimeout(existing)

  // Spin a team for this pick
  const spunTeam = spinTeam(room)
  room.currentSpunTeam = spunTeam

  const currentPicker = room.draftOrder[room.currentPickIndex]

  const timer = setTimeout(() => {
    // Timer expired — auto-pick
    const currentRoom = rooms.get(code)
    if (!currentRoom || currentRoom.status !== 'drafting') return

    const picker = currentRoom.draftOrder[currentRoom.currentPickIndex]
    const autoPick = autoPickPlayer(currentRoom)
    if (autoPick === null) {
      // No eligible players — this shouldn't happen in practice but clean up to avoid
      // leaving the room stuck in 'drafting' with no timer running
      pickTimers.delete(code)
      scheduleRoomCleanup(code, io)
      return
    }
    const { playerId: pickedId, slotPos: pickedSlotPos } = autoPick
    // Guard against duplicate picks (shouldn't happen, but be safe)
    if (currentRoom.hostPicks.includes(pickedId) || currentRoom.guestPicks.includes(pickedId)) return

    if (picker === 'host') { currentRoom.hostPicks.push(pickedId); currentRoom.hostPickSlots.push(pickedSlotPos) }
    else { currentRoom.guestPicks.push(pickedId); currentRoom.guestPickSlots.push(pickedSlotPos) }

    // Track consecutive timeouts
    const timeouts = consecutiveTimeouts.get(code) || { host: 0, guest: 0 }
    timeouts[picker]++
    consecutiveTimeouts.set(code, timeouts)

    io.to(code).emit('pick-timeout', { picker, pickedId, consecutive: timeouts[picker] })

    // Check disqualification (2 consecutive timeouts)
    if (timeouts[picker] >= 2) {
      const loser = picker
      const winner = picker === 'host' ? 'guest' : 'host'
      currentRoom.status = 'complete'
      // Give the winner enough series wins to clearly win the series; preserve prior game wins
      const winsNeeded = Math.ceil(currentRoom.series / 2)
      if (winner === 'host') {
        currentRoom.hostSeriesScore = Math.max(currentRoom.hostSeriesScore, winsNeeded)
      } else {
        currentRoom.guestSeriesScore = Math.max(currentRoom.guestSeriesScore, winsNeeded)
      }
      pickTimers.delete(code)

      if (currentRoom.source === 'online') {
        recordMatchup(currentRoom.hostUserId, currentRoom.guestUserId)
        if (currentRoom.hostUserId) updateStatsAndUnlock(io, currentRoom.hostUserId, currentRoom.hostSocketId, winner === 'host', false, 0, true)
        if (currentRoom.guestUserId) updateStatsAndUnlock(io, currentRoom.guestUserId, currentRoom.guestSocketId!, winner === 'guest', false, 0, false)
        saveGameRecords(currentRoom, winner)
      }

      io.to(code).emit('player-disqualified', { room: currentRoom, disqualifiedRole: loser, winner })
      scheduleRoomCleanup(code, io)
      return
    }

    // Continue draft
    currentRoom.currentPickIndex++
    const teamSize = TEAM_SIZES[currentRoom.teamMode]
    if (currentRoom.currentPickIndex >= teamSize * 2) {
      // Draft complete
      const result = calculateResult(currentRoom)
      currentRoom.gameResults.push(result)
      if (result.winner === 'host') currentRoom.hostSeriesScore++
      else if (result.winner === 'guest') currentRoom.guestSeriesScore++

      if (currentRoom.hostPicks.includes(JAMESON_CURRY_ID)) currentRoom.hostJCGames++
      if (currentRoom.guestPicks.includes(JAMESON_CURRY_ID)) currentRoom.guestJCGames++

      const winsNeeded = Math.ceil(currentRoom.series / 2)
      const seriesDone = currentRoom.hostSeriesScore >= winsNeeded || currentRoom.guestSeriesScore >= winsNeeded || currentRoom.currentGame >= currentRoom.series
      currentRoom.status = seriesDone ? 'complete' : 'result'
      pickTimers.delete(code)

      if (seriesDone) {
        const seriesWinner = currentRoom.hostSeriesScore > currentRoom.guestSeriesScore ? 'host' : currentRoom.guestSeriesScore > currentRoom.hostSeriesScore ? 'guest' : 'draw'
        if (currentRoom.source === 'online') {
          recordMatchup(currentRoom.hostUserId, currentRoom.guestUserId)
          if (currentRoom.hostUserId) updateStatsAndUnlock(io, currentRoom.hostUserId, currentRoom.hostSocketId, seriesWinner === 'host', seriesWinner === 'draw', currentRoom.hostJCGames, true)
          if (currentRoom.guestUserId) updateStatsAndUnlock(io, currentRoom.guestUserId, currentRoom.guestSocketId!, seriesWinner === 'guest', seriesWinner === 'draw', currentRoom.guestJCGames, false)
        }
        saveGameRecords(currentRoom, seriesWinner)
        io.to(code).emit('series-complete', { room: currentRoom, seriesWinner })
        scheduleRoomCleanup(code, io)
      } else {
        io.to(code).emit('game-result', { room: currentRoom, result })
      }
    } else {
      io.to(code).emit('room-updated', { room: currentRoom })
      startPickTimer(io, currentRoom) // start timer for next pick
    }
  }, 30000)

  pickTimers.set(code, timer)
  pickTimerStartedAt.set(code, Date.now())
  io.to(code).emit('pick-timer-start', { picker: currentPicker, duration: 30, spunTeam })
}

function startGameFromReadyRoom(io: SocketServer, rr: ReadyRoom) {
  const code = rr.code
  // If either player has disconnected since the ready room was created, abort gracefully
  const hostConnected = io.sockets.sockets.has(rr.hostEntry.socketId)
  const guestConnected = io.sockets.sockets.has(rr.guestEntry.socketId)
  if (!hostConnected || !guestConnected) {
    const connectedSocketId = hostConnected ? rr.hostEntry.socketId : guestConnected ? rr.guestEntry.socketId : null
    if (connectedSocketId) {
      io.to(connectedSocketId).emit('match-cancelled', { reason: 'Opponent disconnected before the game started' })
    }
    return
  }
  const teamSize = TEAM_SIZES[rr.hostEntry.teamMode]
  const room: Room = {
    code,
    hostSocketId: rr.hostEntry.socketId,
    guestSocketId: rr.guestEntry.socketId,
    hostUserId: rr.hostEntry.userId,
    guestUserId: rr.guestEntry.userId,
    hostName: rr.hostEntry.userName,
    guestName: rr.guestEntry.userName,
    teamMode: rr.hostEntry.teamMode,
    series: rr.hostEntry.series,
    difficulty: rr.hostEntry.difficulty,
    source: 'online',
    status: 'drafting',
    draftOrder: buildSnakeDraft(teamSize),
    currentPickIndex: 0,
    hostPicks: [],
    guestPicks: [],
    hostPickSlots: [],
    guestPickSlots: [],
    currentGame: 1,
    hostSeriesScore: 0,
    guestSeriesScore: 0,
    gameResults: [],
    currentSpunTeam: null,
    hostJCGames: 0,
    guestJCGames: 0,
  }
  rooms.set(code, room)
  consecutiveTimeouts.set(code, { host: 0, guest: 0 })

  const hostSocket = io.sockets.sockets.get(rr.hostEntry.socketId)
  const guestSocket = io.sockets.sockets.get(rr.guestEntry.socketId)
  hostSocket?.join(code)
  guestSocket?.join(code)

  io.to(code).emit('draft-started', { room, players: allPlayers })
  startPickTimer(io, room)
}

// ─── Server ──────────────────────────────────────────────────────────────────

app.prepare().then(async () => {
  // Load players from DB
  const playerSelect = {
    id: true, firstName: true, lastName: true, team: true,
    position: true, positions: true, careerGames: true,
    careerPPG: true, careerRPG: true, careerAPG: true, careerMPG: true,
    ebkScore: true, yearFrom: true, yearTo: true,
  } as const
  allPlayers = await prisma.player.findMany({ select: playerSelect })
  playerById = new Map(allPlayers.map(p => [p.id, p]))
  refreshJCId()
  console.log(`Loaded ${allPlayers.length} players from DB`)

  // Refresh player data periodically (scrape-bbref runs in background after startup)
  // Use 5-min interval — scrape takes ~10 min, so this picks up new players quickly
  setInterval(async () => {
    try {
      const fresh = await prisma.player.findMany({ select: playerSelect })
      if (fresh.length !== allPlayers.length) {
        console.log(`Player data refreshed: ${allPlayers.length} → ${fresh.length}`)
      }
      allPlayers = fresh
      playerById = new Map(fresh.map(p => [p.id, p]))
      refreshJCId()
    } catch (e) {
      console.error('Failed to refresh player data:', e)
    }
  }, 5 * 60 * 1000)

  // Prune stale cooldown entries every hour to prevent unbounded memory growth
  setInterval(() => {
    const now = Date.now()
    for (const [userId, opponents] of recentMatchups.entries()) {
      for (const [opponentId, ts] of opponents.entries()) {
        if (now - ts > COOLDOWN_MS) opponents.delete(opponentId)
      }
      if (opponents.size === 0) recentMatchups.delete(userId)
    }
  }, 60 * 60 * 1000)

  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true)
    handle(req, res, parsedUrl)
  })

  const io = new SocketServer(httpServer, {
    cors: { origin: process.env.APP_URL || 'http://localhost:3000', methods: ['GET', 'POST'] },
    path: '/socket.io',
  })

  // Verify JWT from httpOnly cookie on every connection — no client changes needed
  io.use(async (socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie || ''
    const match = cookieHeader.match(/(?:^|;\s*)ebk-token=([^;]+)/)
    const token = match ? decodeURIComponent(match[1]) : null
    const payload = token ? await verifyToken(token) : null
    socket.data.userId = payload?.userId ?? null
    socket.data.username = payload?.username ?? null
    next()
  })

  io.on('connection', (socket) => {
    socket.on('create-room', ({ teamMode, series, difficulty, userName }: {
      teamMode: TeamMode, series: SeriesLength, difficulty: Difficulty, userName: string
    }) => {
      if (!['starter5', 'bench8', 'full12'].includes(teamMode)) return
      if (![1, 3, 5].includes(series)) return
      if (allPlayers.length === 0) { socket.emit('room-error', { message: 'Server is still loading player data. Please try again in a minute.' }); return }
      userName = (userName ?? '').trim().slice(0, 20) || 'Player'
      const userId = socket.data.userId as string | null
      let code = generateCode()
      while (rooms.has(code)) code = generateCode()

      const teamSize = TEAM_SIZES[teamMode]
      const room: Room = {
        code,
        hostSocketId: socket.id,
        guestSocketId: null,
        hostUserId: userId,
        guestUserId: null,
        hostName: userName,
        guestName: null,
        teamMode,
        series,
        difficulty: difficulty || 'casual',
        source: 'friends',
        status: 'waiting',
        draftOrder: buildSnakeDraft(teamSize),
        currentPickIndex: 0,
        hostPicks: [],
        guestPicks: [],
        hostPickSlots: [],
        guestPickSlots: [],
        currentGame: 1,
        hostSeriesScore: 0,
        guestSeriesScore: 0,
        gameResults: [],
        currentSpunTeam: null,
        hostJCGames: 0,
        guestJCGames: 0,
      }
      rooms.set(code, room)
      socket.join(code)
      socket.emit('room-created', { room, players: allPlayers })
    })

    socket.on('join-room', ({ code, userName }: {
      code: string, userName: string
    }) => {
      userName = (userName ?? '').trim().slice(0, 20) || 'Player'
      const userId = socket.data.userId as string | null
      const room = rooms.get(code.toUpperCase())
      if (!room) { socket.emit('room-error', { message: 'Room not found' }); return }
      if (room.guestSocketId) { socket.emit('room-error', { message: 'Room is full' }); return }
      if (room.status !== 'waiting') { socket.emit('room-error', { message: 'Game already in progress' }); return }

      room.guestSocketId = socket.id
      room.guestUserId = userId
      room.guestName = userName
      room.status = 'drafting'
      consecutiveTimeouts.set(code.toUpperCase(), { host: 0, guest: 0 })

      socket.join(code.toUpperCase())
      io.to(code.toUpperCase()).emit('draft-started', { room, players: allPlayers })
      startPickTimer(io, room)
    })

    socket.on('pick-player', ({ code, playerId, slotPos }: { code: string, playerId: number, slotPos: string }) => {
      const room = rooms.get(code)
      if (!room || room.status !== 'drafting') return
      // Runtime type guards against malformed payloads
      if (typeof playerId !== 'number' || !Number.isInteger(playerId) || playerId <= 0) return
      if (typeof code !== 'string' || typeof slotPos !== 'string') return

      const currentPicker = room.draftOrder[room.currentPickIndex]
      const isHost = socket.id === room.hostSocketId
      const isGuest = socket.id === room.guestSocketId

      if ((currentPicker === 'host' && !isHost) || (currentPicker === 'guest' && !isGuest)) return
      if (room.hostPicks.includes(playerId) || room.guestPicks.includes(playerId)) return
      const pickedPlayer = playerById.get(playerId)
      if (!pickedPlayer) {
        socket.emit('pick-error', { message: 'Invalid player' }); return
      }

      // Validate spun team constraint
      if (room.currentSpunTeam) {
        if (getCurrentTeam(pickedPlayer.team) !== room.currentSpunTeam) {
          socket.emit('pick-error', { message: `Must pick a ${room.currentSpunTeam} player this turn` })
          return
        }
      }

      // Validate slotPos and slot availability
      const { usedPositions, remainingBenchSlots } = getPickerUsedPositions(room)
      if (!slotPos) {
        socket.emit('pick-error', { message: 'No slot specified' }); return
      }
      const starterPositions = ['PG', 'SG', 'SF', 'PF', 'C']
      if (slotPos === 'BENCH') {
        if (remainingBenchSlots <= 0) {
          socket.emit('pick-error', { message: 'No bench slots remaining' }); return
        }
      } else if (starterPositions.includes(slotPos)) {
        const playerPositions = pickedPlayer.positions.split(',')
        if (!playerPositions.includes(slotPos)) {
          socket.emit('pick-error', { message: `Player cannot play ${slotPos}` }); return
        }
        if (usedPositions.has(slotPos)) {
          socket.emit('pick-error', { message: `${slotPos} slot already filled` }); return
        }
      } else {
        socket.emit('pick-error', { message: 'Invalid slot' }); return
      }

      // Clear pick timer
      const timer = pickTimers.get(code)
      if (timer) clearTimeout(timer)
      pickTimers.delete(code)

      // Reset consecutive timeouts for this picker (manual pick resets streak)
      const timeouts = consecutiveTimeouts.get(code) || { host: 0, guest: 0 }
      timeouts[currentPicker] = 0
      consecutiveTimeouts.set(code, timeouts)

      if (currentPicker === 'host') { room.hostPicks.push(playerId); room.hostPickSlots.push(slotPos) }
      else { room.guestPicks.push(playerId); room.guestPickSlots.push(slotPos) }

      room.currentPickIndex++

      const teamSize = TEAM_SIZES[room.teamMode]
      const totalPicks = teamSize * 2

      if (room.currentPickIndex >= totalPicks) {
        const result = calculateResult(room)
        room.gameResults.push(result)
        if (result.winner === 'host') room.hostSeriesScore++
        else if (result.winner === 'guest') room.guestSeriesScore++

        // Track Jameson Curry drafts per game across the series
        if (room.hostPicks.includes(JAMESON_CURRY_ID)) room.hostJCGames++
        if (room.guestPicks.includes(JAMESON_CURRY_ID)) room.guestJCGames++

        const winsNeeded = Math.ceil(room.series / 2)
        const seriesDone = room.hostSeriesScore >= winsNeeded || room.guestSeriesScore >= winsNeeded || room.currentGame >= room.series
        room.status = seriesDone ? 'complete' : 'result'

        if (seriesDone) {
          const seriesWinner = room.hostSeriesScore > room.guestSeriesScore ? 'host' : room.guestSeriesScore > room.hostSeriesScore ? 'guest' : 'draw'
          if (room.source === 'online') {
            recordMatchup(room.hostUserId, room.guestUserId)
            if (room.hostUserId) updateStatsAndUnlock(io, room.hostUserId, room.hostSocketId, seriesWinner === 'host', seriesWinner === 'draw', room.hostJCGames, true)
            if (room.guestUserId) updateStatsAndUnlock(io, room.guestUserId, room.guestSocketId!, seriesWinner === 'guest', seriesWinner === 'draw', room.guestJCGames, false)
          }
          saveGameRecords(room, seriesWinner)
          io.to(code).emit('series-complete', { room, seriesWinner })
          scheduleRoomCleanup(code, io)
        } else {
          io.to(code).emit('game-result', { room, result })
        }
      } else {
        io.to(code).emit('room-updated', { room })
        startPickTimer(io, room)
      }
    })

    socket.on('next-game', ({ code }: { code: string }) => {
      const room = rooms.get(code)
      if (!room || room.status !== 'result') return
      if (socket.id !== room.hostSocketId) return // only host can start next game

      room.currentGame++
      room.hostPicks = []
      room.guestPicks = []
      room.hostPickSlots = []
      room.guestPickSlots = []
      room.currentPickIndex = 0
      room.currentSpunTeam = null
      room.draftOrder = buildSnakeDraft(TEAM_SIZES[room.teamMode])
      if (room.currentGame % 2 === 0) {
        room.draftOrder = room.draftOrder.map(p => p === 'host' ? 'guest' : 'host')
      }
      room.status = 'drafting'
      consecutiveTimeouts.set(code, { host: 0, guest: 0 })

      io.to(code).emit('draft-started', { room, players: allPlayers })
      startPickTimer(io, room)
    })

    socket.on('get-room', ({ code, role }: { code: string; role: 'host' | 'guest' }) => {
      const userId = socket.data.userId as string | null
      const room = rooms.get(code)
      if (!room) {
        socket.emit('room-error', { message: 'Room not found or expired' })
        return
      }

      // Re-associate socket ID in case of reconnect/refresh.
      // Security: only allow takeover if the original socket is gone OR the userId matches.
      if (role === 'host') {
        const origConnected = io.sockets.sockets.has(room.hostSocketId)
        const isLegit = !room.hostUserId || userId === room.hostUserId
        if (origConnected && socket.id !== room.hostSocketId && !isLegit) {
          socket.emit('room-error', { message: 'Unauthorized' })
          return
        }
        room.hostSocketId = socket.id
      } else if (role === 'guest') {
        const origConnected = !!room.guestSocketId && io.sockets.sockets.has(room.guestSocketId)
        const isLegit = !room.guestUserId || userId === room.guestUserId
        if (origConnected && socket.id !== room.guestSocketId && !isLegit) {
          socket.emit('room-error', { message: 'Unauthorized' })
          return
        }
        room.guestSocketId = socket.id
      }

      socket.join(code)
      socket.emit('room-state', { room, players: allPlayers })

      if (room.status === 'drafting') {
        // Re-emit timer with accurate remaining duration so rejoining client syncs
        const currentPicker = room.draftOrder[room.currentPickIndex]
        const startedAt = pickTimerStartedAt.get(code) ?? Date.now()
        const elapsed = Math.floor((Date.now() - startedAt) / 1000)
        const remaining = Math.max(2, 30 - elapsed)
        socket.emit('pick-timer-start', { picker: currentPicker, duration: remaining, spunTeam: room.currentSpunTeam })
      }
    })

    // ── Game Listings (open lobby browser) ───────────────────────────────────

    socket.on('get-listings', () => {
      socket.emit('listings-updated', { listings: Array.from(gameListings.values()) })
    })

    socket.on('create-listing', async ({ userName, teamMode, series }: {
      userName: string, teamMode: TeamMode, series: SeriesLength
    }) => {
      if (!['starter5', 'bench8', 'full12'].includes(teamMode)) return
      if (![1, 3, 5].includes(series)) return
      if (pendingListingCreate.has(socket.id)) return // prevent double-fire race
      pendingListingCreate.add(socket.id)
      userName = (userName ?? '').trim().slice(0, 20) || 'Player'
      const userId = socket.data.userId as string | null
      if (!userId) { pendingListingCreate.delete(socket.id); socket.emit('listing-error', { message: 'Must be signed in to post a game' }); return }
      // Remove any stale listing by this socket or by the same user (multi-tab protection)
      for (const [c, l] of gameListings.entries()) {
        if (l.hostSocketId === socket.id || (userId && l.hostUserId === userId)) {
          clearTimeout(listingTimers.get(c))
          listingTimers.delete(c)
          gameListings.delete(c)
          break
        }
      }

      const hostRecord = { wins: 0, losses: 0, draws: 0 }
      let hostStreak = 0
      if (userId) {
        const u = await prisma.user.findUnique({ where: { id: userId }, select: { wins: true, losses: true, draws: true, winStreak: true } }).catch(() => null)
        if (u) { hostRecord.wins = u.wins; hostRecord.losses = u.losses; hostRecord.draws = u.draws; hostStreak = u.winStreak }
      }

      // Guard: if the socket disconnected while we were awaiting Prisma, don't create a ghost listing
      if (!io.sockets.sockets.has(socket.id)) {
        pendingListingCreate.delete(socket.id)
        return
      }

      let code = generateCode()
      while (rooms.has(code) || readyRooms.has(code) || gameListings.has(code)) code = generateCode()

      const hostUser = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { equippedBadge: true } }).catch(() => null) : null

      // Second guard: socket may have disconnected during the second Prisma await
      if (!io.sockets.sockets.has(socket.id)) {
        pendingListingCreate.delete(socket.id)
        return
      }

      const listing: GameListing = { code, hostSocketId: socket.id, hostUserId: userId, hostName: userName, hostRecord, hostBadge: hostUser?.equippedBadge || '', hostStreak, teamMode, series }
      gameListings.set(code, listing)

      // Auto-expire listing after 10 minutes
      const expireTimer = setTimeout(() => {
        if (gameListings.has(code)) {
          gameListings.delete(code)
          listingTimers.delete(code)
          socket.emit('listing-expired')
          io.emit('listings-updated', { listings: Array.from(gameListings.values()) })
        }
      }, 10 * 60 * 1000)
      listingTimers.set(code, expireTimer)

      pendingListingCreate.delete(socket.id)
      socket.emit('listing-created', { code })
      io.emit('listings-updated', { listings: Array.from(gameListings.values()) })
    })

    socket.on('cancel-listing', ({ code }: { code: string }) => {
      const listing = gameListings.get(code)
      if (!listing || listing.hostSocketId !== socket.id) return
      clearTimeout(listingTimers.get(code))
      listingTimers.delete(code)
      gameListings.delete(code)
      io.emit('listings-updated', { listings: Array.from(gameListings.values()) })
    })

    socket.on('join-listing', async ({ code, userName }: {
      code: string, userName: string
    }) => {
      userName = (userName ?? '').trim().slice(0, 20) || 'Player'
      const userId = socket.data.userId as string | null
      if (!userId) { socket.emit('listing-error', { message: 'Must be signed in to join a game' }); return }
      const listing = gameListings.get(code)
      if (!listing) {
        socket.emit('listing-error', { message: 'Game no longer available' })
        return
      }

      // Prevent a user from joining their own listing
      if (userId === listing.hostUserId) {
        socket.emit('listing-error', { message: 'You cannot join your own game' })
        return
      }

      // 30-min cooldown check
      const remaining = cooldownRemaining(userId, listing.hostUserId)
      if (remaining > 0) {
        const mins = Math.ceil(remaining / 60000)
        socket.emit('listing-error', { message: `Cooldown: ${mins} min remaining before you can rematch this player` })
        return
      }

      // Remove listing immediately so nobody else can join
      clearTimeout(listingTimers.get(code))
      listingTimers.delete(code)
      gameListings.delete(code)
      io.emit('listings-updated', { listings: Array.from(gameListings.values()) })

      const guestUser = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { wins: true, losses: true, draws: true, equippedBadge: true, winStreak: true } }).catch(() => null) : null
      const guestRecord = { wins: guestUser?.wins || 0, losses: guestUser?.losses || 0, draws: guestUser?.draws || 0 }
      const guestBadge = guestUser?.equippedBadge || ''
      const guestStreak = guestUser?.winStreak || 0
      const grudgeMatch = getMatchupCount(listing.hostUserId, userId) >= 3

      // Guard: if the host socket disconnected while we were awaiting Prisma, notify the joiner
      if (!io.sockets.sockets.has(listing.hostSocketId)) {
        socket.emit('listing-error', { message: 'Game no longer available' })
        return
      }

      const hostEntry: QueueEntry = {
        socketId: listing.hostSocketId, userId: listing.hostUserId, userName: listing.hostName,
        teamMode: listing.teamMode, series: listing.series, difficulty: 'ebk', userRecord: listing.hostRecord,
      }
      const guestEntry: QueueEntry = {
        socketId: socket.id, userId, userName,
        teamMode: listing.teamMode, series: listing.series, difficulty: 'ebk', userRecord: guestRecord,
      }

      const readyTimer = setTimeout(() => {
        const rr = readyRooms.get(code)
        if (!rr) return
        readyRooms.delete(code)
        startGameFromReadyRoom(io, rr)
      }, 60000)

      readyRooms.set(code, { code, hostEntry, guestEntry, hostReady: false, guestReady: false, timer: readyTimer })

      const basePayload = { proposedTeamMode: listing.teamMode, proposedSeries: listing.series, grudgeMatch }
      io.to(listing.hostSocketId).emit('match-found', {
        ...basePayload, code, isHost: true,
        opponentName: userName, opponentRecord: guestRecord, opponentBadge: guestBadge,
        myBadge: listing.hostBadge,
        myStreak: listing.hostStreak, opponentStreak: guestStreak,
        myTeamMode: listing.teamMode, mySeries: listing.series,
        opponentTeamMode: listing.teamMode, opponentSeries: listing.series,
      })
      socket.emit('match-found', {
        ...basePayload, code, isHost: false,
        opponentName: listing.hostName, opponentRecord: listing.hostRecord, opponentBadge: listing.hostBadge,
        myBadge: guestBadge,
        myStreak: guestStreak, opponentStreak: listing.hostStreak,
        myTeamMode: listing.teamMode, mySeries: listing.series,
        opponentTeamMode: listing.teamMode, opponentSeries: listing.series,
      })
    })

    socket.on('use-emote', ({ code, emoteText }: { code: string; emoteText: string }) => {
      const room = rooms.get(code)
      if (!room || room.status !== 'drafting') return
      const isHost = socket.id === room.hostSocketId
      const isGuest = socket.id === room.guestSocketId
      if (!isHost && !isGuest) return
      const now = Date.now()
      const last = emoteLastSent.get(socket.id) ?? 0
      if (now - last < 3000) return // 3s cooldown
      emoteLastSent.set(socket.id, now)
      const targetSocketId = isHost ? room.guestSocketId : room.hostSocketId
      if (targetSocketId) io.to(targetSocketId).emit('opponent-emote', { emoteText })
    })

    socket.on('decline-match', ({ code }: { code: string }) => {
      const rr = readyRooms.get(code)
      if (!rr) return
      if (socket.id !== rr.hostEntry.socketId && socket.id !== rr.guestEntry.socketId) return
      clearTimeout(rr.timer)
      readyRooms.delete(code)
      const isHost = socket.id === rr.hostEntry.socketId
      const declinerName = isHost ? rr.hostEntry.userName : rr.guestEntry.userName
      io.to(rr.hostEntry.socketId).emit('match-cancelled', {
        reason: isHost ? 'You declined the match' : `${declinerName} declined`,
      })
      io.to(rr.guestEntry.socketId).emit('match-cancelled', {
        reason: isHost ? `${declinerName} declined` : 'You declined the match',
      })
    })

    socket.on('confirm-ready', ({ code }: { code: string }) => {
      const rr = readyRooms.get(code)
      if (!rr) return

      const isHost = socket.id === rr.hostEntry.socketId
      const isGuest = socket.id === rr.guestEntry.socketId
      if (!isHost && !isGuest) return

      if (isHost) rr.hostReady = true
      if (isGuest) rr.guestReady = true

      io.to(rr.hostEntry.socketId).emit('ready-update', { hostReady: rr.hostReady, guestReady: rr.guestReady })
      io.to(rr.guestEntry.socketId).emit('ready-update', { hostReady: rr.hostReady, guestReady: rr.guestReady })

      if (rr.hostReady && rr.guestReady) {
        clearTimeout(rr.timer)
        readyRooms.delete(code)
        startGameFromReadyRoom(io, rr)
      }
    })

    socket.on('disconnect', () => {
      emoteLastSent.delete(socket.id)
      // Remove any open listing by this socket
      for (const [code, listing] of gameListings.entries()) {
        if (listing.hostSocketId === socket.id) {
          clearTimeout(listingTimers.get(code))
          listingTimers.delete(code)
          gameListings.delete(code)
          io.emit('listings-updated', { listings: Array.from(gameListings.values()) })
          break
        }
      }

      // Cancel any ready room
      readyRooms.forEach((rr, code) => {
        if (rr.hostEntry.socketId === socket.id || rr.guestEntry.socketId === socket.id) {
          clearTimeout(rr.timer)
          readyRooms.delete(code)
          const otherSocketId = rr.hostEntry.socketId === socket.id ? rr.guestEntry.socketId : rr.hostEntry.socketId
          io.to(otherSocketId).emit('match-cancelled', { reason: 'Opponent disconnected' })
        }
      })

      // Notify game rooms
      rooms.forEach((room, code) => {
        if (room.hostSocketId === socket.id || room.guestSocketId === socket.id) {
          // Keep waiting rooms alive — host may navigate to game page (causes brief reconnect)
          // and guests need to still be able to join
          if (room.status === 'waiting') return
          // Don't fire partner-disconnected for completed series — player may disconnect
          // on the win screen while the 30s cleanup timer is still running
          if (room.status === 'complete') return
          // Mark complete immediately to prevent the second player's disconnect handler
          // from double-emitting partner-disconnected and double-recording the matchup
          room.status = 'complete'
          const timer = pickTimers.get(code)
          if (timer) clearTimeout(timer)
          pickTimers.delete(code)
          io.to(code).emit('partner-disconnected')
          // Enforce cooldown so disconnecting players can't immediately rematch
          if (room.source === 'online') recordMatchup(room.hostUserId, room.guestUserId)
          // scheduleRoomCleanup cleans up consecutiveTimeouts/pickTimerStartedAt/rooms
          scheduleRoomCleanup(code, io)
        }
      })

      pendingListingCreate.delete(socket.id)
    })
  })

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`)
  })
})
