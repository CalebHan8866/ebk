import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { Server as SocketServer } from 'socket.io'
import { PrismaClient } from '@prisma/client'

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
  'ATL':'ATL','STL':'ATL','MHK':'ATL','TCB':'ATL','TRI':'ATL',
  'BOS':'BOS',
  'BKN':'BKN','NJN':'BKN','NJA':'BKN','NYN':'BKN',
  'CHA':'CHA','CHH':'CHA','CHB':'CHA',
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

function getCurrentTeam(abbr: string): string {
  return TEAM_LINEAGE[abbr] || abbr
}

function spinTeam(room: Room): string {
  const takenIds = new Set([...room.hostPicks, ...room.guestPicks])
  // Find which current-franchise teams have available players
  const available = new Set<string>()
  for (const p of allPlayers) {
    if (!takenIds.has(p.id)) available.add(getCurrentTeam(p.team))
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
  currentGame: number
  hostSeriesScore: number
  guestSeriesScore: number
  gameResults: GameResult[]
  currentSpunTeam: string | null
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
}

interface QueueEntry {
  socketId: string
  userId: string | null
  userName: string
  teamMode: TeamMode
  series: SeriesLength
  difficulty: Difficulty
}

interface ReadyRoom {
  code: string
  hostEntry: QueueEntry
  guestEntry: QueueEntry
  hostReady: boolean
  guestReady: boolean
  timer: ReturnType<typeof setTimeout>
}

// ─── Room Store ──────────────────────────────────────────────────────────────

const rooms = new Map<string, Room>()
const matchmakingQueue: QueueEntry[] = []
const readyRooms = new Map<string, ReadyRoom>()
const pickTimers = new Map<string, ReturnType<typeof setTimeout>>()
const consecutiveTimeouts = new Map<string, { host: number; guest: number }>()
let allPlayers: PlayerData[] = []

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
    const p = allPlayers.find(pl => pl.id === id)
    if (p) hostTotal += getStatForMode(p, statMode)
  }
  for (const id of room.guestPicks) {
    const p = allPlayers.find(pl => pl.id === id)
    if (p) guestTotal += getStatForMode(p, statMode)
  }

  const winner = hostTotal < guestTotal ? 'host' : guestTotal < hostTotal ? 'guest' : 'draw'
  return { game: room.currentGame, statMode, hostTotal, guestTotal, winner }
}

function autoPickPlayer(room: Room): number | null {
  const takenIds = new Set([...room.hostPicks, ...room.guestPicks])
  let available = allPlayers.filter(p => !takenIds.has(p.id))
  if (available.length === 0) return null
  // Respect spun team constraint if set
  if (room.currentSpunTeam) {
    const teamAvail = available.filter(p => getCurrentTeam(p.team) === room.currentSpunTeam)
    if (teamAvail.length > 0) available = teamAvail
  }
  const statMode = getStatModeForGame(room.currentGame)
  available.sort((a, b) => getStatForMode(a, statMode) - getStatForMode(b, statMode))
  return available[0].id
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
    const pickedId = autoPickPlayer(currentRoom)
    if (pickedId === null) return

    if (picker === 'host') currentRoom.hostPicks.push(pickedId)
    else currentRoom.guestPicks.push(pickedId)

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
      currentRoom.hostSeriesScore = winner === 'host' ? 1 : 0
      currentRoom.guestSeriesScore = winner === 'guest' ? 1 : 0
      pickTimers.delete(code)

      if (currentRoom.source === 'online') {
        const updateDB = async () => {
          const hostId = currentRoom.hostUserId
          const guestId = currentRoom.guestUserId
          if (hostId) await prisma.user.update({ where: { id: hostId }, data: { wins: winner === 'host' ? { increment: 1 } : undefined, losses: loser === 'host' ? { increment: 1 } : undefined } }).catch(() => {})
          if (guestId) await prisma.user.update({ where: { id: guestId }, data: { wins: winner === 'guest' ? { increment: 1 } : undefined, losses: loser === 'guest' ? { increment: 1 } : undefined } }).catch(() => {})
        }
        updateDB()
      }

      io.to(code).emit('player-disqualified', { room: currentRoom, disqualifiedRole: loser, winner })
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

      const winsNeeded = Math.ceil(currentRoom.series / 2)
      const seriesDone = currentRoom.hostSeriesScore >= winsNeeded || currentRoom.guestSeriesScore >= winsNeeded || currentRoom.currentGame >= currentRoom.series
      currentRoom.status = seriesDone ? 'complete' : 'result'
      pickTimers.delete(code)

      if (seriesDone) {
        const seriesWinner = currentRoom.hostSeriesScore > currentRoom.guestSeriesScore ? 'host' : currentRoom.guestSeriesScore > currentRoom.hostSeriesScore ? 'guest' : 'draw'
        io.to(code).emit('series-complete', { room: currentRoom, seriesWinner })
      } else {
        io.to(code).emit('game-result', { room: currentRoom, result })
      }
    } else {
      io.to(code).emit('room-updated', { room: currentRoom })
      startPickTimer(io, currentRoom) // start timer for next pick
    }
  }, 30000)

  pickTimers.set(code, timer)
  io.to(code).emit('pick-timer-start', { picker: currentPicker, duration: 30, spunTeam })
}

