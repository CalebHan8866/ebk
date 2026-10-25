import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { Server as SocketServer } from 'socket.io'
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'
import { BADGES, EMOTES, MILESTONES } from './src/lib/accessories'
import { verifyToken } from './src/lib/auth'
import { validateEnv } from './src/lib/validateEnv'
import { containsProfanity } from './src/lib/profanity'

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

// ─── Payload validation helpers ─────────────────────────────────────────────

/**
 * Assert that every listed field exists (is not undefined/null) on the given
 * object.  Throws a TypeError with a clear message on the first missing field.
 * Intended for use at the top of socket.on handlers before any business logic.
 *
 * Usage:
 *   requireFields(payload, 'code', 'amount')
 */
function requireFields<T extends object>(obj: T, ...fields: (keyof T)[]): void {
  for (const f of fields) {
    if (obj[f] === undefined || obj[f] === null) {
      throw new TypeError(`Missing required field: ${String(f)}`)
    }
  }
}

/**
 * Resolve the display name for a socket connection.
 * Authenticated users get their server-verified JWT username (already profanity-
 * filtered at registration / profile-update).  Anonymous users supply their name
 * via the client payload — truncate it and apply the profanity filter before
 * storing or broadcasting it; fall back to 'Player' on a blank or dirty name.
 */
function resolveDisplayName(
  socketUsername: string | null,
  clientUserName: unknown,
): string {
  if (socketUsername) return socketUsername.slice(0, 20)
  const raw = (typeof clientUserName === 'string' ? clientUserName : '').trim().slice(0, 20)
  if (!raw || containsProfanity(raw)) return 'Player'
  return raw
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
/** Grace period before partner-disconnected fires — lets the socket reconnect first */
const PARTNER_DISCONNECT_GRACE_MS = 8_000
/** Steal price multiplier: winner pays ceil(originalPrice × STEAL_MULTIPLIER) */
const STEAL_MULTIPLIER = 1.5
/** Auction budget by team size */
const AUCTION_BUDGETS: Record<number, number> = { 5: 125, 8: 175, 12: 250 }
/** How often the in-memory player list is refreshed from the DB (scrape-bbref runs in background) */
const PLAYER_REFRESH_MS = 5 * 60 * 1000
/** How often stale cooldown / grudge-count map entries are pruned */
const COOLDOWN_PRUNE_MS = 60 * 60 * 1000
/** How often the socket/room metrics heartbeat is logged */
const METRICS_HEARTBEAT_MS = 5 * 60 * 1000
/** How often stale pre-game rooms (waiting/waiting-auction) are swept */
const STALE_ROOM_SWEEP_MS = 5 * 60 * 1000
/** Maximum age of a room stuck in a pre-game state before it is force-deleted */
const STALE_WAITING_ROOM_MS = 30 * 60 * 1000
/** Maximum Socket.IO per-message payload — prevents memory exhaustion from oversized frames */
const MAX_HTTP_BUFFER_BYTES = 10 * 1024
/** Per-socket bid throttle: max bids allowed within BID_THROTTLE_WINDOW_MS */
const BID_THROTTLE_MAX = 5
/** Sliding-window duration for the bid throttle (ms) */
const BID_THROTTLE_WINDOW_MS = 1_000
/** Per-socket join-room throttle: max join attempts per THROTTLE_WINDOW_MS */
const JOIN_THROTTLE_MAX = 10
/** Per-socket room-creation throttle: max rooms created per THROTTLE_WINDOW_MS */
const CREATE_THROTTLE_MAX = 5
/** Sliding-window duration shared by join and create throttles (ms) */
const THROTTLE_WINDOW_MS = 60_000
/** Per-socket get-room throttle: max reconnect/state-sync requests per GET_ROOM_WINDOW_MS */
const GET_ROOM_THROTTLE_MAX = 10
/** Sliding-window duration for the get-room throttle (ms) */
const GET_ROOM_WINDOW_MS = 10_000
/** Per-socket get-listings throttle: max lobby refresh requests per GET_LISTINGS_WINDOW_MS */
const GET_LISTINGS_THROTTLE_MAX = 5
/** Sliding-window duration for the get-listings throttle (ms) */
const GET_LISTINGS_WINDOW_MS = 5_000
/** Per-socket join-listing throttle: max join-listing attempts per THROTTLE_WINDOW_MS */
const JOIN_LISTING_THROTTLE_MAX = 10
/** Per-socket auction:get-state throttle: max state-sync/reconnect calls per GET_AUCTION_STATE_WINDOW_MS */
const GET_AUCTION_STATE_THROTTLE_MAX = 20
/** Sliding-window duration for the auction:get-state throttle (ms) */
const GET_AUCTION_STATE_WINDOW_MS = 60_000
/** Per-socket create-listing throttle: max listing create attempts per THROTTLE_WINDOW_MS */
const CREATE_LISTING_THROTTLE_MAX = 5
/** Per-socket auction:trade throttle: max trade actions (offer/cancel/respond) per TRADE_THROTTLE_WINDOW_MS */
const TRADE_THROTTLE_MAX = 10
/** Sliding-window duration for the trade action throttle (ms) */
const TRADE_THROTTLE_WINDOW_MS = 10_000
/** Per-socket confirm-ready throttle: max ready confirmations per CONFIRM_READY_WINDOW_MS.
 *  Each call broadcasts ready-update to both sockets; uncapped spam would flood both clients. */
const CONFIRM_READY_THROTTLE_MAX = 5
/** Sliding-window duration for the confirm-ready throttle (ms) */
const CONFIRM_READY_WINDOW_MS = 5_000
/** Per-socket pick-player throttle: max picks per PICK_THROTTLE_WINDOW_MS.
 *  Each successful pick emits room-updated / game-result / series-complete to both clients;
 *  unthrottled spam causes redundant broadcasts while the state idempotency check still runs. */
const PICK_THROTTLE_MAX = 10
/** Sliding-window duration for the pick-player throttle (ms) */
const PICK_THROTTLE_WINDOW_MS = 5_000
/** Per-socket next-game throttle: max next-game requests per NEXT_GAME_THROTTLE_WINDOW_MS.
 *  Each call can emit draft-started + full allPlayers list to both clients. */
const NEXT_GAME_THROTTLE_MAX = 3
/** Sliding-window duration for the next-game throttle (ms) */
const NEXT_GAME_THROTTLE_WINDOW_MS = 5_000
/** Per-socket cancel-listing throttle: max cancel-listing calls per CANCEL_LISTING_THROTTLE_WINDOW_MS.
 *  Each call broadcasts listings-updated to all lobby clients. */
const CANCEL_LISTING_THROTTLE_MAX = 5
/** Sliding-window duration for the cancel-listing throttle (ms) */
const CANCEL_LISTING_THROTTLE_WINDOW_MS = 10_000
/** Per-userId room/listing creation throttle: max creations per USER_CREATE_THROTTLE_WINDOW_MS.
 *  Keyed by userId so it survives socket reconnects — prevents reconnect-bypass of per-socket throttles. */
const USER_CREATE_THROTTLE_MAX = 5
/** Sliding-window duration for the per-userId room/listing creation throttle (ms) */
const USER_CREATE_THROTTLE_WINDOW_MS = 60_000

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
  /** Set to true once saveGameRecords has been called for this room. Prevents duplicate DB inserts if saveGameRecords is ever called twice for the same game. */
  gameRecordsSaved: boolean
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
  /** Unix ms timestamp when the room was created — used by the stale-room sweep */
  createdAt: number
  /**
   * Server-issued one-time tokens that survive socket reconnects.
   * Used to verify anonymous player identity on get-room when there is no
   * JWT userId to compare against.  Each token is 16 random hex bytes (32
   * hex chars), issued once at room-creation / join and stored client-side
   * in sessionStorage.  Authenticated players (userId present) skip the
   * token check — their JWT already provides the identity proof.
   */
  hostReconnectToken: string
  guestReconnectToken: string
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
  ebkGpScore: number
  ebkPpgScore: number
  ebkRpgScore: number
  ebkApgScore: number
  ebkMpgScore: number
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
  /** Server-issued reconnect token stored client-side in sessionStorage.
   *  Used to verify anonymous participant identity on auction:get-state when
   *  the original socket has disconnected and the incoming socket ID changed.
   *  Authenticated participants (userId present) skip the token check — their
   *  JWT already provides identity proof.  Token is 16 random hex bytes. */
  reconnectToken: string
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
  /** SocketId of the participant whose turn it is to nominate (pass without a bid).
   *  Rotates round-robin each time advanceAuction starts a new bidding round.
   *  Only the current nominator may call auction:pass — any other participant
   *  calling pass before a bid is placed would unfairly skip the player. */
  nominatorSocketId: string | null
  stealInitiated: boolean
  bidTimer: ReturnType<typeof setTimeout> | null
  bidDeadline: number
  tradeOffers: TradeOffer[]
  tradeDeadline: number | null
  tradeTimer: ReturnType<typeof setTimeout> | null
  bidLog: Array<{ name: string; amount: number; action: 'bid' | 'steal' | 'won' | 'pass' | 'trade' }>
  finalResults: AuctionResult[] | null
  /** Unix ms timestamp when the room was created — used by the stale-room sweep */
  createdAt: number
  /** Handle for the post-finishAuction room-deletion timer (AUCTION_CLEANUP_MS).
   *  Stored so it can be cancelled if all participants disconnect while the room
   *  is in 'complete' status, freeing the room object from memory immediately
   *  rather than holding it for the full 30-minute review window. */
  cleanupTimer: ReturnType<typeof setTimeout> | null
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
// Pending partner-disconnected timers: roomCode → timer handle.
// Gives the disconnected player PARTNER_DISCONNECT_GRACE_MS to reconnect before
// the game is finalized as a forfeit.
const partnerDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
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
// Per-socket get-room throttle: prevents spamming reconnect/state-sync requests that
// each emit the full allPlayers list — large payloads that can saturate the socket.
const getRoomThrottle = new Map<string, { count: number; windowStart: number }>()
// Per-socket get-listings throttle: prevents a client from hammering the lobby refresh
// and joining the 'lobby' broadcast room repeatedly (each call re-joins and re-emits).
const getListingsThrottle = new Map<string, { count: number; windowStart: number }>()
// Per-socket join-listing throttle: each attempt runs two Prisma queries; cap at
// JOIN_LISTING_THROTTLE_MAX per minute to prevent DB query flooding.
const joinListingThrottle = new Map<string, { count: number; windowStart: number }>()
// Per-socket auction:get-state throttle: state-sync hits Prisma on cache miss; cap at
// GET_AUCTION_STATE_THROTTLE_MAX per minute to prevent DB flooding from unknown codes.
const getAuctionStateThrottle = new Map<string, { count: number; windowStart: number }>()
// Per-socket create-listing throttle: each call runs Prisma queries and broadcasts to all
// lobby clients; cap at CREATE_LISTING_THROTTLE_MAX per minute.
const createListingThrottle = new Map<string, { count: number; windowStart: number }>()
// Per-socket trade-action throttle: offer/cancel/respond all trigger broadcastAuctionState;
// cap at TRADE_THROTTLE_MAX per TRADE_THROTTLE_WINDOW_MS to prevent broadcast flooding.
const tradeThrottle = new Map<string, { count: number; windowStart: number }>()
// Per-socket confirm-ready throttle: each call broadcasts ready-update to both match
// participants; cap at CONFIRM_READY_THROTTLE_MAX per CONFIRM_READY_WINDOW_MS to prevent
// a malicious socket from flooding both players' connections before the match starts.
const confirmReadyThrottle = new Map<string, { count: number; windowStart: number }>()
// Per-socket pick-player throttle: each successful pick broadcasts room state to both
// clients; cap at PICK_THROTTLE_MAX per PICK_THROTTLE_WINDOW_MS.
const pickThrottle = new Map<string, { count: number; windowStart: number }>()
// Per-socket next-game throttle: each call can broadcast draft-started + full player list;
// cap at NEXT_GAME_THROTTLE_MAX per NEXT_GAME_THROTTLE_WINDOW_MS.
const nextGameThrottle = new Map<string, { count: number; windowStart: number }>()
// Per-socket cancel-listing throttle: each call broadcasts listings-updated to all lobby
// clients; cap at CANCEL_LISTING_THROTTLE_MAX per CANCEL_LISTING_THROTTLE_WINDOW_MS.
const cancelListingThrottle = new Map<string, { count: number; windowStart: number }>()
// Per-userId room/listing creation throttle: keyed by userId so it survives socket
// reconnects, preventing bypass of per-socket throttles via rapid disconnect/reconnect.
// Only applies to authenticated users — anonymous users are covered by the IP-level
// connection limit (20 concurrent connections per IP).
const userCreateThrottle = new Map<string, { count: number; windowStart: number }>()
// cooldown: userId → Map(opponentId → timestamp of last game end)
const recentMatchups = new Map<string, Map<string, number>>()
// grudge: userId → Map(opponentId → total games played together)
const matchupCount = new Map<string, Map<string, number>>()
let allPlayers: PlayerData[] = []
let playerById = new Map<number, PlayerData>() // fast O(1) lookup by id — contains ALL rows (including multi-team dupes) for safe stat lookups

/**
 * Deduplicate a raw player list so the draft/auction pool shows each real-world
 * player exactly once.  The DB stores one row per (player, team) stint — e.g.
 * Jimmy Butler has rows for CHI, MIN, PHI, and MIA.  Since all rows now carry
 * identical career-total stats, allowing multiples in the pool means the same
 * player could be drafted (or auctioned) multiple times.
 *
 * Strategy: keep the row whose yearTo is highest (most recent team stint).
 * Ties are broken by yearFrom descending, then id ascending for stability.
 */
function deduplicatePlayers(players: PlayerData[]): PlayerData[] {
  const best = new Map<string, PlayerData>()
  for (const p of players) {
    const key = `${p.firstName}|||${p.lastName}`
    const existing = best.get(key)
    if (!existing) { best.set(key, p); continue }
    // Prefer higher yearTo (more recent career end), then higher yearFrom, then lower id
    if (
      p.yearTo > existing.yearTo ||
      (p.yearTo === existing.yearTo && p.yearFrom > existing.yearFrom) ||
      (p.yearTo === existing.yearTo && p.yearFrom === existing.yearFrom && p.id < existing.id)
    ) {
      best.set(key, p)
    }
  }
  return Array.from(best.values())
}

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
  // Idempotency guard: if records were already written for this room (e.g. due to a
  // future code path calling saveGameRecords twice), skip the second write entirely.
  if (room.gameRecordsSaved) return
  room.gameRecordsSaved = true
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

    // Compute the new maxWinStreak in-process — no extra DB round-trip needed.
    // We fold the conditional maxWinStreak write into the single accessories update below.
    const newMaxWinStreak = u.winStreak > u.maxWinStreak ? u.winStreak : undefined
    const effectiveMaxStreak = newMaxWinStreak ?? u.maxWinStreak

    const stats = { wins: u.wins, gamesPlayed: u.gamesPlayed, winStreak: u.winStreak, maxWinStreak: effectiveMaxStreak, jcGames: u.jamesonCurryGames }
    let curBadges:     string[] = []
    let curEmotes:     string[] = []
    let curMilestones: string[] = []
    try { curBadges     = JSON.parse(u.unlockedBadges     || '[]') } catch { curBadges     = [] }
    try { curEmotes     = JSON.parse(u.unlockedEmotes     || '[]') } catch { curEmotes     = [] }
    try { curMilestones = JSON.parse(u.unlockedMilestones || '[]') } catch { curMilestones = [] }

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

    // Merge maxWinStreak update with accessories update into a single DB write.
    // Previously this was up to two separate update() calls (one for maxWinStreak,
    // one for accessories) — now it is always at most one round-trip.
    if (newMaxWinStreak !== undefined || newBadges.length || newEmotes.length || newMilestones.length) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          ...(newMaxWinStreak !== undefined ? { maxWinStreak: newMaxWinStreak } : {}),
          ...(newBadges.length     ? { unlockedBadges:     JSON.stringify([...curBadges,     ...newBadges])     } : {}),
          ...(newEmotes.length     ? { unlockedEmotes:     JSON.stringify([...curEmotes,     ...newEmotes])     } : {}),
          ...(newMilestones.length ? { unlockedMilestones: JSON.stringify([...curMilestones, ...newMilestones]) } : {}),
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
  // Also cancel any pending forfeit grace-period timer — the game has already ended.
  const forfeit = partnerDisconnectTimers.get(code)
  if (forfeit) { clearTimeout(forfeit); partnerDisconnectTimers.delete(code) }

  const handle = setTimeout(() => {
    roomCleanupTimers.delete(code)
    const t = pickTimers.get(code)
    if (t) clearTimeout(t)
    pickTimers.delete(code)
    rooms.delete(code)
    pickTimerStartedAt.delete(code)
    consecutiveTimeouts.delete(code)
    // Belt-and-suspenders: cancel any still-pending forfeit grace timer.  Under normal
    // operation scheduleRoomCleanup() already cancels it at call-time (lines above),
    // but if the timer somehow fires after the grace period was restarted (e.g. via a
    // rapid scheduleRoomCleanup → rescheduled cleanup path), this prevents the stale
    // callback from referencing an already-deleted room object.
    const stale = partnerDisconnectTimers.get(code)
    if (stale) { clearTimeout(stale); partnerDisconnectTimers.delete(code) }
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
  available.sort((a, b) => getStatForMode(b, statMode) - getStatForMode(a, statMode))
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

    // Stale-timer guard: if the live index no longer points to the player this
    // timer was set for (e.g. a manual pick advanced the turn between the timer
    // being set and firing), bail out.  Node's clearTimeout is reliable, so this
    // should never trigger in practice, but it makes the invariant explicit and
    // protects against any future state-mutation bug that bypasses clearTimeout.
    const picker = currentRoom.draftOrder[currentRoom.currentPickIndex]
    if (picker !== currentPicker) return
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
    // Guard against duplicate picks (shouldn't happen, but be safe).
    // If autoPickPlayer somehow returns an already-taken player, skip this pick by
    // advancing the index and restarting the timer — returning without action here
    // would leave the room status='drafting' with no timer running and no pick made,
    // permanently deadlocking the draft.
    // IMPORTANT: check draft completion BEFORE restarting the timer.  If the duplicate
    // fires at the very last pick slot (currentPickIndex === teamSize * 2 - 1), the
    // increment would push currentPickIndex to teamSize * 2 and startPickTimer would
    // read draftOrder[teamSize * 2] === undefined, causing picker to be undefined for
    // the rest of the timer lifetime — corrupting the pick assignment branch and
    // preventing the draft from ever ending.
    if (currentRoom.hostPicks.includes(pickedId) || currentRoom.guestPicks.includes(pickedId)) {
      currentRoom.currentPickIndex++
      pickTimers.delete(code)
      const teamSizeForDup = TEAM_SIZES[currentRoom.teamMode]
      if (currentRoom.currentPickIndex >= teamSizeForDup * 2) {
        // The draft is effectively complete (we just skipped the last slot).
        // Fall through to the draft-complete path rather than starting another timer.
        const result = calculateResult(currentRoom)
        currentRoom.gameResults.push(result)
        if (result.winner === 'host') currentRoom.hostSeriesScore++
        else if (result.winner === 'guest') currentRoom.guestSeriesScore++
        if (currentRoom.hostPicks.includes(JAMESON_CURRY_ID)) currentRoom.hostJCGames++
        if (currentRoom.guestPicks.includes(JAMESON_CURRY_ID)) currentRoom.guestJCGames++
        const winsNeededForDup = Math.ceil(currentRoom.series / 2)
        const seriesDoneForDup = currentRoom.hostSeriesScore >= winsNeededForDup || currentRoom.guestSeriesScore >= winsNeededForDup || currentRoom.currentGame >= currentRoom.series
        currentRoom.status = seriesDoneForDup ? 'complete' : 'result'
        if (seriesDoneForDup) {
          const seriesWinnerForDup = currentRoom.hostSeriesScore > currentRoom.guestSeriesScore ? 'host' : currentRoom.guestSeriesScore > currentRoom.hostSeriesScore ? 'guest' : 'draw'
          if (currentRoom.source === 'online') {
            recordMatchup(currentRoom.hostUserId, currentRoom.guestUserId)
            if (currentRoom.hostUserId) updateStatsAndUnlock(io, currentRoom.hostUserId, currentRoom.hostSocketId, seriesWinnerForDup === 'host', seriesWinnerForDup === 'draw', currentRoom.hostJCGames, true)
            if (currentRoom.guestUserId) updateStatsAndUnlock(io, currentRoom.guestUserId, currentRoom.guestSocketId ?? '', seriesWinnerForDup === 'guest', seriesWinnerForDup === 'draw', currentRoom.guestJCGames, false)
            saveGameRecords(currentRoom, seriesWinnerForDup)
          }
          io.to(code).emit('series-complete', { room: currentRoom, seriesWinner: seriesWinnerForDup })
          scheduleRoomCleanup(code, io)
        } else {
          io.to(code).emit('game-result', { room: currentRoom, result })
          scheduleRoomCleanup(code, io)
        }
        return
      }
      startPickTimer(io, currentRoom)
      return
    }

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
        if (currentRoom.hostUserId) updateStatsAndUnlock(io, currentRoom.hostUserId, currentRoom.hostSocketId, winner === 'host', false, currentRoom.hostJCGames, true)
        if (currentRoom.guestUserId) updateStatsAndUnlock(io, currentRoom.guestUserId, currentRoom.guestSocketId ?? '', winner === 'guest', false, currentRoom.guestJCGames, false)
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
          if (currentRoom.guestUserId) updateStatsAndUnlock(io, currentRoom.guestUserId, currentRoom.guestSocketId ?? '', seriesWinner === 'guest', seriesWinner === 'draw', currentRoom.guestJCGames, false)
          saveGameRecords(currentRoom, seriesWinner)
        }
        io.to(code).emit('series-complete', { room: currentRoom, seriesWinner })
        scheduleRoomCleanup(code, io)
      } else {
        io.to(code).emit('game-result', { room: currentRoom, result })
        // Schedule a cleanup so the room doesn't leak if both players abandon the
        // result screen without a clean disconnect (e.g. browser crash, NAT timeout).
        // next-game cancels this timer when the host proceeds to the next draft.
        scheduleRoomCleanup(code, io)
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
    createdAt: Date.now(),
    gameRecordsSaved: false,
    hostReconnectToken: crypto.randomBytes(16).toString('hex'),
    guestReconnectToken: crypto.randomBytes(16).toString('hex'),
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
  // Issue reconnect tokens point-to-point after the broadcast so both players
  // receive draft-started before their individual token.
  hostSocket?.emit('room-token', { code, role: 'host', token: room.hostReconnectToken })
  guestSocket?.emit('room-token', { code, role: 'guest', token: room.guestReconnectToken })
  startPickTimer(io, room)
}

// ─── Auction helpers ──────────────────────────────────────────────────────────

function buildAuctionStateForSocket(room: AuctionRoom, recipientSocketId?: string) {
  // Trade offers are private: only deliver offers that involve the recipient.
  // Broadcasting all offers would let participant C read negotiations between A and B,
  // revealing which players others are trying to acquire or give up.
  const visibleTradeOffers = recipientSocketId
    ? room.tradeOffers.filter(o => o.fromSocketId === recipientSocketId || o.toSocketId === recipientSocketId)
    : room.tradeOffers
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
    nominatorSocketId: room.nominatorSocketId,
    bidDeadline: room.bidDeadline,
    tradeOffers: visibleTradeOffers,
    tradeDeadline: room.tradeDeadline,
    playerIndex: room.currentPlayerIndex,
    poolSize: room.playerPool.length,
    bidLog: room.bidLog.slice(-25),
    finalResults: room.finalResults ?? null,
  }
}

