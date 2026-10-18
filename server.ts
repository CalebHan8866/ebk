import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { Server as SocketServer } from 'socket.io'
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'
import { BADGES, EMOTES, MILESTONES } from './src/lib/accessories'
import { verifyToken } from './src/lib/auth'
import { validateEnv } from './src/lib/validateEnv'

// ─── Startup validation ───────────────────────────────────────────────────────
// Fail fast with a clear message rather than mysterious crashes later.
validateEnv()

// ─── Global error handlers ────────────────────────────────────────────────────
process.on('unhandledRejection', (reason, promise) => {
  console.error('[server] Unhandled promise rejection:', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: String(promise),
  })
})

process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception — process will exit:', {
    message: err.message,
    stack: err.stack,
  })
  process.exit(1)
})

const dev = process.env.NODE_ENV !== 'production'
const hostname = '0.0.0.0'
const port = parseInt(process.env.PORT || '3000')
const app = next({ dev, hostname, port, dir: process.cwd() })
const handle = app.getRequestHandler()
// Match the connection_limit set in src/lib/db.ts — the socket server runs as a
// separate process context and gets its own pool, so we configure it the same way.
function buildDbUrl(): string {
  const base = process.env.DATABASE_URL ?? ''
  if (base.includes('connection_limit=')) return base
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}connection_limit=10`
}
const prisma = new PrismaClient({ datasources: { db: { url: buildDbUrl() } } })

// ─── Privacy helpers ─────────────────────────────────────────────────────────
// In production, usernames are replaced with a short deterministic token so
// Railway logs cannot be used to correlate real display names with activity.
function redactName(name: string): string {
  if (!name) return '[anon]'
  if (dev) return name
  const hash = crypto.createHash('sha1').update(name).digest('hex').slice(0, 6)
  return `u:${hash}`
}

// ─── Types ───────────────────────────────────────────────────────────────────

type TeamMode = 'starter5' | 'bench8' | 'full12'
type SeriesLength = 1 | 3 | 5
type Difficulty = 'casual' | 'ebk'
type StatCategory = 'games_played' | 'ppg' | 'rpg' | 'apg' | 'earnings' | 'ebk_score'

const VALID_STAT_CATEGORIES: StatCategory[] = ['games_played', 'ppg', 'rpg', 'apg', 'earnings', 'ebk_score']

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

// ─── Timing constants (milliseconds) ─────────────────────────────────────────

/** How long each draft pick timer runs before auto-pick fires */
const PICK_TIMER_MS = 30_000
/** Initial bid window duration for each auction player */
const BID_TIMER_MS = 25_000
/** Minimum remaining time that triggers a bid-timer extension */
const BID_EXTENSION_THRESHOLD_MS = 10_000
/** How much time is added / restored when a late bid extends the timer */
const BID_EXTENSION_MS = 10_000
/** Steal window duration after a player is won at auction */
const STEAL_WINDOW_MS = 10_000
/** Brief cooldown after a steal before the auction advances */
const POST_STEAL_ADVANCE_MS = 3_000
/** Trade phase duration after bidding ends */
const TRADE_PHASE_MS = 3 * 60 * 1000
/** How long a ready-room waits for both players to confirm before auto-starting */
const READY_ROOM_TIMEOUT_MS = 60_000
/** How long a game listing stays open before expiring */
const LISTING_EXPIRY_MS = 10 * 60 * 1000
/** How long after auction completion before the room is cleaned up */
const AUCTION_CLEANUP_MS = 30 * 60 * 1000
/** Grace period after a game ends before the room is deleted */
const ROOM_CLEANUP_GRACE_MS = 60_000
/** Steal price multiplier: winner pays ceil(originalPrice × STEAL_MULTIPLIER) */
const STEAL_MULTIPLIER = 1.5
/** Auction budget by team size */
const AUCTION_BUDGETS: Record<number, number> = { 5: 125, 8: 175, 12: 250 }

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
  /** Stat category chosen by the host — all games in the series use this stat */
  statCategory: StatCategory
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
  careerEarnings: number
}

interface QueueEntry {
  socketId: string
  userId: string | null
  userName: string
  teamMode: TeamMode
  series: SeriesLength
  difficulty: Difficulty
  statCategory: StatCategory
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
  statCategory: StatCategory
}

interface AuctionParticipant {
  socketId: string
  userId: string | null
  name: string
  budget: number
  roster: number[]
  paidPrices: Record<number, number>
}

interface TradeOffer {
  id: string
  fromSocketId: string
  fromName: string
  toSocketId: string
  toName: string
  offeredPlayerIds: number[]
  requestedPlayerIds: number[]
  createdAt: number
}

type AuctionStatus = 'waiting' | 'bidding' | 'steal-window' | 'trading' | 'complete'

interface AuctionRoom {
  code: string
  hostSocketId: string
  maxPlayers: number
  teamSize: number
  totalBudget: number
  status: AuctionStatus
  participants: AuctionParticipant[]
  playerPool: PlayerData[]
  currentPlayerIndex: number
  currentPlayer: PlayerData | null
  currentBid: number
  currentBidderSocketId: string | null
  currentBidderName: string | null
  lastWinnerSocketId: string | null
  lastWinnerName: string | null
  lastWonAmount: number
  /** ID of the player that was just won at auction and is eligible to be stolen this round */
  lastWonPlayerId: number | null
  stealInitiated: boolean
  bidTimer: ReturnType<typeof setTimeout> | null
  bidDeadline: number
  tradeOffers: TradeOffer[]
  tradeDeadline: number | null
  tradeTimer: ReturnType<typeof setTimeout> | null
  bidLog: Array<{ name: string; amount: number; action: 'bid' | 'steal' | 'won' | 'pass' | 'trade' }>
  finalResults: AuctionResult[] | null
}

interface AuctionResult {
  socketId: string
  name: string
  ebkTotal: number
  rosterCount: number
  budgetSpent: number
  roster: Array<{ id: number; firstName: string; lastName: string; position: string; ebkScore: number; paidPrice: number } | null>
}

// ─── Room Store ──────────────────────────────────────────────────────────────

const rooms = new Map<string, Room>()
const readyRooms = new Map<string, ReadyRoom>()
const gameListings = new Map<string, GameListing>()
const listingTimers = new Map<string, ReturnType<typeof setTimeout>>()
const roomCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pickTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pickTimerStartedAt = new Map<string, number>()
const consecutiveTimeouts = new Map<string, { host: number; guest: number }>()
const emoteLastSent = new Map<string, number>() // socketId → timestamp
const pendingListingCreate = new Set<string>() // socketId → in-flight guard
// Per-socket bid throttle: socketId → { count, windowStart }
// Allows max 5 bids per second per socket to prevent DoS spam
const bidThrottle = new Map<string, { count: number; windowStart: number }>()
// Per-socket join-room throttle: socketId → { count, windowStart }
// Allows max 10 join attempts per minute per socket to prevent room-code brute-force
const joinRoomThrottle = new Map<string, { count: number; windowStart: number }>()
// Per-socket room-creation throttle: socketId → { count, windowStart }
// Limits one socket to 5 room creations (game + auction combined) per minute to
// prevent a single connection from exhausting server memory with ghost rooms.
const createRoomThrottle = new Map<string, { count: number; windowStart: number }>()
// cooldown: userId → Map(opponentId → timestamp of last game end)
const recentMatchups = new Map<string, Map<string, number>>()
// grudge: userId → Map(opponentId → total games played together)
const matchupCount = new Map<string, Map<string, number>>()
let allPlayers: PlayerData[] = []
let playerById = new Map<number, PlayerData>() // fast O(1) lookup by id
const auctionRooms = new Map<string, AuctionRoom>()
// Seed DB uses id=71; after scrape-bbref runs it gets a hash-based ID — resolve dynamically.
let JAMESON_CURRY_ID = 71
function refreshJCId() {
  const jc = allPlayers.find(p => p.firstName === 'Jameson' && p.lastName === 'Curry')
  if (jc) JAMESON_CURRY_ID = jc.id
}

// ─── Cross-game active-session guard ─────────────────────────────────────────
// Returns true if the given userId is already an active participant in ANY live
// draft room OR any non-complete auction room.  Used to block a single account
// from joining two different game modes simultaneously via multiple browser tabs,
// which would corrupt per-user stat recording (wins / losses could be double-counted
// or interleaved across two concurrent finishGame calls for the same userId).
function isUserActiveInAnyRoom(userId: string): boolean {
  for (const room of rooms.values()) {
    if (room.status === 'complete') continue
    if (room.hostUserId === userId || room.guestUserId === userId) return true
  }
  for (const room of auctionRooms.values()) {
    if (room.status === 'complete') continue
    if (room.participants.some(p => p.userId === userId)) return true
  }
  return false
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
        // Draws do not break or extend the win streak — only losses reset it.
        winStreak:         won ? { increment: 1 } : isDraw ? undefined : { set: 0 },
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
  // Cancel any existing cleanup timer for this code so that calling
  // scheduleRoomCleanup twice (e.g. disqualification path followed by a
  // series-complete path) does not leave a stale timer.
  const existing = roomCleanupTimers.get(code)
  if (existing) clearTimeout(existing)

  const handle = setTimeout(() => {
    roomCleanupTimers.delete(code)
    const t = pickTimers.get(code)
    if (t) clearTimeout(t)
    pickTimers.delete(code)
    rooms.delete(code)
    pickTimerStartedAt.delete(code)
    consecutiveTimeouts.delete(code)
    // Evict all remaining Socket.IO room members so the code can be safely reused
    if (ioRef) ioRef.in(code).socketsLeave(code)
    console.log('[room] destroyed code=%s game_rooms=%d', code, rooms.size)
  }, ROOM_CLEANUP_GRACE_MS) // grace — lets clients receive final event before room disappears
  roomCleanupTimers.set(code, handle)
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[crypto.randomInt(chars.length)]
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
    case 'earnings': return player.careerEarnings
    case 'ebk_score': return player.ebkScore
    default: return player.careerGames
  }
}

function getStatModeForGame(gameNum: number, statCategory?: StatCategory | null): string {
  // If a custom stat category is set, every game in the series uses it
  if (statCategory) return statCategory
  return STAT_CYCLE[(gameNum - 1) % STAT_CYCLE.length]
}

function calculateResult(room: Room): GameResult {
  const statMode = getStatModeForGame(room.currentGame, room.statCategory)
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

  const winner = hostTotal > guestTotal ? 'host' : guestTotal > hostTotal ? 'guest' : 'draw'
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
  const statMode = getStatModeForGame(room.currentGame, room.statCategory)
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
      // No eligible players — emit an error to both clients so they are not left
      // stuck on the draft screen, then tear down the room.
      currentRoom.status = 'complete'
      pickTimers.delete(code)
      io.to(code).emit('room-error', { message: 'No eligible players remain. The game has been cancelled.' })
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
          saveGameRecords(currentRoom, seriesWinner)
        }
        io.to(code).emit('series-complete', { room: currentRoom, seriesWinner })
        scheduleRoomCleanup(code, io)
      } else {
        io.to(code).emit('game-result', { room: currentRoom, result })
      }
    } else {
      io.to(code).emit('room-updated', { room: currentRoom })
      startPickTimer(io, currentRoom) // start timer for next pick
    }
  }, PICK_TIMER_MS)

  pickTimers.set(code, timer)
  pickTimerStartedAt.set(code, Date.now())
  io.to(code).emit('pick-timer-start', { picker: currentPicker, duration: PICK_TIMER_MS / 1000, spunTeam })
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
    statCategory: rr.hostEntry.statCategory,
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
  console.log('[room] created source=online code=%s host=%s guest=%s mode=%s series=%d game_rooms=%d',
    code, redactName(rr.hostEntry.userName), redactName(rr.guestEntry.userName), rr.hostEntry.teamMode, rr.hostEntry.series, rooms.size)

  const hostSocket = io.sockets.sockets.get(rr.hostEntry.socketId)
  const guestSocket = io.sockets.sockets.get(rr.guestEntry.socketId)
  hostSocket?.join(code)
  guestSocket?.join(code)

  io.to(code).emit('draft-started', { room, players: allPlayers })
  startPickTimer(io, room)
}

// ─── Auction helpers ──────────────────────────────────────────────────────────

function buildAuctionStateForSocket(room: AuctionRoom) {
  return {
    code: room.code,
    status: room.status,
    teamSize: room.teamSize,
    totalBudget: room.totalBudget,
    maxPlayers: room.maxPlayers,
    hostSocketId: room.hostSocketId,
    participants: room.participants.map(p => ({
      socketId: p.socketId,
      name: p.name,
      budget: p.budget,
      rosterCount: p.roster.length,
      roster: p.roster.map(id => {
        const player = room.playerPool.find(pp => pp.id === id)
        return player ? {
          id: player.id, firstName: player.firstName, lastName: player.lastName,
          position: player.position, ebkScore: player.ebkScore, paidPrice: p.paidPrices[id],
        } : null
      }).filter(Boolean),
    })),
    currentPlayer: room.currentPlayer ? {
      id: room.currentPlayer.id, firstName: room.currentPlayer.firstName,
      lastName: room.currentPlayer.lastName, team: room.currentPlayer.team,
      position: room.currentPlayer.position, careerGames: room.currentPlayer.careerGames,
      careerPPG: room.currentPlayer.careerPPG, careerRPG: room.currentPlayer.careerRPG,
      careerAPG: room.currentPlayer.careerAPG, ebkScore: room.currentPlayer.ebkScore,
      yearFrom: room.currentPlayer.yearFrom, yearTo: room.currentPlayer.yearTo,
    } : null,
    currentBid: room.currentBid,
    currentBidderSocketId: room.currentBidderSocketId,
    currentBidderName: room.currentBidderName,
    lastWinnerSocketId: room.lastWinnerSocketId,
    lastWinnerName: room.lastWinnerName,
    lastWonAmount: room.lastWonAmount,
    stealInitiated: room.stealInitiated,
    bidDeadline: room.bidDeadline,
    tradeOffers: room.tradeOffers,
    tradeDeadline: room.tradeDeadline,
    playerIndex: room.currentPlayerIndex,
    poolSize: room.playerPool.length,
    bidLog: room.bidLog.slice(-25),
    finalResults: room.finalResults ?? null,
  }
}

function broadcastAuctionState(io: SocketServer, room: AuctionRoom) {
  const state = buildAuctionStateForSocket(room)
  for (const p of room.participants) {
    io.to(p.socketId).emit('auction:state', state)
  }
}

function advanceAuction(io: SocketServer, room: AuctionRoom) {
  const wonIds = new Set(room.participants.flatMap(p => p.roster))
  room.currentPlayerIndex++
  while (room.currentPlayerIndex < room.playerPool.length) {
    const candidate = room.playerPool[room.currentPlayerIndex]
    if (!wonIds.has(candidate.id)) {
      const needsMore = room.participants.some(p => p.roster.length < room.teamSize && p.budget >= 1)
      if (!needsMore) break
      room.currentPlayer = candidate
      room.currentBid = 0
      room.currentBidderSocketId = null
      room.currentBidderName = null
      room.lastWinnerSocketId = null
      room.lastWinnerName = null
      room.lastWonPlayerId = null
      room.stealInitiated = false
      room.status = 'bidding'
      room.bidDeadline = Date.now() + BID_TIMER_MS
      if (room.bidTimer) clearTimeout(room.bidTimer)
      room.bidTimer = setTimeout(() => handleAuctionBidExpiry(io, room), BID_TIMER_MS)
      broadcastAuctionState(io, room)
      return
    }
    room.currentPlayerIndex++
  }
  startAuctionTradePhase(io, room)
}

function handleAuctionBidExpiry(io: SocketServer, room: AuctionRoom) {
  // Guard: only execute if we're still in bidding or steal-window phase.
  // This prevents double-advancement if the timer fires after an explicit pass.
  if (room.status !== 'bidding' && room.status !== 'steal-window') return

  if (room.currentBid === 0 || !room.currentBidderSocketId || !room.currentPlayer) {
    room.bidLog.push({ name: 'Nobody', amount: 0, action: 'pass' })
    advanceAuction(io, room)
    return
  }
  const winner = room.participants.find(p => p.socketId === room.currentBidderSocketId)
  if (!winner || !room.currentPlayer) { advanceAuction(io, room); return }
  // Defensive guard: budget must still cover the bid (should always hold since bids are
  // validated at submission time and budgets can only increase via steal refunds, but
  // guard here to prevent any future code path from causing underflow).
  if (winner.budget < room.currentBid) {
    console.warn('[auction] bid-expiry budget underflow prevented code=%s winner=%s budget=%d bid=%d',
      room.code, redactName(winner.name), winner.budget, room.currentBid)
    advanceAuction(io, room); return
  }
  winner.roster.push(room.currentPlayer.id)
  winner.paidPrices[room.currentPlayer.id] = room.currentBid
  winner.budget -= room.currentBid
  room.bidLog.push({ name: winner.name, amount: room.currentBid, action: 'won' })
  room.lastWinnerSocketId = winner.socketId
  room.lastWinnerName = winner.name
  room.lastWonAmount = room.currentBid
  // Track exactly which player was just won so the steal handler can verify that the
  // steal target is the newly-acquired player rather than an arbitrary roster slot.
  room.lastWonPlayerId = room.currentPlayer.id
  room.stealInitiated = false
  room.status = 'steal-window'
  room.bidDeadline = Date.now() + STEAL_WINDOW_MS
  broadcastAuctionState(io, room)
  if (room.bidTimer) clearTimeout(room.bidTimer)
  room.bidTimer = setTimeout(() => advanceAuction(io, room), STEAL_WINDOW_MS)
}

function startAuctionTradePhase(io: SocketServer, room: AuctionRoom) {
  room.status = 'trading'
  room.currentPlayer = null
  room.bidDeadline = 0
  if (room.bidTimer) clearTimeout(room.bidTimer)
  room.bidTimer = null
  room.tradeDeadline = Date.now() + TRADE_PHASE_MS
  if (room.tradeTimer) clearTimeout(room.tradeTimer)
  room.tradeTimer = setTimeout(() => finishAuction(io, room), TRADE_PHASE_MS)
  broadcastAuctionState(io, room)
}

function finishAuction(io: SocketServer, room: AuctionRoom) {
  room.status = 'complete'
  if (room.bidTimer) clearTimeout(room.bidTimer)
  if (room.tradeTimer) clearTimeout(room.tradeTimer)
  const results: AuctionResult[] = room.participants.map(p => ({
    socketId: p.socketId,
    name: p.name,
    ebkTotal: Math.round(p.roster.reduce((sum, pid) => {
      const player = room.playerPool.find(pp => pp.id === pid)
      return sum + (player?.ebkScore ?? 0)
    }, 0) * 10) / 10,
    rosterCount: p.roster.length,
    budgetSpent: room.totalBudget - p.budget,
    roster: p.roster.map(id => {
      const player = room.playerPool.find(pp => pp.id === id)
      return player ? { id: player.id, firstName: player.firstName, lastName: player.lastName,
        position: player.position, ebkScore: player.ebkScore, paidPrice: p.paidPrices[id] } : null
    }).filter(Boolean),
  })).sort((a, b) => a.ebkTotal - b.ebkTotal)  // lower EBK total = better draft = ranked first
  // Store results on the room so broadcastAuctionState can include them in the
  // auction:state payload. This prevents a blank-screen flash on the client when
  // auction:state (status:'complete') arrives before auction:complete is processed.
  room.finalResults = results
  broadcastAuctionState(io, room)
  for (const p of room.participants) {
    io.to(p.socketId).emit('auction:complete', { results })
  }
  setTimeout(() => { auctionRooms.delete(room.code) }, AUCTION_CLEANUP_MS)
}

// ─── Server ──────────────────────────────────────────────────────────────────

app.prepare().then(async () => {
  // Load players from DB
  const playerSelect = {
    id: true, firstName: true, lastName: true, team: true,
    position: true, positions: true, careerGames: true,
    careerPPG: true, careerRPG: true, careerAPG: true, careerMPG: true,
    ebkScore: true, yearFrom: true, yearTo: true, careerEarnings: true,
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

  // Prune stale cooldown and grudge-count entries every hour to prevent unbounded growth.
  // recentMatchups: entries expire after the cooldown window (30 min).
  // matchupCount: grudge counts are only meaningful while the pair is still within cooldown,
  //   because once the cooldown clears the pair can rematch and the count will resume from
  //   where it left off anyway. Pruning entries that no longer have a live cooldown entry
  //   bounds the map to at most the number of currently-cooling-down user pairs.
  setInterval(() => {
    const now = Date.now()
    for (const [userId, opponents] of recentMatchups.entries()) {
      for (const [opponentId, ts] of opponents.entries()) {
        if (now - ts > COOLDOWN_MS) opponents.delete(opponentId)
      }
      if (opponents.size === 0) recentMatchups.delete(userId)
    }
    // After recentMatchups is pruned, remove matchupCount entries for pairs that no
    // longer have an active cooldown record — they are dead weight until the pair plays again.
    for (const [userId, opponents] of matchupCount.entries()) {
      for (const [opponentId] of opponents.entries()) {
        if (!recentMatchups.get(userId)?.has(opponentId)) {
          opponents.delete(opponentId)
        }
      }
      if (opponents.size === 0) matchupCount.delete(userId)
    }
  }, 60 * 60 * 1000)

  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true)
    handle(req, res, parsedUrl)
  })

  const io = new SocketServer(httpServer, {
    cors: { origin: process.env.APP_URL || 'http://localhost:3000', methods: ['GET', 'POST'] },
    path: '/socket.io',
    // Railway kills idle TCP connections after 30 s.
    // pingInterval=20 000 ensures a heartbeat packet is sent every 20 s,
    // keeping the connection alive before Railway's 30 s idle cutoff.
    // pingTimeout=25 000 gives the client 25 s to respond before the server
    // considers it disconnected — generous for lossy mobile connections.
    pingInterval: 20_000,
    pingTimeout: 25_000,
  })

  // ─── Socket.IO error logging ─────────────────────────────────────────────────
  io.engine.on('connection_error', (err) => {
    console.error('[socket] Connection error:', { code: (err as NodeJS.ErrnoException).code, message: err.message })
  })

  // ─── Socket count heartbeat (every 5 min) ────────────────────────────────────
  setInterval(() => {
    const socketCount = io.sockets.sockets.size
    const roomCount = rooms.size
    const auctionCount = auctionRooms.size
    console.log('[metrics] connections=%d game_rooms=%d auction_rooms=%d', socketCount, roomCount, auctionCount)
  }, 5 * 60 * 1000)

  // ─── Graceful SIGTERM (Railway zero-downtime deploys) ────────────────────────
  // Railway sends SIGTERM to the old instance before starting the new one.
  // We stop accepting new HTTP connections and give active rooms up to 10 s to
  // finish before forcing exit so in-flight games are not cut mid-play.
  process.on('SIGTERM', () => {
    console.log('[server] SIGTERM received — starting graceful shutdown')
    const activeRoomCodes = [...rooms.keys(), ...auctionRooms.keys()]
    console.log('[server] Active rooms at shutdown: count=%d', activeRoomCodes.length)

    // Stop accepting new HTTP connections
    httpServer.close(() => {
      console.log('[server] HTTP server closed')
    })

    // Give active rooms up to 10 s to reach a terminal state, then force exit
    const forceExitTimer = setTimeout(() => {
      console.warn('[server] Graceful shutdown timed out — forcing exit')
      process.exit(0)
    }, 10_000)
    // Don't let this timer keep the event loop alive if rooms finish sooner
    forceExitTimer.unref()

    // Poll until all rooms are gone or the timer fires
    const pollInterval = setInterval(() => {
      if (rooms.size === 0 && auctionRooms.size === 0) {
        clearInterval(pollInterval)
        clearTimeout(forceExitTimer)
        console.log('[server] All rooms drained — exiting cleanly')
        process.exit(0)
      }
    }, 500)
  })

  // Verify JWT from httpOnly cookie on every connection — no client changes needed.
  // tokenVersion is stored on socket.data so that sensitive game-join handlers can
  // re-verify the version against the DB when the user claims an authenticated slot,
  // catching the case where a password change happened after the socket connected.
  io.use(async (socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie || ''
    const match = cookieHeader.match(/(?:^|;\s*)ebk-token=([^;]+)/)
    const token = match ? decodeURIComponent(match[1]) : null
    const payload = token ? await verifyToken(token) : null
    socket.data.userId = payload?.userId ?? null
    socket.data.username = payload?.username ?? null
    socket.data.tokenVersion = payload?.tokenVersion ?? null
    next()
  })

  io.on('connection', (socket) => {
    // Per-socket error logging
    socket.on('error', (err) => {
      console.error('[socket] Socket error:', {
        socketId: socket.id.slice(0, 6) + '…',
        userId: socket.data.userId ? '[redacted]' : undefined,
        message: err.message,
        stack: err.stack,
      })
    })

    socket.on('create-room', ({ teamMode, series, difficulty, statCategory, userName }: {
      teamMode: TeamMode, series: SeriesLength, difficulty: Difficulty, statCategory?: StatCategory, userName: string
    }) => {
      // Rate limit: max 5 room creations per minute per socket to prevent memory-exhaustion spam
      const crNow0 = Date.now()
      const crThrottle0 = createRoomThrottle.get(socket.id)
      if (crThrottle0 && crNow0 - crThrottle0.windowStart < 60_000) {
        if (crThrottle0.count >= 5) { socket.emit('room-error', { message: 'Too many rooms created. Please wait a moment.' }); return }
        crThrottle0.count++
      } else { createRoomThrottle.set(socket.id, { count: 1, windowStart: crNow0 }) }

      if (!['starter5', 'bench8', 'full12'].includes(teamMode)) return
      if (![1, 3, 5].includes(series)) return
      if (!['casual', 'ebk'].includes(difficulty)) return
      if (allPlayers.length === 0) { socket.emit('room-error', { message: 'Server is still loading player data. Please try again in a minute.' }); return }
      // Prefer the server-verified JWT username; fall back to sanitized client name for anonymous players.
      const userId = socket.data.userId as string | null
      userName = ((socket.data.username as string | null) || (userName ?? '').trim()).slice(0, 20) || 'Player'
      let code = generateCode()
      while (rooms.has(code)) code = generateCode()

      const resolvedStatCategory: StatCategory = (statCategory && VALID_STAT_CATEGORIES.includes(statCategory)) ? statCategory : 'games_played'

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
        difficulty,
        statCategory: resolvedStatCategory,
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
      console.log('[room] created source=friends code=%s host=%s mode=%s series=%d game_rooms=%d',
        code, redactName(room.hostName), room.teamMode, room.series, rooms.size)
      socket.emit('room-created', { room, players: allPlayers })
    })

    socket.on('join-room', ({ code, userName }: {
      code: string, userName: string
    }) => {
      // Rate limit: max 10 join-room attempts per minute per socket to prevent brute-force
      const jrNow = Date.now()
      const jrThrottle = joinRoomThrottle.get(socket.id)
      if (jrThrottle && jrNow - jrThrottle.windowStart < 60_000) {
        if (jrThrottle.count >= 10) {
          socket.emit('room-error', { message: 'Too many join attempts. Please wait a moment.' })
          return
        }
        jrThrottle.count++
      } else {
        joinRoomThrottle.set(socket.id, { count: 1, windowStart: jrNow })
      }

      // Prefer the server-verified JWT username; fall back to sanitized client name for anonymous players.
      const userId = socket.data.userId as string | null
      userName = ((socket.data.username as string | null) || (userName ?? '').trim()).slice(0, 20) || 'Player'
      const room = rooms.get(code.trim().toUpperCase())
      if (!room) { socket.emit('room-error', { message: 'Room not found' }); return }
      if (room.guestSocketId) { socket.emit('room-error', { message: 'Room is full' }); return }
      if (room.status !== 'waiting') { socket.emit('room-error', { message: 'Game already in progress' }); return }
      // Prevent a user from playing against themselves (would double-record stats)
      if (userId && userId === room.hostUserId) { socket.emit('room-error', { message: 'You cannot join your own room' }); return }
      // Prevent simultaneous multi-game participation: a user already in an active draft
      // or auction room cannot join another — that would allow two concurrent games to
      // write conflicting stat updates (wins/losses) for the same userId at roughly the
      // same time, corrupting the leaderboard.
      if (userId && isUserActiveInAnyRoom(userId)) {
        socket.emit('room-error', { message: 'You are already in an active game' }); return
      }

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
      // Runtime type guards — validate before any Map lookups
      if (typeof code !== 'string' || typeof slotPos !== 'string') return
      if (typeof playerId !== 'number' || !Number.isInteger(playerId) || playerId <= 0) return
      const room = rooms.get(code.trim().toUpperCase())
      if (!room || room.status !== 'drafting') return

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

      const roomCode = room.code

      // Clear pick timer
      const timer = pickTimers.get(roomCode)
      if (timer) clearTimeout(timer)
      pickTimers.delete(roomCode)

      // Reset consecutive timeouts for this picker (manual pick resets streak)
      const timeouts = consecutiveTimeouts.get(roomCode) || { host: 0, guest: 0 }
      timeouts[currentPicker] = 0
      consecutiveTimeouts.set(roomCode, timeouts)

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
            saveGameRecords(room, seriesWinner)
          }
          io.to(roomCode).emit('series-complete', { room, seriesWinner })
          scheduleRoomCleanup(roomCode, io)
        } else {
          io.to(roomCode).emit('game-result', { room, result })
        }
      } else {
        io.to(roomCode).emit('room-updated', { room })
        startPickTimer(io, room)
      }
    })

    socket.on('next-game', ({ code }: { code: string }) => {
      if (typeof code !== 'string') return
      const room = rooms.get(code.trim().toUpperCase())
      if (!room || room.status !== 'result') return
      if (socket.id !== room.hostSocketId) return // only host can start next game

      const roomCode = room.code

      // Cancel the 60-second grace cleanup that was scheduled when the previous
      // game ended.  Without this the timer would fire mid-draft and delete the
      // live room out from under the players.
      const cleanupTimer = roomCleanupTimers.get(roomCode)
      if (cleanupTimer) {
        clearTimeout(cleanupTimer)
        roomCleanupTimers.delete(roomCode)
      }

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
      consecutiveTimeouts.set(roomCode, { host: 0, guest: 0 })

      io.to(roomCode).emit('draft-started', { room, players: allPlayers })
      startPickTimer(io, room)
    })

    socket.on('get-room', ({ code, role }: { code: string; role: 'host' | 'guest' }) => {
      const userId = socket.data.userId as string | null
      const room = rooms.get(typeof code === 'string' ? code.trim().toUpperCase() : '')
      if (!room) {
        socket.emit('room-error', { message: 'Room not found or expired' })
        return
      }

      // Re-associate socket ID in case of reconnect/refresh.
      // Security: only allow slot takeover when the original socket is gone OR the userId
      // matches the stored userId for that slot.  Anonymous slots (no userId) are NOT
      // open to arbitrary takeover while the original socket is still live — that would
      // let any socket claim a connected player's turn mid-game.
      if (role === 'host') {
        const origConnected = io.sockets.sockets.has(room.hostSocketId)
        // For authenticated hosts: require matching userId.
        // For anonymous hosts: only allow takeover when the original socket has gone away.
        const isLegit = room.hostUserId
          ? userId === room.hostUserId
          : !origConnected || socket.id === room.hostSocketId
        if (!isLegit) {
          console.warn('[room] Unauthorized host takeover attempt code=%s userId=[redacted]', code)
          socket.emit('room-error', { message: 'Unauthorized' })
          return
        }
        room.hostSocketId = socket.id
      } else if (role === 'guest') {
        const origConnected = !!room.guestSocketId && io.sockets.sockets.has(room.guestSocketId)
        // Same logic for guest slot.
        const isLegit = room.guestUserId
          ? userId === room.guestUserId
          : !origConnected || socket.id === room.guestSocketId
        if (!isLegit) {
          console.warn('[room] Unauthorized guest takeover attempt code=%s userId=[redacted]', code)
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
        const remaining = Math.max(2, PICK_TIMER_MS / 1000 - elapsed)
        socket.emit('pick-timer-start', { picker: currentPicker, duration: remaining, spunTeam: room.currentSpunTeam })
      }
    })

    // ── Game Listings (open lobby browser) ───────────────────────────────────

    socket.on('get-listings', () => {
      // Join the lobby broadcast room so future listings-updated events reach this client
      socket.join('lobby')
      socket.emit('listings-updated', { listings: Array.from(gameListings.values()) })
    })

    socket.on('create-listing', async ({ teamMode, series, statCategory }: {
      userName?: string, teamMode: TeamMode, series: SeriesLength, statCategory?: StatCategory
    }) => {
      if (!['starter5', 'bench8', 'full12'].includes(teamMode)) return
      if (![1, 3, 5].includes(series)) return
      if (pendingListingCreate.has(socket.id)) return // prevent double-fire race
      pendingListingCreate.add(socket.id)
      // Always use the server-verified username from the JWT — never trust the client payload.
      // Accepting a client-supplied userName would let any authenticated user impersonate
      // another player's display name in the public lobby.
      const userId = socket.data.userId as string | null
      const userName: string = (socket.data.username as string | null ?? '').slice(0, 20) || 'Player'
      if (!userId) { pendingListingCreate.delete(socket.id); socket.emit('listing-error', { message: 'Must be signed in to post a game' }); return }
      // Guard: refuse if this socket or user is already in an active game room
      for (const room of rooms.values()) {
        if (room.status === 'drafting' && (room.hostSocketId === socket.id || room.guestSocketId === socket.id || (userId && (room.hostUserId === userId || room.guestUserId === userId)))) {
          pendingListingCreate.delete(socket.id)
          socket.emit('listing-error', { message: 'Finish your current game before posting a new one' })
          return
        }
      }
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
        // Re-verify tokenVersion here — the socket middleware only runs at connect time,
        // so a password change mid-session would not be caught without this check.
        const u = await prisma.user.findUnique({
          where: { id: userId },
          select: { wins: true, losses: true, draws: true, winStreak: true, tokenVersion: true },
        }).catch(() => null)
        if (!u || u.tokenVersion !== (socket.data.tokenVersion as number | null)) {
          pendingListingCreate.delete(socket.id)
          socket.emit('listing-error', { message: 'Session expired. Please refresh and sign in again.' })
          return
        }
        hostRecord.wins = u.wins; hostRecord.losses = u.losses; hostRecord.draws = u.draws; hostStreak = u.winStreak
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

      const resolvedStatCategory: StatCategory = (statCategory && VALID_STAT_CATEGORIES.includes(statCategory)) ? statCategory : 'games_played'
      const listing: GameListing = { code, hostSocketId: socket.id, hostUserId: userId, hostName: userName, hostRecord, hostBadge: hostUser?.equippedBadge || '', hostStreak, teamMode, series, statCategory: resolvedStatCategory }
      gameListings.set(code, listing)

      // Auto-expire listing after 10 minutes
      const expireTimer = setTimeout(() => {
        if (gameListings.has(code)) {
          gameListings.delete(code)
          listingTimers.delete(code)
          socket.emit('listing-expired')
          io.to('lobby').emit('listings-updated', { listings: Array.from(gameListings.values()) })
        }
      }, LISTING_EXPIRY_MS)
      listingTimers.set(code, expireTimer)

      pendingListingCreate.delete(socket.id)
      socket.emit('listing-created', { code })
      io.to('lobby').emit('listings-updated', { listings: Array.from(gameListings.values()) })
    })

    socket.on('cancel-listing', ({ code }: { code: string }) => {
      if (typeof code !== 'string') return
      const normCode = code.trim().toUpperCase()
      const listing = gameListings.get(normCode)
      if (!listing || listing.hostSocketId !== socket.id) return
      clearTimeout(listingTimers.get(normCode))
      listingTimers.delete(normCode)
      gameListings.delete(normCode)
      io.to('lobby').emit('listings-updated', { listings: Array.from(gameListings.values()) })
    })

    socket.on('join-listing', async ({ code: rawCode }: {
      code: string, userName?: string
    }) => {
      if (typeof rawCode !== 'string') return
      const code = rawCode.trim().toUpperCase()
      // Always use the server-verified username — never trust the client payload.
      const userId = socket.data.userId as string | null
      const userName: string = (socket.data.username as string | null ?? '').slice(0, 20) || 'Player'
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
      io.to('lobby').emit('listings-updated', { listings: Array.from(gameListings.values()) })

      // Re-verify tokenVersion — piggybacked onto the DB query we'd make anyway.
      // Guards against a stolen session cookie or a password change mid-session.
      const guestUser = userId ? await prisma.user.findUnique({
        where: { id: userId },
        select: { wins: true, losses: true, draws: true, equippedBadge: true, winStreak: true, tokenVersion: true },
      }).catch(() => null) : null
      if (userId && (!guestUser || guestUser.tokenVersion !== (socket.data.tokenVersion as number | null))) {
        socket.emit('listing-error', { message: 'Session expired. Please refresh and sign in again.' })
        return
      }
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
        teamMode: listing.teamMode, series: listing.series, difficulty: 'ebk',
        statCategory: listing.statCategory, userRecord: listing.hostRecord,
      }
      const guestEntry: QueueEntry = {
        socketId: socket.id, userId, userName,
        teamMode: listing.teamMode, series: listing.series, difficulty: 'ebk',
        statCategory: listing.statCategory, userRecord: guestRecord,
      }

      const readyTimer = setTimeout(() => {
        const rr = readyRooms.get(code)
        if (!rr) return
        readyRooms.delete(code)
        startGameFromReadyRoom(io, rr)
      }, READY_ROOM_TIMEOUT_MS)

      readyRooms.set(code, { code, hostEntry, guestEntry, hostReady: false, guestReady: false, timer: readyTimer })

      const basePayload = { proposedTeamMode: listing.teamMode, proposedSeries: listing.series, proposedStatCategory: listing.statCategory, grudgeMatch }
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

    socket.on('use-emote', async ({ code, emoteText }: { code: string; emoteText: string }) => {
      const room = rooms.get(typeof code === 'string' ? code.trim().toUpperCase() : '')
      if (!room || room.status !== 'drafting') return
      const isHost = socket.id === room.hostSocketId
      const isGuest = socket.id === room.guestSocketId
      if (!isHost && !isGuest) return
      // Validate emoteText against the known emote texts to prevent arbitrary string injection
      const emoteEntry = EMOTES.find(e => e.text === emoteText)
      if (!emoteEntry) return

      // Enforce unlock gate: verify the sender actually owns this emote.
      // Authenticated users: check their unlockedEmotes list from DB.
      // Anonymous users: only allow free emotes (winsRequired === 0).
      const userId = socket.data.userId as string | null
      if (userId) {
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { unlockedEmotes: true },
        }).catch(() => null)
        let unlocked: string[] = []
        try { unlocked = JSON.parse(dbUser?.unlockedEmotes || '[]') } catch { unlocked = [] }
        if (!unlocked.includes(emoteEntry.id)) return
      } else {
        // Anonymous players may only use emotes with winsRequired === 0
        if (emoteEntry.winsRequired > 0) return
      }

      const now = Date.now()
      const last = emoteLastSent.get(socket.id) ?? 0
      if (now - last < 3000) return // 3s cooldown
      emoteLastSent.set(socket.id, now)
      const targetSocketId = isHost ? room.guestSocketId : room.hostSocketId
      if (targetSocketId) io.to(targetSocketId).emit('opponent-emote', { emoteText })
    })

    socket.on('decline-match', ({ code }: { code: string }) => {
      if (typeof code !== 'string') return
      const normCode = code.trim().toUpperCase()
      const rr = readyRooms.get(normCode)
      if (!rr) return
      if (socket.id !== rr.hostEntry.socketId && socket.id !== rr.guestEntry.socketId) return
      clearTimeout(rr.timer)
      readyRooms.delete(normCode)
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
      if (typeof code !== 'string') return
      const normCode = code.trim().toUpperCase()
      const rr = readyRooms.get(normCode)
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
        readyRooms.delete(normCode)
        startGameFromReadyRoom(io, rr)
      }
    })

    // ── Auction Events ─────────────────────────────────────────────────────

    socket.on('auction:create', ({ teamSize, maxPlayers, userName }: { teamSize: number; maxPlayers: number; userName: string }) => {
      // Rate limit: max 5 room creations per minute per socket (shared with create-room)
      const acNow0 = Date.now()
      const acThrottle0 = createRoomThrottle.get(socket.id)
      if (acThrottle0 && acNow0 - acThrottle0.windowStart < 60_000) {
        if (acThrottle0.count >= 5) { socket.emit('auction:error', { message: 'Too many rooms created. Please wait a moment.' }); return }
        acThrottle0.count++
      } else { createRoomThrottle.set(socket.id, { count: 1, windowStart: acNow0 }) }

      if (![5, 8, 12].includes(teamSize) || maxPlayers < 2 || maxPlayers > 6) {
        socket.emit('auction:error', { message: 'Invalid settings' }); return
      }
      // Prefer the server-verified JWT username; fall back to sanitized client name for anonymous players.
      userName = ((socket.data.username as string | null) || (userName ?? '').trim()).slice(0, 20) || 'Player'
      if (allPlayers.length === 0) {
        socket.emit('auction:error', { message: 'Server still loading' }); return
      }

      // Block authenticated users from creating a room if they are already an active
      // participant in any draft or auction room.  Without this guard a single account
      // could open multiple tabs and create as many rooms as the per-socket throttle
      // allows (up to 5 per minute per tab), corrupting per-user stat recording.
      const userId: string | null = (socket.data as { userId?: string })?.userId ?? null
      if (userId && isUserActiveInAnyRoom(userId)) {
        socket.emit('auction:error', { message: 'You are already in an active game' }); return
      }

      let code = generateCode()
      while (auctionRooms.has(code)) code = generateCode()

      const budget = AUCTION_BUDGETS[teamSize] ?? 175
      const validPlayers = allPlayers.filter(p => p.ebkScore > 5)
      const shuffled = [...validPlayers].sort(() => Math.random() - 0.5)
      const poolSize = maxPlayers * teamSize * 2
      const pool = shuffled.slice(0, Math.min(poolSize, shuffled.length))

      const room: AuctionRoom = {
        code, hostSocketId: socket.id, maxPlayers, teamSize, totalBudget: budget,
        status: 'waiting',
        participants: [{ socketId: socket.id, userId, name: userName, budget, roster: [], paidPrices: {} }],
        playerPool: pool, currentPlayerIndex: -1, currentPlayer: null,
        currentBid: 0, currentBidderSocketId: null, currentBidderName: null,
        lastWinnerSocketId: null, lastWinnerName: null, lastWonAmount: 0, lastWonPlayerId: null,
        stealInitiated: false, bidTimer: null, bidDeadline: 0,
        tradeOffers: [], tradeDeadline: null, tradeTimer: null, bidLog: [], finalResults: null,
      }
      auctionRooms.set(code, room)
      socket.join(`auction:${code}`)
      console.log('[auction] created code=%s host=%s maxPlayers=%d teamSize=%d auction_rooms=%d',
        code, redactName(socket.data.username ?? 'anon'), room.maxPlayers, room.teamSize, auctionRooms.size)
      socket.emit('auction:created', { code })
      broadcastAuctionState(io, room)
    })

    socket.on('auction:join', ({ code, userName }: { code: string; userName: string }) => {
      // Prefer the server-verified JWT username; fall back to sanitized client name for anonymous players.
      userName = ((socket.data.username as string | null) || (userName ?? '').trim()).slice(0, 20) || 'Player'
      const room = auctionRooms.get(code.toUpperCase())
      if (!room) { socket.emit('auction:error', { message: 'Room not found' }); return }

      // Allow a previous participant (same name) to reconnect even if auction has started.
      // New socketId after reconnect won't match, so check by name first.
      // Security: if the stored participant has a userId, the reconnecting socket must
      // present a matching userId — blocking name-guessing seat hijacks by unauthenticated
      // clients or authenticated clients using a different account.
      const incomingUserId: string | null = (socket.data as { userId?: string })?.userId ?? null
      const existingByName = room.participants.find(p => p.name === userName)
      if (existingByName && room.status !== 'waiting') {
        if (existingByName.userId && incomingUserId !== existingByName.userId) {
          socket.emit('auction:error', { message: 'Unauthorized' })
          return
        }
        // For anonymous participants, only allow slot takeover when the original
        // socket is no longer connected — prevents name-guessing hijacks while the
        // real player is still live.
        if (!existingByName.userId && io.sockets.sockets.has(existingByName.socketId)) {
          socket.emit('auction:error', { message: 'Unauthorized' })
          return
        }
        const wasHost = existingByName.socketId === room.hostSocketId
        existingByName.socketId = socket.id
        if (wasHost) room.hostSocketId = socket.id
        socket.join(`auction:${room.code}`)
        socket.emit('auction:joined', { code: room.code })
        broadcastAuctionState(io, room)
        return
      }

      if (room.status !== 'waiting') { socket.emit('auction:error', { message: 'Auction already in progress' }); return }
      if (room.participants.length >= room.maxPlayers) { socket.emit('auction:error', { message: 'Room is full' }); return }
      if (room.participants.some(p => p.socketId === socket.id)) {
        socket.join(`auction:${room.code}`)
        broadcastAuctionState(io, room); return
      }
      // Reject duplicate names in the waiting room — the reconnect-by-name logic relies
      // on names being unique per room to identify the correct participant slot.
      if (room.participants.some(p => p.name === userName)) {
        socket.emit('auction:error', { message: 'That name is already taken in this room' }); return
      }
      const userId: string | null = (socket.data as { userId?: string })?.userId ?? null
      // Prevent simultaneous multi-game participation: a user already active in a draft
      // or another auction room cannot join a new one — concurrent games would corrupt
      // stat recording (wins/losses written by two finishGame calls for the same userId).
      if (userId && isUserActiveInAnyRoom(userId)) {
        socket.emit('auction:error', { message: 'You are already in an active game' }); return
      }
      room.participants.push({ socketId: socket.id, userId, name: userName, budget: room.totalBudget, roster: [], paidPrices: {} })
      socket.join(`auction:${room.code}`)
      socket.emit('auction:joined', { code: room.code })
      broadcastAuctionState(io, room)
    })

    socket.on('auction:start', ({ code }: { code: string }) => {
      const room = auctionRooms.get(code)
      if (!room || room.status !== 'waiting') return
      if (socket.id !== room.hostSocketId) { socket.emit('auction:error', { message: 'Only the host can start' }); return }
      if (room.participants.length < 2) { socket.emit('auction:error', { message: 'Need at least 2 players to start' }); return }
      advanceAuction(io, room)
    })

    socket.on('auction:bid', ({ code, amount }: { code: string; amount: number }) => {
      // Rate limit: max 5 bids per second per socket to prevent DoS spam
      const now = Date.now()
      const throttle = bidThrottle.get(socket.id)
      if (throttle && now - throttle.windowStart < 1000) {
        if (throttle.count >= 5) { socket.emit('auction:error', { message: 'Bidding too fast — slow down.' }); return }
        throttle.count++
      } else {
        bidThrottle.set(socket.id, { count: 1, windowStart: now })
      }

      const room = auctionRooms.get(code)
      if (!room || room.status !== 'bidding') return
      const bidder = room.participants.find(p => p.socketId === socket.id)
      if (!bidder) return
      // Upper-bound guard: reject amounts near or beyond MAX_SAFE_INTEGER to prevent
      // integer overflow exploits where a very large bid wraps to a negative value in
      // downstream arithmetic (e.g. budget subtraction, steal-price multiplication).
      if (!Number.isInteger(amount) || amount < 1 || amount <= room.currentBid || amount > 1_000_000) {
        socket.emit('auction:error', { message: `Bid must be more than $${room.currentBid}M` }); return
      }
      if (amount > bidder.budget) { socket.emit('auction:error', { message: 'Not enough budget' }); return }
      if (bidder.roster.length >= room.teamSize) { socket.emit('auction:error', { message: 'Roster is full' }); return }

      room.currentBid = amount
      room.currentBidderSocketId = socket.id
      room.currentBidderName = bidder.name

      const remaining = room.bidDeadline - Date.now()
      if (remaining < BID_EXTENSION_THRESHOLD_MS) {
        room.bidDeadline = Date.now() + BID_EXTENSION_MS
        if (room.bidTimer) clearTimeout(room.bidTimer)
        room.bidTimer = setTimeout(() => handleAuctionBidExpiry(io, room), BID_EXTENSION_MS)
      }

      room.bidLog.push({ name: bidder.name, amount, action: 'bid' })
      broadcastAuctionState(io, room)
    })

    // Explicit pass: skip the current player immediately (no 25s wait).
    // Uses playerIndex to prevent stale passes from double-advancing the auction.
    socket.on('auction:pass', ({ code, playerIndex }: { code: string; playerIndex: number }) => {
      const room = auctionRooms.get(code)
      if (!room || room.status !== 'bidding') return
      // Validate playerIndex is an integer — reject spoofed non-numeric values
      if (!Number.isInteger(playerIndex)) return
      // Ignore if the player is passing on an already-advanced round
      if (room.currentPlayerIndex !== playerIndex) return
      const passer = room.participants.find(p => p.socketId === socket.id)
      if (!passer) return
      // Only allow a pass when nobody has bid yet — once a bid is placed the
      // auction must run its course (timer or outbid). Without this check any
      // participant could force-skip a player that another participant is winning,
      // cancelling a valid bid.
      if (room.currentBid > 0) {
        socket.emit('auction:error', { message: 'Cannot pass after a bid has been placed' })
        return
      }
      // Cancel the running timer so handleAuctionBidExpiry doesn't also fire
      if (room.bidTimer) { clearTimeout(room.bidTimer); room.bidTimer = null }
      room.bidLog.push({ name: passer.name, amount: 0, action: 'pass' })
      advanceAuction(io, room)
    })

    socket.on('auction:steal', ({ code, playerIdToSteal }: { code: string; playerIdToSteal: number }) => {
      const room = auctionRooms.get(code)
      if (!room || room.status !== 'steal-window') return
      if (room.stealInitiated) { socket.emit('auction:error', { message: 'Steal already used this round' }); return }
      // Validate playerIdToSteal is a positive integer to prevent prototype pollution or NaN tricks
      if (!Number.isInteger(playerIdToSteal) || playerIdToSteal <= 0) {
        socket.emit('auction:error', { message: 'Invalid steal target' }); return
      }
      const stealer = room.participants.find(p => p.socketId === socket.id)
      if (!stealer) return
      // Restrict steal to the player that was just won this round — prevents a stealer
      // from targeting any arbitrary roster slot across all participants (e.g. stealing a
      // high-value player acquired many rounds earlier while a cheap player is on the block).
      if (room.lastWonPlayerId === null || playerIdToSteal !== room.lastWonPlayerId) {
        socket.emit('auction:error', { message: 'You can only steal the player just won this round' }); return
      }
      const owner = room.participants.find(p => p.roster.includes(playerIdToSteal))
      if (!owner || owner.socketId === socket.id) { socket.emit('auction:error', { message: 'Invalid steal target' }); return }
      const originalPrice = owner.paidPrices[playerIdToSteal] ?? 1
      const stealPrice = Math.ceil(originalPrice * STEAL_MULTIPLIER)
      if (stealer.budget < stealPrice) { socket.emit('auction:error', { message: `Need $${stealPrice}M to steal` }); return }
      if (stealer.roster.length >= room.teamSize) { socket.emit('auction:error', { message: 'Roster is full' }); return }

      stealer.budget -= stealPrice
      stealer.roster.push(playerIdToSteal)
      stealer.paidPrices[playerIdToSteal] = stealPrice
      owner.roster = owner.roster.filter(id => id !== playerIdToSteal)
      owner.budget += originalPrice
      delete owner.paidPrices[playerIdToSteal]

      room.stealInitiated = true
      room.bidLog.push({ name: stealer.name, amount: stealPrice, action: 'steal' })
      broadcastAuctionState(io, room)

      if (room.bidTimer) clearTimeout(room.bidTimer)
      room.bidTimer = setTimeout(() => advanceAuction(io, room), POST_STEAL_ADVANCE_MS)
    })

    socket.on('auction:trade-offer', ({ code, toSocketId, offeredPlayerIds, requestedPlayerIds }: {
      code: string; toSocketId: string; offeredPlayerIds: number[]; requestedPlayerIds: number[]
    }) => {
      const room = auctionRooms.get(code)
      if (!room || room.status !== 'trading') return
      // Prevent self-trade: offering to yourself would corrupt paidPrices when the
      // same participant object is used as both `from` and `to`.
      if (toSocketId === socket.id) {
        socket.emit('auction:error', { message: 'Cannot trade with yourself' })
        return
      }
      const from = room.participants.find(p => p.socketId === socket.id)
      const to = room.participants.find(p => p.socketId === toSocketId)
      if (!from || !to) return
      // Validate arrays are proper non-empty arrays of integers within roster bounds.
      // empty-array trades are no-ops that pollute the offer list; oversized arrays
      // could reference players outside the pool.
      if (!Array.isArray(offeredPlayerIds) || !Array.isArray(requestedPlayerIds)) {
        socket.emit('auction:error', { message: 'Invalid trade payload' }); return
      }
      if (offeredPlayerIds.length === 0 && requestedPlayerIds.length === 0) {
        socket.emit('auction:error', { message: 'Trade must include at least one player' }); return
      }
      if (offeredPlayerIds.length > room.teamSize || requestedPlayerIds.length > room.teamSize) {
        socket.emit('auction:error', { message: 'Too many players in trade offer' }); return
      }
      if (!offeredPlayerIds.every(id => Number.isInteger(id) && id > 0)) {
        socket.emit('auction:error', { message: 'Invalid player IDs in trade offer' }); return
      }
      if (!requestedPlayerIds.every(id => Number.isInteger(id) && id > 0)) {
        socket.emit('auction:error', { message: 'Invalid player IDs in trade request' }); return
      }
      // Reject duplicate player IDs in either array.
      // Without this check a sender could list the same ID twice (e.g. [23, 23]);
      // the ownership guard would pass (23 is in the roster) but the execution loop
      // would push the player into the recipient's roster twice while only removing
      // them once, corrupting both rosters.
      const uniqueOffered = new Set(offeredPlayerIds)
      const uniqueRequested = new Set(requestedPlayerIds)
      if (uniqueOffered.size !== offeredPlayerIds.length || uniqueRequested.size !== requestedPlayerIds.length) {
        socket.emit('auction:error', { message: 'Duplicate player IDs in trade offer' }); return
      }
      if (!offeredPlayerIds.every(id => from.roster.includes(id))) { socket.emit('auction:error', { message: "You don't own those players" }); return }
      if (!requestedPlayerIds.every(id => to.roster.includes(id))) { socket.emit('auction:error', { message: "They don't own those players" }); return }

      const offer: TradeOffer = {
        id: Math.random().toString(36).substring(2, 10),
        fromSocketId: socket.id, fromName: from.name,
        toSocketId, toName: to.name,
        offeredPlayerIds, requestedPlayerIds, createdAt: Date.now(),
      }
      room.tradeOffers = room.tradeOffers.filter(o => !(o.fromSocketId === socket.id && o.toSocketId === toSocketId))
      room.tradeOffers.push(offer)
      broadcastAuctionState(io, room)
    })

    socket.on('auction:trade-respond', ({ code, offerId, accept }: { code: string; offerId: string; accept: boolean }) => {
      const room = auctionRooms.get(code)
      if (!room || room.status !== 'trading') return
      const offerIdx = room.tradeOffers.findIndex(o => o.id === offerId)
      if (offerIdx === -1) return
      const offer = room.tradeOffers[offerIdx]
      if (offer.toSocketId !== socket.id) return
      // Extra guard: reject self-accept even if socketIds match after a reconnect collision
      if (offer.fromSocketId === socket.id) {
        room.tradeOffers.splice(offerIdx, 1)
        socket.emit('auction:error', { message: 'Cannot accept your own trade offer' })
        return
      }
      room.tradeOffers.splice(offerIdx, 1)

      if (accept) {
        const from = room.participants.find(p => p.socketId === offer.fromSocketId)
        const to = room.participants.find(p => p.socketId === offer.toSocketId)
        if (from && to) {
          // Re-validate ownership at accept time to prevent double-ownership when a
          // player appeared in multiple concurrent trade offers and one already executed.
          const fromStillOwns = offer.offeredPlayerIds.every(id => from.roster.includes(id))
          const toStillOwns = offer.requestedPlayerIds.every(id => to.roster.includes(id))
          if (!fromStillOwns || !toStillOwns) {
            socket.emit('auction:error', { message: 'Trade is no longer valid — a player was already traded away' })
            broadcastAuctionState(io, room)
            return
          }
          for (const id of offer.offeredPlayerIds) {
            from.roster = from.roster.filter(r => r !== id)
            to.roster.push(id); to.paidPrices[id] = from.paidPrices[id]; delete from.paidPrices[id]
          }
          for (const id of offer.requestedPlayerIds) {
            to.roster = to.roster.filter(r => r !== id)
            from.roster.push(id); from.paidPrices[id] = to.paidPrices[id]; delete to.paidPrices[id]
          }
          room.bidLog.push({ name: `${from.name} ↔ ${to.name}`, amount: 0, action: 'trade' })
        }
      }
      broadcastAuctionState(io, room)
    })

    socket.on('auction:get-state', ({ code, userName }: { code: string; userName?: string }) => {
      const room = auctionRooms.get(code)
      if (!room) { socket.emit('auction:error', { message: 'Room not found' }); return }

      // Handle reconnection: if this socket is not a participant but a participant
      // has the same name (or same userId), update their socketId.
      // Security: if the stored participant has a userId, the reconnecting socket
      // must present a matching userId — otherwise any unauthenticated client can
      // steal a seat by knowing the participant's username.
      const existing = room.participants.find(p => p.socketId === socket.id)
      if (!existing && userName) {
        const byName = room.participants.find(p => p.name === userName)
        if (byName) {
          const incomingUserId: string | null = (socket.data as { userId?: string })?.userId ?? null
          // If the stored participant was authenticated, require a matching userId.
          if (byName.userId && incomingUserId !== byName.userId) {
            socket.emit('auction:error', { message: 'Unauthorized' })
            return
          }
          // For anonymous participants, only allow slot takeover when the original
          // socket is no longer connected — prevents name-guessing hijacks while the
          // real player is still live.
          if (!byName.userId && io.sockets.sockets.has(byName.socketId)) {
            socket.emit('auction:error', { message: 'Unauthorized' })
            return
          }
          // Re-seat this socket into the existing participant slot (reconnection)
          const wasHost = byName.socketId === room.hostSocketId
          byName.socketId = socket.id
          if (wasHost) room.hostSocketId = socket.id
          socket.join(`auction:${room.code}`)
        }
      }

      // Rebuild and emit state directly to the requesting socket (not just participants).
      // This handles the case where socketId changed after a reconnect/navigation.
      const state = buildAuctionStateForSocket(room)
      socket.emit('auction:state', state)
    })

    socket.on('auction:finish-trading', ({ code }: { code: string }) => {
      const room = auctionRooms.get(code)
      if (!room || room.status !== 'trading' || socket.id !== room.hostSocketId) return
      if (room.tradeTimer) clearTimeout(room.tradeTimer)
      finishAuction(io, room)
    })

    socket.on('disconnect', () => {
      emoteLastSent.delete(socket.id)
      bidThrottle.delete(socket.id)
      joinRoomThrottle.delete(socket.id)
      createRoomThrottle.delete(socket.id)
      // Remove any open listing by this socket
      for (const [code, listing] of gameListings.entries()) {
        if (listing.hostSocketId === socket.id) {
          clearTimeout(listingTimers.get(code))
          listingTimers.delete(code)
          gameListings.delete(code)
          io.to('lobby').emit('listings-updated', { listings: Array.from(gameListings.values()) })
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
          // Waiting rooms: keep alive briefly (host may navigate to game page causing a brief
          // reconnect), but if the HOST socket disconnects we must eventually clean up —
          // otherwise a room with no host leaks forever since no guest will ever join.
          // Schedule cleanup after the same grace period used for completed rooms.
          if (room.status === 'waiting') {
            if (room.hostSocketId === socket.id) {
              scheduleRoomCleanup(code, io)
            }
            return
          }
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
          // Award win to remaining player and loss to disconnector for online games
          if (room.source === 'online') {
            recordMatchup(room.hostUserId, room.guestUserId)
            const disconnectorIsHost = room.hostSocketId === socket.id
            const winner = disconnectorIsHost ? 'guest' : 'host'
            // Give the winner enough series wins to clearly win the series
            const winsNeeded = Math.ceil(room.series / 2)
            if (winner === 'host') {
              room.hostSeriesScore = Math.max(room.hostSeriesScore, winsNeeded)
            } else {
              room.guestSeriesScore = Math.max(room.guestSeriesScore, winsNeeded)
            }
            if (room.hostUserId) updateStatsAndUnlock(io, room.hostUserId, room.hostSocketId, winner === 'host', false, room.hostJCGames, true)
            if (room.guestUserId) updateStatsAndUnlock(io, room.guestUserId, room.guestSocketId!, winner === 'guest', false, room.guestJCGames, false)
            saveGameRecords(room, winner)
          }
          // scheduleRoomCleanup cleans up consecutiveTimeouts/pickTimerStartedAt/rooms
          scheduleRoomCleanup(code, io)
        }
      })

      pendingListingCreate.delete(socket.id)

      // Auction rooms: remove from waiting, keep in active for reconnection
      auctionRooms.forEach((room) => {
        const pIdx = room.participants.findIndex(p => p.socketId === socket.id)
        if (pIdx === -1) return
        if (room.status === 'waiting') {
          room.participants.splice(pIdx, 1)
          if (room.participants.length === 0) {
            if (room.bidTimer) clearTimeout(room.bidTimer)
            auctionRooms.delete(room.code)
          } else {
            if (room.hostSocketId === socket.id) room.hostSocketId = room.participants[0].socketId
            broadcastAuctionState(io, room)
          }
        } else if (room.status !== 'complete') {
          // Active room: mark the participant as disconnected but keep their slot.
          // Broadcast state so remaining players see accurate participant list.
          broadcastAuctionState(io, room)
          // If ALL participants are now disconnected, tear down timers and delete the
          // room — nobody is coming back and the timers would otherwise fire forever.
          const allGone = room.participants.every(p => !io.sockets.sockets.has(p.socketId))
          if (allGone) {
            if (room.bidTimer) clearTimeout(room.bidTimer)
            if (room.tradeTimer) clearTimeout(room.tradeTimer)
            auctionRooms.delete(room.code)
          }
        }
      })
    })
  })

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`)
  })
})