// ─── Server ──────────────────────────────────────────────────────────────────

app.prepare().then(async () => {
  // Load players from DB
  allPlayers = await prisma.player.findMany()

  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true)
    handle(req, res, parsedUrl)
  })

  const io = new SocketServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/socket.io',
  })

  io.on('connection', (socket) => {
    console.log('connected:', socket.id)

    socket.on('create-room', ({ teamMode, series, difficulty, userName, userId }: {
      teamMode: TeamMode, series: SeriesLength, difficulty: Difficulty, userName: string, userId: string | null
    }) => {
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
        currentGame: 1,
        hostSeriesScore: 0,
        guestSeriesScore: 0,
        gameResults: [],
        currentSpunTeam: null,
      }
      rooms.set(code, room)
      socket.join(code)
      socket.emit('room-created', { room, players: allPlayers })
    })

    socket.on('join-room', ({ code, userName, userId }: {
      code: string, userName: string, userId: string | null
    }) => {
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

    socket.on('pick-player', ({ code, playerId }: { code: string, playerId: number }) => {
      const room = rooms.get(code)
      if (!room || room.status !== 'drafting') return

      const currentPicker = room.draftOrder[room.currentPickIndex]
      const isHost = socket.id === room.hostSocketId
      const isGuest = socket.id === room.guestSocketId

      if ((currentPicker === 'host' && !isHost) || (currentPicker === 'guest' && !isGuest)) return
      if (room.hostPicks.includes(playerId) || room.guestPicks.includes(playerId)) return

      // Validate spun team constraint
      if (room.currentSpunTeam) {
        const player = allPlayers.find(p => p.id === playerId)
        if (player && getCurrentTeam(player.team) !== room.currentSpunTeam) {
          socket.emit('pick-error', { message: `Must pick a ${room.currentSpunTeam} player this turn` })
          return
        }
      }

      // Clear pick timer
      const timer = pickTimers.get(code)
      if (timer) clearTimeout(timer)
      pickTimers.delete(code)

      // Reset consecutive timeouts for this picker (manual pick resets streak)
      const timeouts = consecutiveTimeouts.get(code) || { host: 0, guest: 0 }
      timeouts[currentPicker] = 0
      consecutiveTimeouts.set(code, timeouts)

      if (currentPicker === 'host') room.hostPicks.push(playerId)
      else room.guestPicks.push(playerId)

      room.currentPickIndex++

      const teamSize = TEAM_SIZES[room.teamMode]
      const totalPicks = teamSize * 2

      if (room.currentPickIndex >= totalPicks) {
        const result = calculateResult(room)
        room.gameResults.push(result)
        if (result.winner === 'host') room.hostSeriesScore++
        else if (result.winner === 'guest') room.guestSeriesScore++

        const winsNeeded = Math.ceil(room.series / 2)
        const seriesDone = room.hostSeriesScore >= winsNeeded || room.guestSeriesScore >= winsNeeded || room.currentGame >= room.series
        room.status = seriesDone ? 'complete' : 'result'

        if (seriesDone) {
          const seriesWinner = room.hostSeriesScore > room.guestSeriesScore ? 'host' : room.guestSeriesScore > room.hostSeriesScore ? 'guest' : 'draw'
          if (room.source === 'online') {
            const updateDB = async () => {
              if (room.hostUserId) await prisma.user.update({ where: { id: room.hostUserId }, data: { wins: seriesWinner === 'host' ? { increment: 1 } : undefined, losses: seriesWinner === 'guest' ? { increment: 1 } : undefined, draws: seriesWinner === 'draw' ? { increment: 1 } : undefined } }).catch(() => {})
              if (room.guestUserId) await prisma.user.update({ where: { id: room.guestUserId }, data: { wins: seriesWinner === 'guest' ? { increment: 1 } : undefined, losses: seriesWinner === 'host' ? { increment: 1 } : undefined, draws: seriesWinner === 'draw' ? { increment: 1 } : undefined } }).catch(() => {})
            }
            updateDB()
          }
          io.to(code).emit('series-complete', { room, seriesWinner })
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

      room.currentGame++
      room.hostPicks = []
      room.guestPicks = []
      room.currentPickIndex = 0
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
      const room = rooms.get(code)
      if (!room) {
        socket.emit('room-error', { message: 'Room not found or expired' })
        return
      }

      // Re-associate socket ID in case of reconnect/refresh
      if (role === 'host') {
        room.hostSocketId = socket.id
      } else if (role === 'guest') {
        room.guestSocketId = socket.id
      }

      socket.join(code)
      socket.emit('room-state', { room, players: allPlayers })

      if (room.status === 'drafting') {
        // Re-emit timer start for the current picker so rejoining client syncs
        const currentPicker = room.draftOrder[room.currentPickIndex]
        socket.emit('pick-timer-start', { picker: currentPicker, duration: 30 })
      }
    })

    // ── Matchmaking ──────────────────────────────────────────────────────────

    socket.on('join-queue', ({ userName, userId, teamMode, series, difficulty }: {
      userName: string, userId: string | null, teamMode: TeamMode, series: SeriesLength, difficulty: Difficulty
    }) => {
      // Remove if already in queue
      const existingIdx = matchmakingQueue.findIndex(e => e.socketId === socket.id)
      if (existingIdx !== -1) matchmakingQueue.splice(existingIdx, 1)

      const entry: QueueEntry = { socketId: socket.id, userId, userName, teamMode, series, difficulty: difficulty || 'casual' }
      matchmakingQueue.push(entry)
      socket.emit('queue-joined', { position: matchmakingQueue.length })

      // Try to find a match (first other person in queue)
      const otherIdx = matchmakingQueue.findIndex(e => e.socketId !== socket.id)
      if (otherIdx !== -1) {
        const other = matchmakingQueue[otherIdx]
        // Remove both from queue
        const myIdx = matchmakingQueue.findIndex(e => e.socketId === socket.id)
        matchmakingQueue.splice(Math.max(otherIdx, myIdx), 1)
        matchmakingQueue.splice(Math.min(otherIdx, myIdx), 1)

        // Create a ready room using the first player's settings
        let code = generateCode()
        while (rooms.has(code) || readyRooms.has(code)) code = generateCode()

        const readyTimer = setTimeout(() => {
          const rr = readyRooms.get(code)
          if (!rr) return
          readyRooms.delete(code)
          io.to(rr.hostEntry.socketId).emit('match-cancelled', { reason: 'Opponent did not ready up in time' })
          io.to(rr.guestEntry.socketId).emit('match-cancelled', { reason: 'Opponent did not ready up in time' })
        }, 60000)

        const readyRoom: ReadyRoom = {
          code,
          hostEntry: other,
          guestEntry: entry,
          hostReady: false,
          guestReady: false,
          timer: readyTimer,
        }
        readyRooms.set(code, readyRoom)

        const matchPayload = { code, teamMode: other.teamMode, series: other.series }
        io.to(other.socketId).emit('match-found', { ...matchPayload, opponentName: entry.userName })
        io.to(entry.socketId).emit('match-found', { ...matchPayload, opponentName: other.userName })
      }
    })

    socket.on('leave-queue', () => {
      const idx = matchmakingQueue.findIndex(e => e.socketId === socket.id)
      if (idx !== -1) matchmakingQueue.splice(idx, 1)
      socket.emit('queue-left')
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

        // Create actual room
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
          difficulty: 'ebk',
          source: 'online',
          status: 'drafting',
          draftOrder: buildSnakeDraft(teamSize),
          currentPickIndex: 0,
          hostPicks: [],
          guestPicks: [],
          currentGame: 1,
          hostSeriesScore: 0,
          guestSeriesScore: 0,
          gameResults: [],
          currentSpunTeam: null,
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
    })

    socket.on('disconnect', () => {
      // Remove from matchmaking queue
      const qIdx = matchmakingQueue.findIndex(e => e.socketId === socket.id)
      if (qIdx !== -1) matchmakingQueue.splice(qIdx, 1)

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
          const timer = pickTimers.get(code)
          if (timer) clearTimeout(timer)
          pickTimers.delete(code)
          io.to(code).emit('partner-disconnected')
          rooms.delete(code)
        }
      })
    })
  })

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`)
  })
})