function broadcastAuctionState(io: SocketServer, room: AuctionRoom) {
  for (const p of room.participants) {
    // Skip participants whose socket is no longer connected — io.to().emit() is a
    // no-op for unknown socket IDs, but buildAuctionStateForSocket still runs
    // filter/map work over the player pool and roster for every disconnected slot.
    if (!io.sockets.sockets.has(p.socketId)) continue
    // Build a per-recipient state so trade offers are filtered to only those
    // involving this participant — prevents information leakage in multi-player auctions.
    const state = buildAuctionStateForSocket(room, p.socketId)
    io.to(p.socketId).emit('auction:state', state)
  }
}

// Tracks how many bidding rounds have started so we can derive the nominator
// index (nominatorRound % participants.length) without a separate counter field.
const auctionRoundCounter = new Map<string, number>()

function advanceAuction(io: SocketServer, room: AuctionRoom) {
  // Guard: if the room has already finished or moved to the trade phase, do not
  // advance again.  A steal-window timer or bid-expiry timer that fires slightly
  // after the host manually ended the auction (or after finishAuction ran) must not
  // push new bidding state to a completed/trading room.
  if (room.status === 'complete' || room.status === 'trading') return
  // Guard: if all participants have disconnected by the time this callback fires
  // (e.g. the steal-window timer fires after the disconnect handler already ran
  // clearTimeout — which is a no-op if the timer had already queued), bail out and
  // clean up.  Without this check a post-steal advanceAuction would call
  // startAuctionTradePhase → finishAuction, writing DB results for a dead room and
  // leaving a 30-min cleanupTimer referencing an orphaned room object that was
  // already removed from auctionRooms by the disconnect handler.
  const allGone = room.participants.every(p => !io.sockets.sockets.has(p.socketId))
  if (allGone) {
    if (room.bidTimer) clearTimeout(room.bidTimer)
    if (room.tradeTimer) clearTimeout(room.tradeTimer)
    if (auctionRooms.get(room.code) === room) {
      auctionRooms.delete(room.code)
      auctionRoundCounter.delete(room.code)
    }
    return
  }
  const wonIds = new Set(room.participants.flatMap(p => p.roster))
  room.currentPlayerIndex++
  while (room.currentPlayerIndex < room.playerPool.length) {
    const candidate = room.playerPool[room.currentPlayerIndex]
    if (!wonIds.has(candidate.id)) {
      // A participant "needs more" players only if they have empty roster slots AND
      // can legally bid on the next player under the $1/slot rule.  The minimum
      // legal bid is $1, and after winning this player they must still have $1 for
      // each remaining slot.  So the minimum budget needed to participate in this
      // round is: 1 (bid) + (teamSize - roster.length - 1) (future slots) =
      // teamSize - roster.length.  Using `budget >= 1` alone would include
      // participants who can never legally bid (e.g. budget=$1 with 2 empty slots
      // → maxBid=0), stalling each round until the 25-second timer expires.
      const needsMore = room.participants.some(
        p => p.roster.length < room.teamSize && p.budget >= room.teamSize - p.roster.length
      )
      if (!needsMore) break
      room.currentPlayer = candidate
      room.currentBid = 0
      room.currentBidderSocketId = null
      room.currentBidderName = null
      room.lastWinnerSocketId = null
      room.lastWinnerName = null
      room.lastWonPlayerId = null
      room.stealInitiated = false
      // Assign the nominator for this round using a round-robin through participants,
      // skipping any whose socket has disconnected.  Without this, a disconnected
      // participant would be appointed nominator and nobody could pass — the round
      // would silently wait the full 25-second BID_TIMER before auto-expiring.
      const round = (auctionRoundCounter.get(room.code) ?? 0) + 1
      auctionRoundCounter.set(room.code, round)
      const connectedParticipants = room.participants.filter(p => io.sockets.sockets.has(p.socketId))
      if (connectedParticipants.length > 0) {
        room.nominatorSocketId = connectedParticipants[round % connectedParticipants.length].socketId
      } else {
        // All participants are disconnected — no nominator can act; set null so the
        // timer will auto-expire the round without blocking on a specific socket.
        room.nominatorSocketId = null
      }
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
  // Clear the handle immediately — the timer has fired so the reference is stale.
  // Any subsequent clearTimeout(room.bidTimer) calls (e.g. in auction:pass or
  // finishAuction) would otherwise operate on a dangling handle that has no effect
  // but could mask logic errors in paths that check `if (room.bidTimer)`.
  room.bidTimer = null
  // Guard: only execute if we're still in bidding or steal-window phase.
  // This prevents double-advancement if the timer fires after an explicit pass.
  if (room.status !== 'bidding' && room.status !== 'steal-window') return
  // Guard: if the timer fires after all participants have disconnected (a race between
  // the timer callback and the disconnect handler's clearTimeout), bail out and clean up.
  // The disconnect handler may have already deleted the room from auctionRooms but the
  // local `room` reference is still alive — processing it would write corrupt DB results
  // for a game that nobody is watching.
  const allGone = room.participants.every(p => !io.sockets.sockets.has(p.socketId))
  if (allGone) {
    // room.bidTimer is already null (set above); tradeTimer may still be live.
    if (room.tradeTimer) clearTimeout(room.tradeTimer)
    // Identity guard: only delete if this exact room object is still registered —
    // a very fast code reuse within BID_TIMER_MS could register a new room at the
    // same code before this callback fires.
    if (auctionRooms.get(room.code) === room) {
      auctionRooms.delete(room.code)
      auctionRoundCounter.delete(room.code)
    }
    return
  }

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
  // room.bidTimer was already set to null at the top of this function; no clearTimeout needed.
  room.bidTimer = setTimeout(() => advanceAuction(io, room), STEAL_WINDOW_MS)
  broadcastAuctionState(io, room)
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
  // Idempotency guard: prevent double-finalisation if both the tradeTimer fires and
  // the host emits auction:finish-trading within the same event loop cycle.
  // Without this guard auction:complete would be emitted twice to every participant,
  // which could cause the results screen to flash or duplicate DB writes in future.
  if (room.status === 'complete') return
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

  // Persist results to the DB so they survive a server restart within the 30-min
  // review window.  We use upsert (keyed on the unique room code) so a double-call
  // (idempotency guard above prevents this in normal operation, but belt-and-suspenders)
  // never creates duplicate rows.  Fire-and-forget: a write failure should not crash
  // the server or block the client response that has already been emitted above.
  prisma.auctionRecord.upsert({
    where: { code: room.code },
    create: {
      code: room.code,
      teamSize: room.teamSize,
      totalBudget: room.totalBudget,
      results: JSON.stringify(results),
    },
    update: {
      results: JSON.stringify(results),
    },
  }).catch(err => console.error('[auction] Failed to persist results for room=%s: %o', room.code, err))

  // Store the handle so it can be cancelled if all participants disconnect while
  // the room is still in the 'complete' / review-window state, preventing the
  // room object from staying in memory for the full 30-minute cleanup window
  // after nobody remains to view the results.
  room.cleanupTimer = setTimeout(() => {
    room.cleanupTimer = null
    // Guard: only delete if this exact room object is still registered under this
    // code.  A new room could theoretically reuse the same code within the
    // AUCTION_CLEANUP_MS window; deleting it here would silently destroy an active game.
    if (auctionRooms.get(room.code) === room) {
      auctionRooms.delete(room.code)
      auctionRoundCounter.delete(room.code)
    }
  }, AUCTION_CLEANUP_MS)
}

// ─── Server ──────────────────────────────────────────────────────────────────

app.prepare().then(async () => {
  // Load players from DB — retry up to 3 times (5 s apart) before giving up.
  // Railway cold-starts can leave Postgres briefly unreachable for a few seconds.
  const playerSelect = {
    id: true, firstName: true, lastName: true, team: true,
    position: true, positions: true, careerGames: true,
    careerPPG: true, careerRPG: true, careerAPG: true, careerMPG: true,
    ebkScore: true,
    ebkGpScore: true, ebkPpgScore: true, ebkRpgScore: true,
    ebkApgScore: true, ebkMpgScore: true,
    yearFrom: true, yearTo: true, careerEarnings: true,
  } as const

  const DB_CONNECT_ATTEMPTS = 3
  const DB_CONNECT_DELAY_MS = 5_000
  let lastDbErr: unknown
  for (let attempt = 1; attempt <= DB_CONNECT_ATTEMPTS; attempt++) {
    try {
      allPlayers = await prisma.player.findMany({ select: playerSelect })
      lastDbErr = undefined
      break
    } catch (err) {
      lastDbErr = err
      console.error(`[server] DB load attempt ${attempt}/${DB_CONNECT_ATTEMPTS} failed:`, err)
      if (attempt < DB_CONNECT_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, DB_CONNECT_DELAY_MS))
      }
    }
  }
  if (lastDbErr) {
    console.error('[server] Could not load players from DB after all retries — exiting')
    await prisma.$disconnect().catch(() => {})
    process.exit(1)
  }

  // Recompute ebkScore from raw component scores to fix any double-penalty corruption
  // (scrape-popularity.ts running multiple times could floor scores to 0 by reading
  // the already-penalized ebkScore as the baseline on each subsequent run).
  function recomputeEbkScores(players: PlayerData[]): void {
    let fixed = 0
    for (const p of players) {
      const hasComponents = p.ebkGpScore > 0 || p.ebkPpgScore > 0 || p.ebkMpgScore > 0
      if (p.ebkScore === 0 && hasComponents) {
        p.ebkScore = parseFloat(
          (p.ebkGpScore * 0.20 + p.ebkPpgScore * 0.25 + p.ebkMpgScore * 0.20
           + p.ebkRpgScore * 0.18 + p.ebkApgScore * 0.17).toFixed(1)
        )
        fixed++
      }
    }
    if (fixed > 0) console.log(`[server] Recomputed ebkScore for ${fixed} players with corrupted 0 scores.`)
  }

  recomputeEbkScores(allPlayers)
  // playerById keeps ALL rows (multi-team stints) so any id the client sends resolves.
  playerById = new Map(allPlayers.map(p => [p.id, p]))
  // allPlayers is the draft/auction pool — deduplicated to one row per real player so
  // no player (e.g. Jimmy Butler CHI/MIN/PHI/MIA) can appear or be drafted multiple times.
  allPlayers = deduplicatePlayers(allPlayers)
  refreshJCId()
  console.log(`Loaded ${playerById.size} player rows from DB (${allPlayers.length} unique players after dedup)`)

  // Refresh player data periodically (scrape-bbref runs in background after startup)
  // Use 5-min interval — scrape takes ~10 min, so this picks up new players quickly
  setInterval(async () => {
    try {
      const fresh = await prisma.player.findMany({ select: playerSelect })
      recomputeEbkScores(fresh)
      // playerById keeps ALL rows; allPlayers is deduplicated for the draft/auction pool.
      const freshDeduped = deduplicatePlayers(fresh)
      if (freshDeduped.length !== allPlayers.length) {
        console.log(`Player data refreshed: ${allPlayers.length} → ${freshDeduped.length} unique players (${fresh.length} raw rows)`)
      }
      playerById = new Map(fresh.map(p => [p.id, p]))
      allPlayers = freshDeduped
      refreshJCId()
    } catch (e) {
      console.error('Failed to refresh player data:', e)
    }
  }, PLAYER_REFRESH_MS)

  // Prune stale cooldown and grudge-count entries every hour to prevent unbounded growth.
  // recentMatchups: entries expire after the cooldown window (30 min).
  // matchupCount: grudge counts are only meaningful while the pair is still within cooldown,
  //   because once the cooldown clears the pair can rematch and the count will resume from
  //   where it left off anyway. Pruning entries that no longer have a live cooldown entry
  //   bounds the map to at most the number of currently-cooling-down user pairs.
  setInterval(async () => {
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
    // Prune expired userCreateThrottle entries to prevent unbounded growth.
    // Entries whose window has expired are no longer actionable.
    for (const [userId, entry] of userCreateThrottle.entries()) {
      if (now - entry.windowStart >= USER_CREATE_THROTTLE_WINDOW_MS) {
        userCreateThrottle.delete(userId)
      }
    }
    // Prune AuctionRecord rows older than 48 h from the DB.  The schema comment
    // says rows "can be pruned after 48 h" but nothing ever enforced that — old
    // rows would accumulate forever and stale codes would remain resolvable for
    // the lifetime of the DB.  Running this alongside the existing hourly sweep
    // keeps the table small without adding a separate cron job.
    try {
      const cutoff48h = new Date(now - 48 * 60 * 60 * 1000)
      await prisma.auctionRecord.deleteMany({ where: { completedAt: { lt: cutoff48h } } })
    } catch (err) {
      console.error('[auction] Failed to prune stale AuctionRecord rows:', err)
    }
  }, COOLDOWN_PRUNE_MS)

  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true)

    // ─── Health check (Railway zero-downtime deploys) ─────────────────────────
    if (req.method === 'GET' && parsedUrl.pathname === '/health') {
      const body = JSON.stringify({ status: 'ok', uptime: process.uptime() })
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) })
      res.end(body)
      return
    }

    // ─── Request logging ──────────────────────────────────────────────────────
    const reqStart = Date.now()
    res.on('finish', () => {
      const ms = Date.now() - reqStart
      console.log('[http] %s %s → %d in %dms', req.method, parsedUrl.pathname, res.statusCode, ms)
    })

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
    // Limit per-message size to 10 KB (default is 1 MB).
    // Prevents a malicious client from flooding memory with a single oversized frame.
    maxHttpBufferSize: MAX_HTTP_BUFFER_BYTES,
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
  }, METRICS_HEARTBEAT_MS)

  // ─── Memory usage logging (every 5 min, only when heap > 200 MB) ─────────────
  setInterval(() => {
    const { heapUsed, heapTotal } = process.memoryUsage()
    const usedMB = heapUsed / 1024 / 1024
    if (usedMB > 200) {
      console.warn('[memory] heap_used=%.1fMB heap_total=%.1fMB', usedMB, heapTotal / 1024 / 1024)
    }
  }, 5 * 60 * 1000)

  // ─── Stale pre-game room sweep (every 5 min) ─────────────────────────────────
  // A 'waiting' draft room or 'waiting' auction room can leak indefinitely when the
  // host's socket stays connected but no guest ever joins (e.g. the host opens the
  // share-link screen and walks away without closing the tab).  The disconnect handler
  // cleans up rooms when the host disconnects, but that never fires for a live-but-idle
  // socket.  This sweep deletes any room that has been in a pre-game state for longer
  // than STALE_WAITING_ROOM_MS (30 min) regardless of socket liveness.
  //
  // Additionally, 'drafting' and 'result' rooms where BOTH player sockets are gone and
  // no cleanup timer is pending are force-evicted.  Under normal operation
  // scheduleRoomCleanup handles these, but this sweep is a safety net for any edge case
  // (timer lost, state machine bug) where the cleanup timer was never armed.
  setInterval(() => {
    const now = Date.now()
    const cutoff = now - STALE_WAITING_ROOM_MS

    for (const [code, room] of rooms.entries()) {
      if (room.status === 'waiting' && room.createdAt < cutoff) {
        // Cancel any pending cleanup timer so scheduleRoomCleanup doesn't double-fire
        const existing = roomCleanupTimers.get(code)
        if (existing) { clearTimeout(existing); roomCleanupTimers.delete(code) }
        // Cancel the pick timer if one is running — waiting rooms normally have none,
        // but clear defensively so the callback never fires on a deleted room object.
        const pt = pickTimers.get(code)
        if (pt) { clearTimeout(pt); pickTimers.delete(code) }
        else pickTimers.delete(code)
        // Cancel any stale forfeit grace timer (shouldn't exist for waiting rooms, but defensive).
        const pdt = partnerDisconnectTimers.get(code)
        if (pdt) { clearTimeout(pdt); partnerDisconnectTimers.delete(code) }
        rooms.delete(code)
        pickTimerStartedAt.delete(code)
        consecutiveTimeouts.delete(code)
        io.in(code).socketsLeave(code)
        console.log('[room] stale-sweep evicted waiting room code=%s age_min=%d game_rooms=%d',
          code, Math.round((now - room.createdAt) / 60_000), rooms.size)
        continue
      }

      // Safety-net: evict 'drafting' or 'result' rooms that are older than the stale
      // threshold, have no connected players, and have no pending cleanup timer.
      // This catches the rare edge case where scheduleRoomCleanup was never called
      // (e.g. a state-machine bug or timer loss) and the room would otherwise live
      // in memory indefinitely.
      if (
        (room.status === 'drafting' || room.status === 'result') &&
        room.createdAt < cutoff &&
        !roomCleanupTimers.has(code)
      ) {
        const hostConnected  = io.sockets.sockets.has(room.hostSocketId)
        const guestConnected = room.guestSocketId ? io.sockets.sockets.has(room.guestSocketId) : false
        if (!hostConnected && !guestConnected) {
          const pt = pickTimers.get(code)
          if (pt) { clearTimeout(pt); pickTimers.delete(code) }
          else pickTimers.delete(code)
          const pdt = partnerDisconnectTimers.get(code)
          if (pdt) { clearTimeout(pdt); partnerDisconnectTimers.delete(code) }
          rooms.delete(code)
          pickTimerStartedAt.delete(code)
          consecutiveTimeouts.delete(code)
          io.in(code).socketsLeave(code)
          console.log('[room] stale-sweep evicted abandoned %s room code=%s age_min=%d game_rooms=%d',
            room.status, code, Math.round((now - room.createdAt) / 60_000), rooms.size)
        }
      }
    }

    for (const [code, room] of auctionRooms.entries()) {
      if (room.status === 'waiting' && room.createdAt < cutoff) {
        if (room.bidTimer) clearTimeout(room.bidTimer)
        if (room.cleanupTimer) { clearTimeout(room.cleanupTimer); room.cleanupTimer = null }
        auctionRooms.delete(code)
        auctionRoundCounter.delete(code)
        io.in(`auction:${code}`).socketsLeave(`auction:${code}`)
        console.log('[auction] stale-sweep evicted waiting room code=%s age_min=%d auction_rooms=%d',
          code, Math.round((now - room.createdAt) / 60_000), auctionRooms.size)
        continue
      }

      // Safety-net: evict active auction rooms (bidding/trading/steal-window) older than the
      // stale threshold where ALL participants have disconnected and no cleanup timer is pending.
      if (
        room.status !== 'complete' &&
        room.createdAt < cutoff &&
        room.cleanupTimer === null
      ) {
        const allGone = room.participants.every(p => !io.sockets.sockets.has(p.socketId))
        if (allGone) {
          if (room.bidTimer) { clearTimeout(room.bidTimer); room.bidTimer = null }
          if (room.tradeTimer) { clearTimeout(room.tradeTimer); room.tradeTimer = null }
          auctionRooms.delete(code)
          auctionRoundCounter.delete(code)
          io.in(`auction:${code}`).socketsLeave(`auction:${code}`)
          console.log('[auction] stale-sweep evicted abandoned %s room code=%s age_min=%d auction_rooms=%d',
            room.status, code, Math.round((now - room.createdAt) / 60_000), auctionRooms.size)
        }
      }
    }
  }, STALE_ROOM_SWEEP_MS)

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

    // Close the Socket.IO server: stops new connections and sends a disconnect
    // packet to every connected socket so clients know to reconnect elsewhere.
    // Without this call, existing WebSockets stay open indefinitely and the
    // disconnect handlers that drain rooms never fire.
    io.close(() => {
      console.log('[server] Socket.IO server closed')
    })

    // Give active rooms up to 10 s to reach a terminal state, then force exit
    const forceExitTimer = setTimeout(async () => {
      console.warn('[server] Graceful shutdown timed out — forcing exit')
      await prisma.$disconnect().catch(() => {})
      process.exit(0)
    }, 10_000)
    // Don't let this timer keep the event loop alive if rooms finish sooner
    forceExitTimer.unref()

    // Poll until all active (non-complete) rooms are gone or the timer fires.
    // Completed auction rooms intentionally stay in auctionRooms for AUCTION_CLEANUP_MS
    // (30 min) so players can review results — exclude them from the drain check or the
    // server would never drain cleanly after any auction has finished.
    const pollInterval = setInterval(async () => {
      const activeAuctions = [...auctionRooms.values()].filter(r => r.status !== 'complete').length
      if (rooms.size === 0 && activeAuctions === 0) {
        clearInterval(pollInterval)
        clearTimeout(forceExitTimer)
        console.log('[server] All rooms drained — exiting cleanly')
        await prisma.$disconnect().catch(() => {})
        process.exit(0)
      }
    }, 500)
  })

  // ─── Graceful SIGINT (Ctrl+C in dev / some container runtimes) ───────────────
  // Mirrors the SIGTERM handler so that a clean shutdown happens regardless of
  // which signal is sent.  Prisma is disconnected before exit in both paths.
  process.on('SIGINT', () => {
    console.log('[server] SIGINT received — starting graceful shutdown')
    httpServer.close(() => {
      console.log('[server] HTTP server closed')
    })
    io.close(() => {
      console.log('[server] Socket.IO server closed')
    })
    const forceExitTimer = setTimeout(async () => {
      console.warn('[server] Graceful shutdown timed out — forcing exit')
      await prisma.$disconnect().catch(() => {})
      process.exit(0)
    }, 10_000)
    forceExitTimer.unref()
    const pollInterval = setInterval(async () => {
      const activeAuctions = [...auctionRooms.values()].filter(r => r.status !== 'complete').length
      if (rooms.size === 0 && activeAuctions === 0) {
        clearInterval(pollInterval)
        clearTimeout(forceExitTimer)
        console.log('[server] All rooms drained — exiting cleanly')
        await prisma.$disconnect().catch(() => {})
        process.exit(0)
      }
    }, 500)
  })

  // ─── IP-level connection rate limiter ───────────────────────────────────────
  // Without this, a single attacker IP can open thousands of WebSocket
  // connections before emitting any event, exhausting Node.js heap on Railway's
  // 512 MB container.  We allow up to 20 concurrent connections per IP and
  // reject the 21st with a transport error — legitimate users never need more
  // than a handful of tabs open simultaneously.
  const connectionsPerIp = new Map<string, number>()
  // Normalize an IP string so that IPv4-mapped IPv6 addresses (::ffff:1.2.3.4)
  // produced by Node's dual-stack listener are treated identically to the plain
  // IPv4 string that a reverse proxy would put in x-forwarded-for.
  function normalizeIp(raw: string): string {
    return raw.startsWith('::ffff:') ? raw.slice(7) : raw
  }
  io.use((socket, next) => {
    const raw: string =
      (socket.handshake.headers['x-forwarded-for'] as string | undefined)
        ?.split(',')[0]
        .trim() ??
      socket.handshake.address ??
      'unknown'
    const ip = normalizeIp(raw)
    const current = connectionsPerIp.get(ip) ?? 0
    if (current >= 20) {
      // Do not log the raw IP — Railway logs are retained and IPs are PII.
      console.warn('[socket] Connection rejected — too many connections from single IP (address withheld)')
      return next(new Error('Too many connections from this IP'))
    }
    connectionsPerIp.set(ip, current + 1)
    socket.on('disconnect', () => {
      const remaining = (connectionsPerIp.get(ip) ?? 1) - 1
      if (remaining <= 0) connectionsPerIp.delete(ip)
      else connectionsPerIp.set(ip, remaining)
    })
    next()
  })

  // Verify JWT from httpOnly cookie on every connection — no client changes needed.
  // tokenVersion is stored on socket.data so that sensitive game-join handlers can
  // re-verify the version against the DB when the user claims an authenticated slot,
  // catching the case where a password change happened after the socket connected.
  io.use(async (socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie || ''
    const match = cookieHeader.match(/(?:^|;\s*)ebk-token=([^;]+)/)
    const token = match ? decodeURIComponent(match[1]) : null
    let payload: Awaited<ReturnType<typeof verifyToken>> | null = null
    try {
      payload = token ? await verifyToken(token) : null
    } catch (err) {
      // verifyToken threw (e.g. malformed JWT, crypto error) — treat as unauthenticated
      // rather than hanging the handshake by never calling next().
      console.error('[socket] verifyToken threw during handshake — treating as anonymous:', err)
    }
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

    // Periodically re-validate the session for authenticated sockets.
    // The handshake middleware only runs once at connect time, so a logout or
    // password change that increments tokenVersion would otherwise leave the
    // socket open indefinitely.  We check the DB tokenVersion every 60 seconds
    // for authenticated connections and disconnect the socket if the session
    // has been invalidated, ensuring the user cannot continue playing after
    // logging out.  Anonymous sockets (userId === null) are skipped.
    // NOTE: reduced from 5 minutes to 60 seconds to close the forced-logout
    // window — a force-logged-out user should not be able to keep drafting or
    // bidding for more than ~1 minute after their tokenVersion is bumped.
    const SESSION_RECHECK_MS = 60 * 1000
    const sessionRecheckInterval = setInterval(async () => {
      const userId = socket.data.userId as string | null
      if (!userId) return
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { tokenVersion: true },
        })
        if (!user || user.tokenVersion !== (socket.data.tokenVersion as number | null)) {
          socket.emit('session-expired')
          socket.disconnect(true)
        }
      } catch {
        // Non-fatal — skip this cycle rather than disconnecting on a transient DB error
      }
    }, SESSION_RECHECK_MS)
    socket.on('disconnect', () => clearInterval(sessionRecheckInterval))

    socket.on('create-room', ({ teamMode, series, difficulty, statCategory, userName }: {
      teamMode: TeamMode, series: SeriesLength, difficulty: Difficulty, statCategory?: StatCategory, userName: string
    }) => {
      // Rate limit: max 5 room creations per minute per socket to prevent memory-exhaustion spam
      const crNow0 = Date.now()
      const crThrottle0 = createRoomThrottle.get(socket.id)
      if (crThrottle0 && crNow0 - crThrottle0.windowStart < THROTTLE_WINDOW_MS) {
        if (crThrottle0.count >= CREATE_THROTTLE_MAX) { socket.emit('room-error', { message: 'Too many rooms created. Please wait a moment.' }); return }
        crThrottle0.count++
      } else { createRoomThrottle.set(socket.id, { count: 1, windowStart: crNow0 }) }

      if (!['starter5', 'bench8', 'full12'].includes(teamMode)) { socket.emit('room-error', { message: 'Invalid team mode' }); return }
      if (![1, 3, 5].includes(series)) { socket.emit('room-error', { message: 'Invalid series length' }); return }
      if (!['casual', 'ebk'].includes(difficulty)) { socket.emit('room-error', { message: 'Invalid difficulty' }); return }
      if (allPlayers.length === 0) { socket.emit('room-error', { message: 'Server is still loading player data. Please try again in a minute.' }); return }
      // Prefer the server-verified JWT username; fall back to sanitized, profanity-filtered
      // client name for anonymous players.
      const userId = socket.data.userId as string | null
      userName = resolveDisplayName(socket.data.username as string | null, userName)
      // Per-userId creation throttle: prevents authenticated users from bypassing the
      // per-socket throttle by rapidly disconnecting and reconnecting (each reconnect gets
      // a new socket.id, resetting the per-socket counter).
      if (userId) {
        const uctNow = Date.now()
        const uctEntry = userCreateThrottle.get(userId)
        if (uctEntry && uctNow - uctEntry.windowStart < USER_CREATE_THROTTLE_WINDOW_MS) {
          if (uctEntry.count >= USER_CREATE_THROTTLE_MAX) { socket.emit('room-error', { message: 'Too many rooms created. Please wait a moment.' }); return }
          uctEntry.count++
        } else { userCreateThrottle.set(userId, { count: 1, windowStart: uctNow }) }
      }
      let code = generateCode()
      let codeAttempts = 0
      while (rooms.has(code) || readyRooms.has(code) || gameListings.has(code) || auctionRooms.has(code)) {
        if (++codeAttempts >= 10) {
          socket.emit('room-error', { message: 'Unable to create room. Please try again.' })
          return
        }
        code = generateCode()
      }

      const resolvedStatCategory: StatCategory = (statCategory && VALID_STAT_CATEGORIES.includes(statCategory)) ? statCategory : 'games_played'

      const teamSize = TEAM_SIZES[teamMode]
      const hostReconnectToken = crypto.randomBytes(16).toString('hex')
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
        createdAt: Date.now(),
        gameRecordsSaved: false,
        hostReconnectToken,
        guestReconnectToken: crypto.randomBytes(16).toString('hex'),
      }
      rooms.set(code, room)
      socket.join(code)
      console.log('[room] created source=friends code=%s host=%s mode=%s series=%d game_rooms=%d',
        code, redactName(room.hostName), room.teamMode, room.series, rooms.size)
      socket.emit('room-created', { room, players: allPlayers })
      // Send the host their reconnect token separately so the client can persist it
      // across socket reconnects.  The token is never broadcast to the room channel.
      socket.emit('room-token', { code, role: 'host', token: hostReconnectToken })
    })

    socket.on('join-room', ({ code, userName }: {
      code: string, userName: string
    }) => {
      // Runtime type guards — reject non-string fields before any string operations
      if (typeof code !== 'string') return
      // Rate limit: max 10 join-room attempts per minute per socket to prevent brute-force
      const jrNow = Date.now()
      const jrThrottle = joinRoomThrottle.get(socket.id)
      if (jrThrottle && jrNow - jrThrottle.windowStart < THROTTLE_WINDOW_MS) {
        if (jrThrottle.count >= JOIN_THROTTLE_MAX) {
          socket.emit('room-error', { message: 'Too many join attempts. Please wait a moment.' })
          return
        }
        jrThrottle.count++
      } else {
        joinRoomThrottle.set(socket.id, { count: 1, windowStart: jrNow })
      }

      // Prefer the server-verified JWT username; fall back to sanitized, profanity-filtered
      // client name for anonymous players.
      const userId = socket.data.userId as string | null
      userName = resolveDisplayName(socket.data.username as string | null, userName)
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
      // Guard: reject join if the host socket has already disconnected.  The room
      // stays in the Map for ROOM_CLEANUP_GRACE_MS (60 s) after the host leaves, so
      // without this check a guest could start a draft against a dead host socket —
      // picks would auto-fire through the timer, the host would time out twice, and
      // the guest would receive a disqualification "win" against a phantom opponent.
      if (!io.sockets.sockets.has(room.hostSocketId)) {
        socket.emit('room-error', { message: 'Room is no longer available' }); return
      }

      room.guestSocketId = socket.id
      room.guestUserId = userId
      room.guestName = userName
      room.status = 'drafting'
      room.guestReconnectToken = crypto.randomBytes(16).toString('hex')
      consecutiveTimeouts.set(code.toUpperCase(), { host: 0, guest: 0 })

      socket.join(code.toUpperCase())
      io.to(code.toUpperCase()).emit('draft-started', { room, players: allPlayers })
      // Issue the guest their reconnect token.  Must be emitted after joining the
      // Socket.IO room channel so that the host's draft-started handler fires first
      // (draft-started is a broadcast; room-token is point-to-point to the guest).
      socket.emit('room-token', { code: code.toUpperCase(), role: 'guest', token: room.guestReconnectToken })
      startPickTimer(io, room)
    })

    socket.on('pick-player', ({ code, playerId, slotPos }: { code: string, playerId: number, slotPos: string }) => {
      // Runtime type guards — validate before any Map lookups
      if (typeof code !== 'string' || typeof slotPos !== 'string') return
      if (typeof playerId !== 'number' || !Number.isInteger(playerId) || playerId <= 0) return
      // Rate limit: max 10 picks per 5 seconds per socket.
      // Each pick emits room-updated / game-result / series-complete to both clients;
      // unthrottled spam causes redundant broadcasts even when idempotency guards reject the pick.
      const ppNow = Date.now()
      const ppThrottle = pickThrottle.get(socket.id)
      if (ppThrottle && ppNow - ppThrottle.windowStart < PICK_THROTTLE_WINDOW_MS) {
        if (ppThrottle.count >= PICK_THROTTLE_MAX) { socket.emit('pick-error', { message: 'Too many pick requests. Please slow down.' }); return }
        ppThrottle.count++
      } else { pickThrottle.set(socket.id, { count: 1, windowStart: ppNow }) }
      const room = rooms.get(code.trim().toUpperCase())
      if (!room || room.status !== 'drafting') return

      const currentPicker = room.draftOrder[room.currentPickIndex]
      const isHost = socket.id === room.hostSocketId
      const isGuest = socket.id === room.guestSocketId

      // Defense-in-depth: for authenticated rooms, also verify that this socket's
      // userId matches the stored hostUserId / guestUserId.  The primary guard is
      // the socket.id check above (kept authoritative by get-room), but adding the
      // userId check prevents any future code-path that mis-routes a socket.id from
      // being exploited — a mismatch here is always an anomaly and should be rejected.
      const pickUserId = socket.data.userId as string | null
      if (pickUserId) {
        if (isHost && room.hostUserId && pickUserId !== room.hostUserId) return
        if (isGuest && room.guestUserId && pickUserId !== room.guestUserId) return
      }

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
            if (room.guestUserId) updateStatsAndUnlock(io, room.guestUserId, room.guestSocketId ?? '', seriesWinner === 'guest', seriesWinner === 'draw', room.guestJCGames, false)
            saveGameRecords(room, seriesWinner)
          }
          io.to(roomCode).emit('series-complete', { room, seriesWinner })
          scheduleRoomCleanup(roomCode, io)
        } else {
          io.to(roomCode).emit('game-result', { room, result })
          // Schedule a cleanup so the room doesn't leak if both players abandon the
          // result screen without a clean disconnect (e.g. browser crash, NAT timeout).
          // next-game cancels this timer when the host proceeds to the next draft.
          scheduleRoomCleanup(roomCode, io)
        }
      } else {
        io.to(roomCode).emit('room-updated', { room })
        startPickTimer(io, room)
      }
    })

    socket.on('next-game', ({ code }: { code: string }) => {
      if (typeof code !== 'string') return
      // Rate limit: max 3 requests per 5 seconds per socket.
      // Each call can emit draft-started + the full allPlayers list to both clients.
      const ngNow = Date.now()
      const ngThrottle = nextGameThrottle.get(socket.id)
      if (ngThrottle && ngNow - ngThrottle.windowStart < NEXT_GAME_THROTTLE_WINDOW_MS) {
        if (ngThrottle.count >= NEXT_GAME_THROTTLE_MAX) return // silently drop
        ngThrottle.count++
      } else { nextGameThrottle.set(socket.id, { count: 1, windowStart: ngNow }) }
      const room = rooms.get(code.trim().toUpperCase())
      if (!room || room.status !== 'result') return
      if (socket.id !== room.hostSocketId) return // only host can start next game
      // Defense-in-depth: for authenticated hosts, also verify the userId matches
      // the stored hostUserId — a socket.id match alone could be spoofed if the
      // room.hostSocketId were ever set incorrectly by a reconnect-path bug.
      const ngUserId = socket.data.userId as string | null
      if (ngUserId && room.hostUserId && ngUserId !== room.hostUserId) return

      const roomCode = room.code

      // If the guest disconnected during the result screen and their 8-second grace
      // period is still running, the host is clicking next-game while the guest may be
      // mid-reconnect.  Do NOT advance yet — honour the full grace window.
      // Emit a wait-hint so the host knows why next-game is deferred rather than being
      // silently stuck on the result screen with no feedback.
      // IMPORTANT: do NOT cancel the cleanup timer here — if the guest then reconnects
      // (cancelling the grace timer) the room must still have a safety-net cleanup timer
      // so it doesn't leak if both players abandon the result screen without disconnecting.
      if (partnerDisconnectTimers.has(roomCode)) {
        socket.emit('next-game-pending', { reason: 'Waiting for opponent to reconnect…' })
        return
      }

      // Cancel the inter-game cleanup timer scheduled when the previous game-result
      // was emitted.  Only cancel it now that we know we're actually proceeding to a
      // new draft — if we returned early above (grace timer pending), the cleanup timer
      // must stay alive as the room's safety net against silent abandonment.
      const cleanupTimer = roomCleanupTimers.get(roomCode)
      if (cleanupTimer) {
        clearTimeout(cleanupTimer)
        roomCleanupTimers.delete(roomCode)
      }

      // Guard: if the guest socket is no longer live (disconnected without a grace timer —
      // e.g. host fires next-game before the server has processed the TCP close event),
      // treat it as a forfeit.  Without this check the draft starts, the guest auto-picks
      // via the pick timer, and when the disconnect event eventually arrives the disconnect
      // handler fires updateStatsAndUnlock again, doubling the stat write for both players.
      if (!room.guestSocketId || !io.sockets.sockets.has(room.guestSocketId)) {
        room.status = 'complete'
        if (room.source === 'online') {
          recordMatchup(room.hostUserId, room.guestUserId)
          const winsNeeded = Math.ceil(room.series / 2)
          room.hostSeriesScore = Math.max(room.hostSeriesScore, winsNeeded)
          if (room.hostUserId) updateStatsAndUnlock(io, room.hostUserId, room.hostSocketId, true, false, room.hostJCGames, true)
          // room.guestSocketId may be null here (that's what triggered this branch).
          // Pass it as an empty string — the socket has disconnected so we only need
          // the DB write inside updateStatsAndUnlock; the io.to() emit will be a no-op.
          if (room.guestUserId) updateStatsAndUnlock(io, room.guestUserId, room.guestSocketId ?? '', false, false, room.guestJCGames, false)
          saveGameRecords(room, 'host')
        }
        socket.emit('partner-disconnected')
        scheduleRoomCleanup(roomCode, io)
        return
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

    socket.on('get-room', ({ code, role, token }: { code: string; role: 'host' | 'guest'; token?: string }) => {
      // Rate limit: max 10 get-room calls per 10 seconds per socket.
      // Each call emits the full allPlayers list; unthrottled spam saturates the socket.
      const grNow = Date.now()
      const grThrottle = getRoomThrottle.get(socket.id)
      if (grThrottle && grNow - grThrottle.windowStart < GET_ROOM_WINDOW_MS) {
        if (grThrottle.count >= GET_ROOM_THROTTLE_MAX) {
          socket.emit('room-error', { message: 'Too many requests. Please wait a moment.' })
          return
        }
        grThrottle.count++
      } else {
        getRoomThrottle.set(socket.id, { count: 1, windowStart: grNow })
      }

      const userId = socket.data.userId as string | null
      // Reject unknown roles before any room lookup — an invalid role would fall
      // through the host/guest branches below without updating any socketId, yet
      // the socket would still join the Socket.IO room channel and receive the
      // full room-state payload (including both players' picks).  This allows any
      // socket that knows a room code to spectate a private game without being a
      // legitimate participant.
      if (role !== 'host' && role !== 'guest') {
        socket.emit('room-error', { message: 'Invalid role' })
        return
      }
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
        // Prevent the guest player from claiming the host slot (role swap).
        // Check by userId (authenticated) or by current socket occupancy (anonymous).
        const callerIsGuest = room.guestUserId
          ? userId === room.guestUserId
          : socket.id === room.guestSocketId
        if (callerIsGuest) {
          console.warn('[room] Role-swap seat-steal attempt (guest→host) code=%s userId=[redacted]', code)
          socket.emit('room-error', { message: 'Unauthorized' })
          return
        }
        const origConnected = io.sockets.sockets.has(room.hostSocketId)
        // For authenticated hosts: require matching userId.
        // For anonymous hosts: require either the same socket ID (same connection)
        // OR a valid reconnect token (proves identity across socket reconnects).
        // The token check closes the simultaneous-disconnect role-swap window: without
        // it, any anonymous socket that knows the room code can claim the host slot
        // once the original host socket is gone, because socket IDs change on reconnect.
        const tokenUsed = !room.hostUserId && !origConnected && typeof token === 'string' && token === room.hostReconnectToken
        const isLegit = room.hostUserId
          ? userId === room.hostUserId
          : socket.id === room.hostSocketId || tokenUsed
        if (!isLegit) {
          console.warn('[room] Unauthorized host takeover attempt code=%s userId=[redacted]', code)
          socket.emit('room-error', { message: 'Unauthorized' })
          return
        }
        room.hostSocketId = socket.id
        // Rotate the reconnect token after a successful anonymous token-based reconnect.
        // Without rotation the old token stays valid indefinitely: an attacker who
        // intercepted or observed the token can wait for the real player to disconnect
        // again and replay it to steal the slot permanently.
        if (tokenUsed) {
          room.hostReconnectToken = crypto.randomBytes(16).toString('hex')
          socket.emit('room-token', { code: room.code, role: 'host', token: room.hostReconnectToken })
        }
      } else if (role === 'guest') {
        // Prevent the host player from claiming the guest slot (role swap).
        const callerIsHost = room.hostUserId
          ? userId === room.hostUserId
          : socket.id === room.hostSocketId
        if (callerIsHost) {
          console.warn('[room] Role-swap seat-steal attempt (host→guest) code=%s userId=[redacted]', code)
          socket.emit('room-error', { message: 'Unauthorized' })
          return
        }
        // get-room is a reconnect handler — a guest slot that was never occupied
        // has no prior socket to reconnect to.  Allowing an empty-slot claim here
        // would let anyone with the room code call get-room(role='guest') before the
        // legitimate guest calls join-room, hijack the guestSocketId, and block the
        // real guest from entering (join-room would see room.guestSocketId set and
        // return "Room is full").  First-time guest entry must go through join-room.
        if (room.guestSocketId === null) {
          console.warn('[room] get-room guest on unoccupied slot (use join-room) code=%s', code)
          socket.emit('room-error', { message: 'Room not found or expired' })
          return
        }
        const origConnected = io.sockets.sockets.has(room.guestSocketId)
        // Same token-based logic as the host path above.
        const guestTokenUsed = !room.guestUserId && !origConnected && typeof token === 'string' && token === room.guestReconnectToken
        const isLegit = room.guestUserId
          ? userId === room.guestUserId
          : socket.id === room.guestSocketId || guestTokenUsed
        if (!isLegit) {
          console.warn('[room] Unauthorized guest takeover attempt code=%s userId=[redacted]', code)
          socket.emit('room-error', { message: 'Unauthorized' })
          return
        }
        room.guestSocketId = socket.id
        // Rotate the reconnect token after a successful anonymous token-based reconnect.
        if (guestTokenUsed) {
          room.guestReconnectToken = crypto.randomBytes(16).toString('hex')
          socket.emit('room-token', { code: room.code, role: 'guest', token: room.guestReconnectToken })
        }
      }

      // If a forfeit grace-period timer was pending for this room (because this
      // player's previous socket disconnected), cancel it — they've reconnected in time.
      // Use room.code (canonical uppercase) — the client-supplied `code` may be mixed-case,
      // causing the Map lookup to miss the timer and the forfeit to fire despite reconnect.
      const pendingForfeit = partnerDisconnectTimers.get(room.code)
      if (pendingForfeit) {
        clearTimeout(pendingForfeit)
        partnerDisconnectTimers.delete(room.code)
        console.log('[room] Reconnect within grace period — forfeit cancelled code=%s', room.code)
      }

      // If the host reconnects to a waiting room (status='waiting'), cancel any pending
      // cleanup timer that was started when the host's previous socket disconnected.
      // Without this, the cleanup timer fires 60 s after the disconnect and deletes the
      // room even though the host is back and waiting for a guest to join.
      if (room.status === 'waiting' && role === 'host') {
        const waitingCleanup = roomCleanupTimers.get(room.code)
        if (waitingCleanup) {
          clearTimeout(waitingCleanup)
          roomCleanupTimers.delete(room.code)
          console.log('[room] Host reconnected to waiting room — cleanup timer cancelled code=%s', room.code)
        }
      }

      // If this is an inter-game result screen and a cleanup timer is already running,
      // reschedule it from now.  Without this, a player who refreshes their browser near
      // the end of the 60-second window reconnects successfully but the cleanup timer still
      // fires a few seconds later — deleting the room before the host can click "next game".
      // The timer is only rescheduled for status='result'; for 'complete' the timer should
      // run to its natural end and the room should not be kept alive indefinitely.
      if (room.status === 'result' && roomCleanupTimers.has(room.code)) {
        scheduleRoomCleanup(room.code, io)
        console.log('[room] Reconnect on result screen — cleanup timer rescheduled code=%s', room.code)
      }

      // Always join using the canonical room code so the socket receives events
      // broadcast via io.to(room.code). A lowercase client-supplied code would
      // place the socket in a different Socket.IO room and miss all draft events.
      socket.join(room.code)
      socket.emit('room-state', { room, players: allPlayers })

      if (room.status === 'drafting') {
        // Re-emit timer with accurate remaining duration so rejoining client syncs
        const currentPicker = room.draftOrder[room.currentPickIndex]
        const startedAt = pickTimerStartedAt.get(room.code) ?? Date.now()
        const elapsed = Math.floor((Date.now() - startedAt) / 1000)
        const remaining = Math.max(2, PICK_TIMER_MS / 1000 - elapsed)
        socket.emit('pick-timer-start', { picker: currentPicker, duration: remaining, spunTeam: room.currentSpunTeam })
      }
    })

    // ── Game Listings (open lobby browser) ───────────────────────────────────

    socket.on('get-listings', () => {
      // Rate limit: max 5 get-listings calls per 5 seconds per socket.
      // Each call re-joins the 'lobby' channel and emits a full listings payload.
      const glNow = Date.now()
      const glThrottle = getListingsThrottle.get(socket.id)
      if (glThrottle && glNow - glThrottle.windowStart < GET_LISTINGS_WINDOW_MS) {
        if (glThrottle.count >= GET_LISTINGS_THROTTLE_MAX) return // silently drop
        glThrottle.count++
      } else {
        getListingsThrottle.set(socket.id, { count: 1, windowStart: glNow })
      }

      // Join the lobby broadcast room so future listings-updated events reach this client
      socket.join('lobby')
      socket.emit('listings-updated', { listings: Array.from(gameListings.values()) })
    })

    socket.on('create-listing', async ({ teamMode, series, statCategory }: {
      userName?: string, teamMode: TeamMode, series: SeriesLength, statCategory?: StatCategory
    }) => {
      try {
      if (!['starter5', 'bench8', 'full12'].includes(teamMode)) return
      if (![1, 3, 5].includes(series)) return
      // Rate limit: max 5 listing creations per minute per socket.
      // Each call runs two Prisma reads and broadcasts to all lobby clients.
      const clNow = Date.now()
      const clThrottle = createListingThrottle.get(socket.id)
      if (clThrottle && clNow - clThrottle.windowStart < THROTTLE_WINDOW_MS) {
        if (clThrottle.count >= CREATE_LISTING_THROTTLE_MAX) {
          socket.emit('listing-error', { message: 'Too many listings created. Please wait a moment.' })
          return
        }
        clThrottle.count++
      } else {
        createListingThrottle.set(socket.id, { count: 1, windowStart: clNow })
      }
      if (pendingListingCreate.has(socket.id)) return // prevent double-fire race
      pendingListingCreate.add(socket.id)
      // Always use the server-verified username from the JWT — never trust the client payload.
      // Accepting a client-supplied userName would let any authenticated user impersonate
      // another player's display name in the public lobby.
      const userId = socket.data.userId as string | null
      const userName: string = (socket.data.username as string | null ?? '').slice(0, 20) || 'Player'
      if (!userId) { pendingListingCreate.delete(socket.id); socket.emit('listing-error', { message: 'Must be signed in to post a game' }); return }
      // Per-userId creation throttle: prevents reconnect-bypass of the per-socket counter.
      // A rapid disconnect/reconnect resets socket.id (and thus createListingThrottle), so
      // we additionally track by userId for authenticated users.
      {
        const uctNow = Date.now()
        const uctEntry = userCreateThrottle.get(userId)
        if (uctEntry && uctNow - uctEntry.windowStart < USER_CREATE_THROTTLE_WINDOW_MS) {
          if (uctEntry.count >= USER_CREATE_THROTTLE_MAX) {
            pendingListingCreate.delete(socket.id)
            socket.emit('listing-error', { message: 'Too many listings created. Please wait a moment.' })
            return
          }
          uctEntry.count++
        } else { userCreateThrottle.set(userId, { count: 1, windowStart: uctNow }) }
      }
      // Guard: refuse if this user is already active in any draft or auction room.
      // The old check only scanned rooms (draft rooms) and missed active auction rooms,
      // allowing a user to post a listing while in a live auction — when both games
      // finished, updateStatsAndUnlock would fire twice for the same userId.
      if (isUserActiveInAnyRoom(userId)) {
        pendingListingCreate.delete(socket.id)
        socket.emit('listing-error', { message: 'Finish your current game before posting a new one' })
        return
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
      let hostEquippedBadge = ''
      if (userId) {
        // Re-verify tokenVersion here — the socket middleware only runs at connect time,
        // so a password change mid-session would not be caught without this check.
        // Fetch stats, tokenVersion, and equippedBadge in one query instead of two
        // separate findUnique calls (merges the old stats query + badge query).
        const u = await prisma.user.findUnique({
          where: { id: userId },
          select: { wins: true, losses: true, draws: true, winStreak: true, tokenVersion: true, equippedBadge: true },
        }).catch(() => null)
        if (!u || u.tokenVersion !== (socket.data.tokenVersion as number | null)) {
          pendingListingCreate.delete(socket.id)
          socket.emit('listing-error', { message: 'Session expired. Please refresh and sign in again.' })
          return
        }
        hostRecord.wins = u.wins; hostRecord.losses = u.losses; hostRecord.draws = u.draws; hostStreak = u.winStreak
        hostEquippedBadge = u.equippedBadge
      }

      // Guard: if the socket disconnected while we were awaiting Prisma, don't create a ghost listing
      if (!io.sockets.sockets.has(socket.id)) {
        pendingListingCreate.delete(socket.id)
        return
      }

      let code = generateCode()
      let codeAttempts = 0
      while (rooms.has(code) || readyRooms.has(code) || gameListings.has(code) || auctionRooms.has(code)) {
        if (++codeAttempts >= 10) {
          pendingListingCreate.delete(socket.id)
          socket.emit('listing-error', { message: 'Unable to create listing. Please try again.' })
          return
        }
        code = generateCode()
      }

      const resolvedStatCategory: StatCategory = (statCategory && VALID_STAT_CATEGORIES.includes(statCategory)) ? statCategory : 'games_played'
      const listing: GameListing = { code, hostSocketId: socket.id, hostUserId: userId, hostName: userName, hostRecord, hostBadge: hostEquippedBadge, hostStreak, teamMode, series, statCategory: resolvedStatCategory }
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
      } catch (err) {
        console.error('[socket] create-listing unhandled error:', err)
        pendingListingCreate.delete(socket.id)
        socket.emit('listing-error', { message: 'Internal server error' })
      }
    })

    socket.on('cancel-listing', ({ code }: { code: string }) => {
      if (typeof code !== 'string') return
      // Rate limit: max 5 cancels per 10 seconds per socket.
      // Each call broadcasts listings-updated to all lobby clients.
      const clcNow = Date.now()
      const clcThrottle = cancelListingThrottle.get(socket.id)
      if (clcThrottle && clcNow - clcThrottle.windowStart < CANCEL_LISTING_THROTTLE_WINDOW_MS) {
        if (clcThrottle.count >= CANCEL_LISTING_THROTTLE_MAX) return // silently drop
        clcThrottle.count++
      } else { cancelListingThrottle.set(socket.id, { count: 1, windowStart: clcNow }) }
      const normCode = code.trim().toUpperCase()
      const listing = gameListings.get(normCode)
      // Allow cancel by socket.id (normal case) OR by matching authenticated userId
      // (covers the reconnect case where socket.id changed but the user is the same).
      // Without the userId fallback, an authenticated host who reconnects after a
      // momentary disconnect cannot cancel their own listing because the stored
      // hostSocketId no longer matches their new socket.id.
      const clUserId = socket.data.userId as string | null
      const isOwner = listing?.hostSocketId === socket.id ||
        (clUserId !== null && clUserId === listing?.hostUserId)
      if (!listing || !isOwner) return
      clearTimeout(listingTimers.get(normCode))
      listingTimers.delete(normCode)
      gameListings.delete(normCode)
      io.to('lobby').emit('listings-updated', { listings: Array.from(gameListings.values()) })
    })

    socket.on('join-listing', async ({ code: rawCode }: {
      code: string, userName?: string
    }) => {
      try {
      if (typeof rawCode !== 'string') return
      // Rate limit: max 10 join-listing attempts per minute per socket.
      // Each call triggers two Prisma queries; unthrottled spam floods the DB.
      const jlNow = Date.now()
      const jlThrottle = joinListingThrottle.get(socket.id)
      if (jlThrottle && jlNow - jlThrottle.windowStart < THROTTLE_WINDOW_MS) {
        if (jlThrottle.count >= JOIN_LISTING_THROTTLE_MAX) {
          socket.emit('listing-error', { message: 'Too many join attempts. Please wait a moment.' })
          return
        }
        jlThrottle.count++
      } else {
        joinListingThrottle.set(socket.id, { count: 1, windowStart: jlNow })
      }

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

      // Prevent simultaneous multi-game participation: a user already active in a draft
      // or auction room cannot join a listing — two concurrent games writing to the same
      // userId would corrupt wins/losses (double-counting via concurrent finishGame calls).
      if (isUserActiveInAnyRoom(userId)) {
        socket.emit('listing-error', { message: 'Finish your current game before joining a new one' })
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

      // Guard: if the guest socket disconnected while we were awaiting Prisma, notify the host
      // and abort. Without this check, the ready room is created with a stale guest socket and
      // the host is silently stuck for up to READY_ROOM_TIMEOUT_MS before receiving match-cancelled.
      if (!io.sockets.sockets.has(socket.id)) {
        io.to(listing.hostSocketId).emit('match-cancelled', { reason: 'Opponent disconnected before the game started' })
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
      } catch (err) {
        console.error('[socket] join-listing unhandled error:', err)
        socket.emit('listing-error', { message: 'Internal server error' })
      }
    })

    socket.on('use-emote', async ({ code, emoteText }: { code: string; emoteText: string }) => {
      try {
      if (typeof emoteText !== 'string') return
      const room = rooms.get(typeof code === 'string' ? code.trim().toUpperCase() : '')
      if (!room || room.status !== 'drafting') return
      const isHost = socket.id === room.hostSocketId
      const isGuest = socket.id === room.guestSocketId
      if (!isHost && !isGuest) return
      // Validate emoteText against the known emote texts to prevent arbitrary string injection
      const emoteEntry = EMOTES.find(e => e.text === emoteText)
      if (!emoteEntry) return

      // Apply the 3-second cooldown BEFORE any DB work so a malicious client cannot
      // spam this handler to trigger one Prisma read per call.
      const now = Date.now()
      const last = emoteLastSent.get(socket.id) ?? 0
      if (now - last < 3000) return // 3s cooldown
      emoteLastSent.set(socket.id, now)

      // Enforce equip gate: the sender must have this emote currently equipped,
      // not merely unlocked. This matches the product intent — players choose one
      // active emote from the equip screen. Checking equippedEmote (a single field)
      // is also cheaper than parsing the full unlockedEmotes JSON array.
      // Anonymous users may only send free emotes (winsRequired === 0) since they
      // have no equip state.
      const userId = socket.data.userId as string | null
      if (userId) {
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { equippedEmote: true },
        }).catch(() => null)
        if (!dbUser || dbUser.equippedEmote !== emoteEntry.id) {
          // Undo the timestamp reservation so a failed validation doesn't consume the cooldown
          emoteLastSent.set(socket.id, last)
          return
        }
      } else {
        // Anonymous players may only use emotes with winsRequired === 0
        if (emoteEntry.winsRequired > 0) {
          emoteLastSent.set(socket.id, last)
          return
        }
      }
      const targetSocketId = isHost ? room.guestSocketId : room.hostSocketId
      if (targetSocketId) io.to(targetSocketId).emit('opponent-emote', { emoteText })
      } catch (err) {
        console.error('[socket] use-emote unhandled error:', err)
      }
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
      // Rate limit: max 5 confirmations per 5 seconds per socket.
      // Each call broadcasts ready-update to both match participants; unthrottled spam
      // would flood both sockets before the game starts.
      const crNow = Date.now()
      const crThrottle = confirmReadyThrottle.get(socket.id)
      if (crThrottle && crNow - crThrottle.windowStart < CONFIRM_READY_WINDOW_MS) {
        if (crThrottle.count >= CONFIRM_READY_THROTTLE_MAX) return // silently drop
        crThrottle.count++
      } else {
        confirmReadyThrottle.set(socket.id, { count: 1, windowStart: crNow })
      }
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
      if (acThrottle0 && acNow0 - acThrottle0.windowStart < THROTTLE_WINDOW_MS) {
        if (acThrottle0.count >= CREATE_THROTTLE_MAX) { socket.emit('auction:error', { message: 'Too many rooms created. Please wait a moment.' }); return }
        acThrottle0.count++
      } else { createRoomThrottle.set(socket.id, { count: 1, windowStart: acNow0 }) }

      if (!Number.isInteger(teamSize) || !Number.isInteger(maxPlayers) || ![5, 8, 12].includes(teamSize) || maxPlayers < 2 || maxPlayers > 6) {
        socket.emit('auction:error', { message: 'Invalid settings' }); return
      }
      // Prefer the server-verified JWT username; fall back to sanitized, profanity-filtered
      // client name for anonymous players.
      userName = resolveDisplayName(socket.data.username as string | null, userName)
      if (allPlayers.length === 0) {
        socket.emit('auction:error', { message: 'Server still loading' }); return
      }

      // Block authenticated users from creating a room if they are already an active
      // participant in any draft or auction room.  Without this guard a single account
      // could open multiple tabs and create as many rooms as the per-socket throttle
      // allows (up to 5 per minute per tab), corrupting per-user stat recording.
      const userId = socket.data.userId as string | null
      // Per-userId creation throttle: prevents reconnect-bypass of the per-socket counter.
      if (userId) {
        const uctNow = Date.now()
        const uctEntry = userCreateThrottle.get(userId)
        if (uctEntry && uctNow - uctEntry.windowStart < USER_CREATE_THROTTLE_WINDOW_MS) {
          if (uctEntry.count >= USER_CREATE_THROTTLE_MAX) { socket.emit('auction:error', { message: 'Too many rooms created. Please wait a moment.' }); return }
          uctEntry.count++
        } else { userCreateThrottle.set(userId, { count: 1, windowStart: uctNow }) }
      }
      if (userId && isUserActiveInAnyRoom(userId)) {
        socket.emit('auction:error', { message: 'You are already in an active game' }); return
      }

      let code = generateCode()
      let codeAttempts = 0
      while (auctionRooms.has(code) || rooms.has(code) || readyRooms.has(code) || gameListings.has(code)) {
        if (++codeAttempts >= 10) {
          socket.emit('auction:error', { message: 'Unable to create room. Please try again.' })
          return
        }
        code = generateCode()
      }

      const budget = AUCTION_BUDGETS[teamSize] ?? 175
      const validPlayers = allPlayers.filter(p => p.ebkScore > 5)
      const shuffled = [...validPlayers]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      const poolSize = maxPlayers * teamSize * 2
      const pool = shuffled.slice(0, Math.min(poolSize, shuffled.length))

      const hostReconnectToken = crypto.randomBytes(16).toString('hex')
      const room: AuctionRoom = {
        code, hostSocketId: socket.id, maxPlayers, teamSize, totalBudget: budget,
        status: 'waiting',
        participants: [{ socketId: socket.id, userId, name: userName, budget, roster: [], paidPrices: {}, reconnectToken: hostReconnectToken }],
        playerPool: pool, currentPlayerIndex: -1, currentPlayer: null,
        currentBid: 0, currentBidderSocketId: null, currentBidderName: null,
        lastWinnerSocketId: null, lastWinnerName: null, lastWonAmount: 0, lastWonPlayerId: null,
        nominatorSocketId: null,
        stealInitiated: false, bidTimer: null, bidDeadline: 0,
        tradeOffers: [], tradeDeadline: null, tradeTimer: null, bidLog: [], finalResults: null,
        createdAt: Date.now(), cleanupTimer: null,
      }
      auctionRooms.set(code, room)
      socket.join(`auction:${code}`)
      console.log('[auction] created code=%s host=%s maxPlayers=%d teamSize=%d auction_rooms=%d',
        code, redactName(socket.data.username ?? 'anon'), room.maxPlayers, room.teamSize, auctionRooms.size)
      socket.emit('auction:created', { code })
      // Issue the host's reconnect token point-to-point so it is never broadcast.
      socket.emit('auction:room-token', { code, token: hostReconnectToken })
      broadcastAuctionState(io, room)
    })

    socket.on('auction:join', ({ code, userName, token }: { code: string; userName: string; token?: string }) => {
      if (typeof code !== 'string') return
      // Rate limit: max 10 auction:join attempts per minute per socket to prevent room-code brute-force.
      // This mirrors the identical guard on join-room (game rooms).
      const ajNow = Date.now()
      const ajThrottle = joinRoomThrottle.get(socket.id)
      if (ajThrottle && ajNow - ajThrottle.windowStart < THROTTLE_WINDOW_MS) {
        if (ajThrottle.count >= JOIN_THROTTLE_MAX) {
          socket.emit('auction:error', { message: 'Too many join attempts. Please wait a moment.' })
          return
        }
        ajThrottle.count++
      } else {
        joinRoomThrottle.set(socket.id, { count: 1, windowStart: ajNow })
      }
      // Prefer the server-verified JWT username; fall back to sanitized, profanity-filtered
      // client name for anonymous players.
      userName = resolveDisplayName(socket.data.username as string | null, userName)
      const room = auctionRooms.get(code.trim().toUpperCase())
      if (!room) { socket.emit('auction:error', { message: 'Room not found' }); return }

      // Allow a previous participant (same name) to reconnect even if auction has started.
      // New socketId after reconnect won't match, so check by name first.
      // Security: if the stored participant has a userId, the reconnecting socket must
      // present a matching userId — blocking name-guessing seat hijacks by unauthenticated
      // clients or authenticated clients using a different account.
      const incomingUserId = socket.data.userId as string | null
      const existingByName = room.participants.find(p => p.name === userName)
      if (existingByName && room.status !== 'waiting') {
        if (existingByName.userId && incomingUserId !== existingByName.userId) {
          socket.emit('auction:error', { message: 'Unauthorized' })
          return
        }
        // For anonymous participants, only allow slot takeover when the original
        // socket is no longer connected AND a valid reconnect token is presented.
        // Checking socket liveness alone is insufficient: if the original socket
        // has disconnected (network drop), any attacker who knows the participant's
        // display name can call auction:join and steal their in-progress slot.
        // The reconnect token (16 random bytes, issued at join/create, stored in
        // the client's sessionStorage) provides the cryptographic proof needed to
        // distinguish the real participant from a name-guessing hijacker.
        const tokenValid = typeof token === 'string' && token === existingByName.reconnectToken
        if (!existingByName.userId && (io.sockets.sockets.has(existingByName.socketId) || !tokenValid)) {
          socket.emit('auction:error', { message: 'Unauthorized' })
          return
        }
        const oldSocketId = existingByName.socketId
        const wasHost = oldSocketId === room.hostSocketId
        existingByName.socketId = socket.id
        if (wasHost) room.hostSocketId = socket.id
        // Keep room-level socketId references consistent with the new socket so that
        // bid-expiry and pass-turn checks that look up by socketId still work.
        if (room.currentBidderSocketId === oldSocketId) room.currentBidderSocketId = socket.id
        if (room.nominatorSocketId === oldSocketId) room.nominatorSocketId = socket.id
        socket.join(`auction:${room.code}`)
        socket.emit('auction:joined', { code: room.code })
        // Rotate and re-issue the reconnect token so the client's sessionStorage
        // stays current.  Rotation prevents an intercepted token from being replayed
        // on the next disconnect to permanently steal the participant's slot.
        if (!existingByName.userId) {
          existingByName.reconnectToken = crypto.randomBytes(16).toString('hex')
        }
        socket.emit('auction:room-token', { code: room.code, token: existingByName.reconnectToken })
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
      const userId = socket.data.userId as string | null
      // Prevent simultaneous multi-game participation: a user already active in a draft
      // or another auction room cannot join a new one — concurrent games would corrupt
      // stat recording (wins/losses written by two finishGame calls for the same userId).
      if (userId && isUserActiveInAnyRoom(userId)) {
        socket.emit('auction:error', { message: 'You are already in an active game' }); return
      }
      const guestReconnectToken = crypto.randomBytes(16).toString('hex')
      room.participants.push({ socketId: socket.id, userId, name: userName, budget: room.totalBudget, roster: [], paidPrices: {}, reconnectToken: guestReconnectToken })
      socket.join(`auction:${room.code}`)
      socket.emit('auction:joined', { code: room.code })
      // Issue the new participant's reconnect token point-to-point.
      socket.emit('auction:room-token', { code: room.code, token: guestReconnectToken })
      broadcastAuctionState(io, room)
    })

    socket.on('auction:start', ({ code }: { code: string }) => {
      if (typeof code !== 'string') return
      const room = auctionRooms.get(code.trim().toUpperCase())
      if (!room || room.status !== 'waiting') return
      if (socket.id !== room.hostSocketId) { socket.emit('auction:error', { message: 'Only the host can start' }); return }
      if (room.participants.length < 2) { socket.emit('auction:error', { message: 'Need at least 2 players to start' }); return }
      advanceAuction(io, room)
    })

    socket.on('auction:bid', ({ code, amount }: { code: string; amount: number }) => {
      if (typeof code !== 'string') return
      // Rate limit: max 5 bids per second per socket to prevent DoS spam
      const now = Date.now()
      const throttle = bidThrottle.get(socket.id)
      if (throttle && now - throttle.windowStart < BID_THROTTLE_WINDOW_MS) {
        if (throttle.count >= BID_THROTTLE_MAX) { socket.emit('auction:error', { message: 'Bidding too fast — slow down.' }); return }
        throttle.count++
      } else {
        bidThrottle.set(socket.id, { count: 1, windowStart: now })
      }

      const room = auctionRooms.get(code.trim().toUpperCase())
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
      // $1-per-remaining-slot rule: must keep at least $1 for each roster slot still
      // to be filled after this one.  Without this guard a participant could exhaust
      // their entire budget on a single player, leaving $0 for their remaining empty
      // slots — advanceAuction would then exclude them (budget < 1) and they would
      // finish the auction short-rostered.
      const remainingSlots = room.teamSize - bidder.roster.length - 1 // slots still needed after this win
      const maxBid = bidder.budget - remainingSlots
      if (amount > maxBid) {
        socket.emit('auction:error', { message: `Max bid is $${maxBid}M — must keep $1M per remaining roster slot` }); return
      }

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
      if (typeof code !== 'string') return
      const room = auctionRooms.get(code.trim().toUpperCase())
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
      // Turn-order enforcement: only the designated nominator for this round may
      // pass. Without this, any participant could unilaterally skip a player that
      // others haven't had a chance to bid on yet, denying them fair auction access.
      if (room.nominatorSocketId !== null && socket.id !== room.nominatorSocketId) {
        socket.emit('auction:error', { message: 'Only the current nominator can pass' })
        return
      }
      // Cancel the running timer so handleAuctionBidExpiry doesn't also fire
      if (room.bidTimer) { clearTimeout(room.bidTimer); room.bidTimer = null }
      room.bidLog.push({ name: passer.name, amount: 0, action: 'pass' })
      advanceAuction(io, room)
    })

    socket.on('auction:steal', ({ code, playerIdToSteal }: { code: string; playerIdToSteal: number }) => {
      if (typeof code !== 'string') return
      const room = auctionRooms.get(code.trim().toUpperCase())
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
      // $1-per-remaining-slot rule (mirrors the auction:bid check): after paying the
      // steal price the stealer must have at least $1 for each roster slot still
      // to be filled beyond this steal.  stealer.roster.length + 1 is the roster
      // size after this steal is added; remainingSlots is the number of empty slots
      // still to be filled.  Without this check a participant could spend their
      // entire budget on a steal, leaving $0 for future slots and becoming excluded
      // from advanceAuction's needsMore check — finishing the auction short-rostered.
      const stealRemainingSlots = room.teamSize - stealer.roster.length - 1 // slots still needed after this steal
      const stealMaxBid = stealer.budget - stealRemainingSlots
      if (stealPrice > stealMaxBid) {
        socket.emit('auction:error', { message: `Max steal is $${stealMaxBid}M — must keep $1M per remaining roster slot` }); return
      }

      stealer.budget -= stealPrice
      stealer.roster.push(playerIdToSteal)
      stealer.paidPrices[playerIdToSteal] = stealPrice
      owner.roster = owner.roster.filter(id => id !== playerIdToSteal)
      owner.budget += originalPrice
      delete owner.paidPrices[playerIdToSteal]

      room.stealInitiated = true
      room.bidLog.push({ name: stealer.name, amount: stealPrice, action: 'steal' })
      // Update bidDeadline to reflect the post-steal advance window so the client
      // countdown timer shows the correct remaining time. Without this the client
      // keeps displaying the old steal-window deadline (already near zero), making
      // the countdown jump backward or expire immediately after the steal.
      room.bidDeadline = Date.now() + POST_STEAL_ADVANCE_MS
      // Cancel the steal-window timer and arm the post-steal advance timer BEFORE
      // broadcasting so that room.bidTimer reflects the live handle when the state
      // snapshot is built (prevents a brief window where bidTimer is null).
      if (room.bidTimer) clearTimeout(room.bidTimer)
      room.bidTimer = setTimeout(() => advanceAuction(io, room), POST_STEAL_ADVANCE_MS)
      broadcastAuctionState(io, room)
    })

    socket.on('auction:trade-offer', ({ code, toSocketId, offeredPlayerIds, requestedPlayerIds }: {
      code: string; toSocketId: string; offeredPlayerIds: number[]; requestedPlayerIds: number[]
    }) => {
      if (typeof code !== 'string' || typeof toSocketId !== 'string') return
      // Rate limit: max 10 trade actions per 10 seconds per socket to prevent broadcast flooding.
      const toNow = Date.now()
      const toThrottle = tradeThrottle.get(socket.id)
      if (toThrottle && toNow - toThrottle.windowStart < TRADE_THROTTLE_WINDOW_MS) {
        if (toThrottle.count >= TRADE_THROTTLE_MAX) { socket.emit('auction:error', { message: 'Too many trade actions. Please slow down.' }); return }
        toThrottle.count++
      } else { tradeThrottle.set(socket.id, { count: 1, windowStart: toNow }) }
      const room = auctionRooms.get(code.trim().toUpperCase())
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
      // Deduplicate: replace any prior offer from this sender to this recipient.
      room.tradeOffers = room.tradeOffers.filter(o => !(o.fromSocketId === socket.id && o.toSocketId === toSocketId))
      // Cap total concurrent outbound offers per sender to prevent trade-spam that
      // floods every other participant's UI and locks them out of accepting.
      // A sender may have at most 3 open outbound offers at once.
      const outboundCount = room.tradeOffers.filter(o => o.fromSocketId === socket.id).length
      if (outboundCount >= 3) {
        socket.emit('auction:error', { message: 'You already have 3 pending trade offers. Retract one before sending another.' })
        return
      }
      room.tradeOffers.push(offer)
      broadcastAuctionState(io, room)
    })

    // Allow the sender to retract an outbound offer before it is accepted/declined.
    // Without this handler the server error "Cancel one before sending another" is
    // unreachable — users who hit the 3-offer cap are permanently stuck.
    socket.on('auction:trade-cancel', ({ code, offerId }: { code: string; offerId: string }) => {
      if (typeof code !== 'string' || typeof offerId !== 'string') return
      // Rate limit: shared trade action throttle (10 per 10s) to prevent broadcast flooding.
      const tcNow = Date.now()
      const tcThrottle = tradeThrottle.get(socket.id)
      if (tcThrottle && tcNow - tcThrottle.windowStart < TRADE_THROTTLE_WINDOW_MS) {
        if (tcThrottle.count >= TRADE_THROTTLE_MAX) { socket.emit('auction:error', { message: 'Too many trade actions. Please slow down.' }); return }
        tcThrottle.count++
      } else { tradeThrottle.set(socket.id, { count: 1, windowStart: tcNow }) }
      const room = auctionRooms.get(code.trim().toUpperCase())
      if (!room || room.status !== 'trading') return
      const idx = room.tradeOffers.findIndex(o => o.id === offerId)
      if (idx === -1) return
      // Only the original sender may retract the offer.
      if (room.tradeOffers[idx].fromSocketId !== socket.id) return
      room.tradeOffers.splice(idx, 1)
      broadcastAuctionState(io, room)
    })

    socket.on('auction:trade-respond', ({ code, offerId, accept }: { code: string; offerId: string; accept: boolean }) => {
      if (typeof code !== 'string' || typeof offerId !== 'string') return
      if (typeof accept !== 'boolean') { socket.emit('auction:error', { message: 'Invalid trade response' }); return }
      // Rate limit: shared trade action throttle (10 per 10s) to prevent broadcast flooding.
      const trNow = Date.now()
      const trThrottle = tradeThrottle.get(socket.id)
      if (trThrottle && trNow - trThrottle.windowStart < TRADE_THROTTLE_WINDOW_MS) {
        if (trThrottle.count >= TRADE_THROTTLE_MAX) { socket.emit('auction:error', { message: 'Too many trade actions. Please slow down.' }); return }
        trThrottle.count++
      } else { tradeThrottle.set(socket.id, { count: 1, windowStart: trNow }) }
      const room = auctionRooms.get(code.trim().toUpperCase())
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

    socket.on('auction:get-state', async ({ code, userName: rawUserName, token }: { code: string; userName?: string; token?: string }) => {
      try {
      if (typeof code !== 'string') return
      // Rate limit: max 20 get-state calls per minute per socket to prevent DB flooding.
      // Each call that misses the in-memory room cache hits Prisma; unthrottled spam
      // with random codes saturates the DB with pointless findUnique queries.
      const gasNow = Date.now()
      const gasThrottle = getAuctionStateThrottle.get(socket.id)
      if (gasThrottle && gasNow - gasThrottle.windowStart < GET_AUCTION_STATE_WINDOW_MS) {
        if (gasThrottle.count >= GET_AUCTION_STATE_THROTTLE_MAX) {
          socket.emit('auction:error', { message: 'Too many requests. Please wait a moment.' })
          return
        }
        gasThrottle.count++
      } else {
        getAuctionStateThrottle.set(socket.id, { count: 1, windowStart: gasNow })
      }
      const normalizedCode = code.trim().toUpperCase()
      const room = auctionRooms.get(normalizedCode)

      // ── DB FALLBACK ──────────────────────────────────────────────────────────
      // If the room is not in memory (e.g. after a server restart), check the DB
      // for a persisted AuctionRecord.  If found, reconstruct a minimal completed
      // state and emit it so the results screen renders correctly.  No access
      // control is applied here beyond requiring that the record exists — the
      // results page is not private data (it contains no bid amounts beyond what
      // was already broadcast during the live auction).
      if (!room) {
        let record: { code: string; teamSize: number; totalBudget: number; results: string; completedAt: Date } | null = null
        try {
          record = await prisma.auctionRecord.findUnique({
            where: { code: normalizedCode },
            select: { code: true, teamSize: true, totalBudget: true, results: true, completedAt: true },
          })
        } catch (err) {
          console.error('[auction] DB lookup failed for code=%s: %o', normalizedCode, err)
        }
        if (!record) {
          socket.emit('auction:error', { message: 'Room not found' })
          return
        }
        // Enforce the 48 h review window: results older than 48 h are considered
        // expired.  Without this check, any visitor to an old code would receive
        // results from an auction that may have been played weeks ago, and a new
        // auction that reuses the same short code would be impossible because the
        // stale DB row would shadow the live room.
        const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000
        if (Date.now() - record.completedAt.getTime() > FORTY_EIGHT_HOURS_MS) {
          socket.emit('auction:error', { message: 'Room not found' })
          return
        }
        // Parse stored results and emit a synthetic complete state.
        // Guard: if the stored JSON is malformed or not an array (corrupt DB row), fall
        // back to an empty array so the client receives a valid auction:state payload
        // instead of crashing on results.map() / results.forEach() calls.
        let finalResults: unknown = []
        try {
          const parsed = JSON.parse(record.results)
          if (Array.isArray(parsed)) finalResults = parsed
        } catch { /* leave as [] */ }
        socket.emit('auction:state', {
          code: record.code,
          status: 'complete',
          teamSize: record.teamSize,
          totalBudget: record.totalBudget,
          maxPlayers: 0,
          hostSocketId: '',
          participants: [],
          currentPlayer: null,
          currentBid: 0,
          currentBidderSocketId: null,
          currentBidderName: null,
          lastWinnerSocketId: null,
          lastWinnerName: null,
          lastWonAmount: 0,
          stealInitiated: false,
          nominatorSocketId: null,
          bidDeadline: 0,
          tradeDeadline: null,
          tradeOffers: [],
          playerIndex: 0,
          poolSize: 0,
          bidLog: [],
          finalResults,
        })
        return
      }

      // Normalize userName the same way auction:join does: prefer the server-verified
      // JWT username over the client-supplied value.  Without this, an authenticated
      // attacker could pass an arbitrary userName in the event payload to match another
      // participant's name and steal their slot when their original socket goes away.
      const userName: string | undefined = ((socket.data.username as string | null) || (rawUserName ?? '').trim()).slice(0, 20) || undefined

      // Handle reconnection: if this socket is not a participant but a participant
      // has the same name (or same userId), update their socketId.
      // Security: if the stored participant has a userId, the reconnecting socket
      // must present a matching userId — otherwise any unauthenticated client can
      // steal a seat by knowing the participant's username.
      const existing = room.participants.find(p => p.socketId === socket.id)
      if (!existing && userName) {
        const byName = room.participants.find(p => p.name === userName)
        if (byName) {
          const incomingUserId = socket.data.userId as string | null
          // If the stored participant was authenticated, require a matching userId.
          if (byName.userId && incomingUserId !== byName.userId) {
            socket.emit('auction:error', { message: 'Unauthorized' })
            return
          }
          // For anonymous participants, only allow slot takeover when either:
          //   (a) the original socket is gone (prevents name-guessing hijacks while
          //       the real player is still live), OR
          //   (b) the caller presents the valid reconnect token (covers the window
          //       where both players simultaneously lose and regain connectivity —
          //       the old socket may still appear connected briefly while the new
          //       socket is already trying to re-seat).
          const origConnected = io.sockets.sockets.has(byName.socketId)
          const tokenValid = typeof token === 'string' && token === byName.reconnectToken
          if (!byName.userId && origConnected && !tokenValid) {
            socket.emit('auction:error', { message: 'Unauthorized' })
            return
          }
          // Re-seat this socket into the existing participant slot (reconnection)
          const oldSocketId = byName.socketId
          const wasHost = oldSocketId === room.hostSocketId
          byName.socketId = socket.id
          if (wasHost) room.hostSocketId = socket.id
          // Keep room-level socketId references consistent with the new socket so that
          // bid-expiry and pass-turn checks that look up by socketId still work.
          if (room.currentBidderSocketId === oldSocketId) room.currentBidderSocketId = socket.id
          if (room.nominatorSocketId === oldSocketId) room.nominatorSocketId = socket.id
          socket.join(`auction:${room.code}`)
          // Rotate the reconnect token after a successful anonymous token-based reconnect.
          // Without rotation the old token remains usable indefinitely: an attacker who
          // captured the token can replay it every time the real participant disconnects
          // to persistently steal their auction slot.
          if (!byName.userId && tokenValid) {
            byName.reconnectToken = crypto.randomBytes(16).toString('hex')
            socket.emit('auction:room-token', { code: room.code, token: byName.reconnectToken })
          }
        }
      }

      // Access control for completed rooms: only participants may retrieve full state
      // (which includes finalResults with team compositions and individual bid amounts).
      // Without this check, any socket that learns a 6-char room code could call
      // auction:get-state after the auction finishes and receive all private draft data.
      // Active/waiting rooms are implicitly protected because non-participants have no
      // reason to call this handler (they haven't joined via auction:join), and the
      // in-progress state doesn't contain finalResults anyway.
      if (room.status === 'complete') {
        const isParticipant = room.participants.some(p => p.socketId === socket.id)
        if (!isParticipant) {
          socket.emit('auction:error', { message: 'Unauthorized' })
          return
        }
      }

      // Rebuild and emit state directly to the requesting socket (not just participants).
      // This handles the case where socketId changed after a reconnect/navigation.
      // Pass socket.id so trade offers are filtered to only those involving this socket.
      const state = buildAuctionStateForSocket(room, socket.id)
      socket.emit('auction:state', state)
      } catch (err) {
        console.error('[socket] auction:get-state unhandled error:', err)
        socket.emit('auction:error', { message: 'Internal server error' })
      }
    })

    socket.on('auction:finish-trading', ({ code }: { code: string }) => {
      if (typeof code !== 'string') return
      const room = auctionRooms.get(code.trim().toUpperCase())
      if (!room || room.status !== 'trading' || socket.id !== room.hostSocketId) return
      if (room.tradeTimer) clearTimeout(room.tradeTimer)
      finishAuction(io, room)
    })

    socket.on('disconnect', () => {
      emoteLastSent.delete(socket.id)
      bidThrottle.delete(socket.id)
      joinRoomThrottle.delete(socket.id)
      createRoomThrottle.delete(socket.id)
      getRoomThrottle.delete(socket.id)
      getListingsThrottle.delete(socket.id)
      joinListingThrottle.delete(socket.id)
      getAuctionStateThrottle.delete(socket.id)
      createListingThrottle.delete(socket.id)
      tradeThrottle.delete(socket.id)
      confirmReadyThrottle.delete(socket.id)
      pickThrottle.delete(socket.id)
      nextGameThrottle.delete(socket.id)
      cancelListingThrottle.delete(socket.id)
      // userCreateThrottle is intentionally NOT deleted on disconnect — it is keyed by
      // userId precisely so that reconnects don't reset the creation rate limit.
      // Remove any open listing by this socket OR by the same authenticated userId.
      // Without the userId fallback, a host who reconnects after a brief disconnect
      // gets a new socket.id — the stale listing.hostSocketId no longer matches, so
      // when the reconnected socket disconnects the listing is NOT cleaned up.  It
      // remains visible in the lobby as a ghost (join-listing rejects it because the
      // original socket is gone) until the 10-minute expiry timer fires.
      // This mirrors the userId-based ownership check already present in cancel-listing.
      const disconnectingUserId = socket.data.userId as string | null
      for (const [code, listing] of gameListings.entries()) {
        const isOwner = listing.hostSocketId === socket.id ||
          (disconnectingUserId !== null && disconnectingUserId === listing.hostUserId)
        if (isOwner) {
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
          // Completed series: nothing to do — room is already done.
          if (room.status === 'complete') return
          // Between-game result screen: not a forfeit (no game in progress), but the
          // remaining player should still be notified if their opponent doesn't reconnect.
          // Start a grace timer — if the disconnected player calls get-room within
          // PARTNER_DISCONNECT_GRACE_MS the timer is cancelled and they are re-seated.
          // Without this, a host who closes their tab between games leaves the guest
          // silently stuck on the result screen until the room cleanup timer fires (up to
          // 60 s later), at which point any action the guest takes returns "Room not found"
          // with no explanation.
          if (room.status === 'result') {
            if (partnerDisconnectTimers.has(code)) return
            const disconnectorIsHost = room.hostSocketId === socket.id
            const resultGraceTimer = setTimeout(() => {
              partnerDisconnectTimers.delete(code)
              if (!rooms.has(code) || room.status === 'complete') return
              // Still on the result screen: notify the remaining player and ensure cleanup.
              if (room.status === 'result') {
                const remainingSocketId = disconnectorIsHost ? room.guestSocketId : room.hostSocketId
                if (remainingSocketId) io.to(remainingSocketId).emit('partner-disconnected')
                if (!roomCleanupTimers.has(code)) scheduleRoomCleanup(code, io)
              }
            }, PARTNER_DISCONNECT_GRACE_MS)
            partnerDisconnectTimers.set(code, resultGraceTimer)
            return
          }
          // If a forfeit timer is already pending for this room (the other player also
          // recently disconnected), don't start a second one — let the existing timer fire.
          if (partnerDisconnectTimers.has(code)) return
          // Grace period: wait PARTNER_DISCONNECT_GRACE_MS before finalising the forfeit.
          // If the disconnected player reconnects within the window (via get-room), the
          // get-room handler will cancel this timer and re-seat them.
          const disconnectorIsHost = room.hostSocketId === socket.id
          const gracePeriodTimer = setTimeout(() => {
            partnerDisconnectTimers.delete(code)
            // Re-check: room may have been cleaned up or already completed by the time
            // the grace period expires (e.g. both players disconnected simultaneously).
            if (!rooms.has(code) || room.status === 'complete') return
            // If the game already advanced to the result screen while the grace timer was
            // running (e.g. auto-pick fired and completed the draft), don't issue a forfeit
            // but DO notify the remaining player so they are not silently stuck waiting for
            // an opponent who is gone.  Also schedule cleanup in case nobody clicks next-game.
            if (room.status === 'result') {
              const remainingSocketId = disconnectorIsHost ? room.guestSocketId : room.hostSocketId
              if (remainingSocketId) io.to(remainingSocketId).emit('partner-disconnected')
              if (!roomCleanupTimers.has(code)) scheduleRoomCleanup(code, io)
              return
            }
            // Mark complete to prevent double-forfeit if the second player disconnects
            // during or after the grace period.
            room.status = 'complete'
            const pickTimer = pickTimers.get(code)
            if (pickTimer) clearTimeout(pickTimer)
            pickTimers.delete(code)
            io.to(code).emit('partner-disconnected')
            // Award win to remaining player and loss to disconnector for online games.
            // Guard: if BOTH players are now disconnected (second player left during the
            // grace window and their socket is also gone), skip stat writes entirely.
            // Writing a win for a player who is also absent would inflate their record
            // with a phantom victory they never experienced — and a loss for a player who
            // abandoned along with their opponent is equally unfair.
            const winner = disconnectorIsHost ? 'guest' : 'host'
            const winnerSocketId = winner === 'host' ? room.hostSocketId : room.guestSocketId
            const winnerConnected = winnerSocketId ? io.sockets.sockets.has(winnerSocketId) : false
            if (room.source === 'online' && winnerConnected) {
              recordMatchup(room.hostUserId, room.guestUserId)
              // Give the winner enough series wins to clearly win the series
              const winsNeeded = Math.ceil(room.series / 2)
              if (winner === 'host') {
                room.hostSeriesScore = Math.max(room.hostSeriesScore, winsNeeded)
              } else {
                room.guestSeriesScore = Math.max(room.guestSeriesScore, winsNeeded)
              }
              if (room.hostUserId) updateStatsAndUnlock(io, room.hostUserId, room.hostSocketId, winner === 'host', false, room.hostJCGames, true)
              if (room.guestUserId) updateStatsAndUnlock(io, room.guestUserId, room.guestSocketId ?? '', winner === 'guest', false, room.guestJCGames, false)
              saveGameRecords(room, winner)
            }
            // scheduleRoomCleanup cleans up consecutiveTimeouts/pickTimerStartedAt/rooms
            scheduleRoomCleanup(code, io)
          }, PARTNER_DISCONNECT_GRACE_MS)
          partnerDisconnectTimers.set(code, gracePeriodTimer)
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
            auctionRoundCounter.delete(room.code)
          } else {
            if (room.hostSocketId === socket.id) room.hostSocketId = room.participants[0].socketId
            broadcastAuctionState(io, room)
          }
        } else if (room.status === 'complete') {
          // Completed room: participants may still be viewing results.  Only free
          // the room if ALL remaining participants have now disconnected — there is
          // no reason to keep 30 minutes of results in memory for an empty room.
          const allGoneComplete = room.participants.every(p => !io.sockets.sockets.has(p.socketId))
          if (allGoneComplete) {
            if (room.cleanupTimer) { clearTimeout(room.cleanupTimer); room.cleanupTimer = null }
            if (auctionRooms.get(room.code) === room) {
              auctionRooms.delete(room.code)
              auctionRoundCounter.delete(room.code)
            }
          }
        } else {
          // Active room: mark the participant as disconnected but keep their slot.
          // If the disconnecting socket was the current round's nominator and no bid
          // has been placed yet, hand the nomination to the next connected participant
          // so they can pass without waiting the full 25-second BID_TIMER.  Without
          // this, an adversarial (or crashed) nominator would freeze pass-ability for
          // the remaining connected players for the entire bid window each round.
          if (
            room.status === 'bidding' &&
            room.nominatorSocketId === socket.id &&
            room.currentBid === 0
          ) {
            const connected = room.participants.filter(
              p => p.socketId !== socket.id && io.sockets.sockets.has(p.socketId)
            )
            room.nominatorSocketId = connected.length > 0 ? connected[0].socketId : null
          }
          // Broadcast state so remaining players see accurate participant list.
          broadcastAuctionState(io, room)
          // If ALL participants are now disconnected, tear down timers and delete the
          // room — nobody is coming back and the timers would otherwise fire forever.
          const allGone = room.participants.every(p => !io.sockets.sockets.has(p.socketId))
          if (allGone) {
            if (room.bidTimer) clearTimeout(room.bidTimer)
            if (room.tradeTimer) clearTimeout(room.tradeTimer)
            auctionRooms.delete(room.code)
            auctionRoundCounter.delete(room.code)
          }
        }
      })
    })
  })

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`)
  })
}).catch((err) => {
  console.error('[server] Fatal error during startup — exiting:', err)
  process.exit(1)
})
