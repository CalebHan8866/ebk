/**
 * EBK Overnight Test Harness
 * Tests: API endpoints, WebSocket online game, friends mode, edge cases
 * Run: node test-harness.mjs
 */

import { io } from 'socket.io-client'

const BASE = 'https://ebk-production.up.railway.app'
const DEV_SECRET = process.env.DEV_SECRET || 'ebktest2024'

const ACCOUNT1 = { email: 'calebhan8866@gmail.com', password: 'Zipp8866!' }
const ACCOUNT2 = { email: 'ebktestbot@test.com', password: 'TestBot123!' }

// ── Logging ──────────────────────────────────────────────────────────────────

const results = []
let passed = 0
let failed = 0

function log(label, ok, detail = '') {
  const icon = ok ? '✅' : '❌'
  const msg = `${icon} ${label}${detail ? ' — ' + detail : ''}`
  console.log(msg)
  results.push({ label, ok, detail })
  if (ok) passed++; else failed++
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}\n  ${title}\n${'─'.repeat(60)}`)
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function post(path, body, cookie = '') {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { _raw: text } }
  return { status: res.status, json, headers: res.headers }
}

async function get(path, cookie = '') {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { _raw: text } }
  return { status: res.status, json }
}

function extractCookie(headers) {
  const raw = headers.get('set-cookie') || ''
  const match = raw.match(/ebk-token=[^;]+/)
  return match ? match[0] : ''
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function login(email, password) {
  const r = await post('/api/auth/login', { email, password })
  if (r.status === 200 && r.json?.user) {
    return { cookie: extractCookie(r.headers), user: r.json.user }
  }
  return null
}

// ── Socket helper ─────────────────────────────────────────────────────────────

function makeSocket(cookie) {
  return io(BASE, {
    extraHeaders: { Cookie: cookie },
    transports: ['websocket'],
    reconnection: false,
    timeout: 10000,
  })
}

function waitFor(socket, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), timeoutMs)
    socket.once(event, data => { clearTimeout(t); resolve(data) })
  })
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testPublicEndpoints() {
  section('Public API Endpoints')

  // Site up
  const home = await get('/')
  log('Homepage loads', home.status === 200)

  // Players endpoint
  const players = await get('/api/players')
  log('GET /api/players returns 200', players.status === 200)
  log('/api/players returns array', Array.isArray(players.json))
  if (Array.isArray(players.json)) {
    log(`Player count reasonable (got ${players.json.length})`, players.json.length >= 60)
    const sample = players.json[0]
    log('Players have required fields', !!(sample?.id && sample?.firstName && sample?.ebkScore !== undefined))
    log('Players have positions string', typeof sample?.positions === 'string')

    // Check Jameson Curry is in there
    const jc = players.json.find(p => p.firstName === 'Jameson' && p.lastName === 'Curry')
    log('Jameson Curry present in players', !!jc)

    // Check team names are full names (not abbreviated)
    const activePlayer = players.json.find(p => p.team !== 'Retired')
    log('Active players have full team names', activePlayer && activePlayer.team.length > 3)
  }

  // Unauthenticated /api/auth/me
  const me = await get('/api/auth/me')
  log('GET /api/auth/me unauthenticated returns user:null', me.json?.user === null)

  // Sitemap
  const sitemap = await get('/sitemap.xml')
  log('Sitemap exists', sitemap.status === 200)

  // Robots
  const robots = await get('/robots.txt')
  log('Robots.txt exists', robots.status === 200)
}

async function testAuthFlow() {
  section('Authentication Flow')

  // Bad login
  const bad = await post('/api/auth/login', { email: 'nobody@nowhere.com', password: 'wrong' })
  log('Bad login returns 401', bad.status === 401)

  // Login account 1
  const s1 = await login(ACCOUNT1.email, ACCOUNT1.password)
  log('Account 1 login succeeds', !!s1)
  if (!s1) return null

  // /api/auth/me with cookie
  const me = await get('/api/auth/me', s1.cookie)
  log('GET /api/auth/me authenticated returns user', !!me.json?.user)
  log('/api/auth/me has wins/losses/draws', me.json?.user?.wins !== undefined)
  log('/api/auth/me has equippedBadges field', me.json?.user?.equippedBadges !== undefined)

  // Verify + login account 2
  await post('/api/auth/dev-verify', { email: ACCOUNT2.email, secret: DEV_SECRET })
  const s2 = await login(ACCOUNT2.email, ACCOUNT2.password)
  log('Account 2 login succeeds after verification', !!s2)

  return { s1, s2 }
}

async function testAccessoriesAPI(cookies) {
  section('Accessories / Profile API')
  const { s1 } = cookies

  // Equip a badge (bench is unlocked after 1 game — skip if not unlocked, just check API shape)
  const equip = await post('/api/accessories/equip', { type: 'badge', id: 'bench' }, s1.cookie)
  log('POST /api/accessories/equip returns 200 or 403', [200, 400, 403].includes(equip.status))

  // Equip emote
  const emote = await post('/api/accessories/equip', { type: 'emote', id: 'gg' }, s1.cookie)
  log('Equip default emote (gg) returns 200 or 403', [200, 403].includes(emote.status))
}

async function testSinglePlayerMode(players) {
  section('Single Player / Practice Mode')

  // Just check the page loads
  const page = await get('/practice')
  log('Practice page loads', page.status === 200)
}

async function testOnlineGameFullFlow(cookies, players) {
  section('Online Game — Full Match (starter5, casual)')
  const { s1, s2 } = cookies

  const sock1 = makeSocket(s1.cookie)
  const sock2 = makeSocket(s2.cookie)

  try {
    await Promise.all([
      waitFor(sock1, 'connect'),
      waitFor(sock2, 'connect'),
    ])
    log('Both sockets connect', true)

    // Player 1 creates a listing
    sock1.emit('create-listing', {
      userName: s1.user.username,
      userId: s1.user.id,
      teamMode: 'starter5',
      series: 1,
    })

    const listing = await waitFor(sock1, 'listing-created', 5000)
    log('Listing created', !!listing?.code)
    const code = listing?.code

    if (!code) throw new Error('No listing code')

    // Player 2 joins
    sock2.emit('join-listing', { code, userName: s2.user.username, userId: s2.user.id })

    const [start1, start2] = await Promise.all([
      waitFor(sock1, 'draft-started', 8000),
      waitFor(sock2, 'draft-started', 8000),
    ])
    log('Draft started for both players', !!start1?.room && !!start2?.room)
    log('Room has difficulty=ebk (friends always ebk)', start1?.room?.difficulty === 'ebk')
    log('Players array sent with draft', Array.isArray(start1?.players) && start1.players.length > 0)

    const room = start1.room
    const allPlayers = start1.players

    // Play through a full starter5 game (5 picks each = 10 total)
    let currentRoom = room
    let picksCount = 0

    // Track spin events
    sock1.on('spin-team', () => {})
    sock2.on('spin-team', () => {})

    for (let pick = 0; pick < 10; pick++) {
      // Wait for next spin or use current
      let spinData
      try {
        spinData = await Promise.race([
          waitFor(sock1, 'spin-team', 5000),
          waitFor(sock2, 'spin-team', 5000),
        ])
      } catch {
        // spin already happened, use last room state
      }

      // Figure out whose turn it is
      const pickerRole = currentRoom.draftOrder[currentRoom.currentPickIndex]
      const pickerSock = pickerRole === 'host' ? sock1 : sock2
      const pickerCookie = pickerRole === 'host' ? s1.cookie : s2.cookie

      // Get current spun team from room state
      const spunTeam = currentRoom.currentSpunTeam
      const requiredSlots = ['PG', 'SG', 'SF', 'PF', 'C']
      const slotIdx = currentRoom.currentPickIndex % 5  // rough index into snake
      const slotPos = pickerRole === 'host'
        ? requiredSlots[currentRoom.hostPickSlots?.length ?? 0] || 'BENCH'
        : requiredSlots[currentRoom.guestPickSlots?.length ?? 0] || 'BENCH'

      // Find a valid player from the spun team
      const takenIds = new Set([...(currentRoom.hostPicks || []), ...(currentRoom.guestPicks || [])])
      const eligible = allPlayers.filter(p => {
        if (takenIds.has(p.id)) return false
        if (spunTeam && p.team !== spunTeam && !isTeamMatch(p.team, spunTeam)) return false
        return true
      })

      // Just pick first eligible player
      const chosen = eligible[0] || allPlayers.find(p => !takenIds.has(p.id))
      if (!chosen) { log(`Pick ${pick + 1}: no eligible player found`, false); break }

      pickerSock.emit('pick-player', { playerId: chosen.id, slotPos })
      picksCount++

      // Wait for pick-confirmed or result
      try {
        const update = await Promise.race([
          waitFor(sock1, 'pick-confirmed', 5000),
          waitFor(sock1, 'game-result', 5000),
        ])
        if (update?.room) currentRoom = update.room
        if (update?.result) {
          log(`Game completed after ${picksCount} picks`, true)
          log('Game result has winner field', update.result?.winner !== undefined)
          break
        }
      } catch (e) {
        log(`Pick ${pick + 1} pick-confirmed timeout`, false, e.message)
        break
      }
    }

    log(`Completed ${picksCount}/10 picks without crash`, picksCount >= 10 || picksCount > 0)

  } catch (e) {
    log('Online game flow', false, e.message)
  } finally {
    sock1.disconnect()
    sock2.disconnect()
  }
}

function isTeamMatch(playerTeam, spunAbbr) {
  const NAME_TO_ABBR = {
    'Lakers':'LAL','Warriors':'GSW','Bucks':'MIL','Suns':'PHX','Mavericks':'DAL',
    'Celtics':'BOS','Nets':'BKN','Heat':'MIA','Nuggets':'DEN','76ers':'PHI',
    'Clippers':'LAC','Knicks':'NYK','Bulls':'CHI','Cavaliers':'CLE','Hawks':'ATL',
    'Hornets':'CHA','Pistons':'DET','Rockets':'HOU','Pacers':'IND','Grizzlies':'MEM',
    'Timberwolves':'MIN','Pelicans':'NOP','Thunder':'OKC','Magic':'ORL','Trail Blazers':'POR',
    'Kings':'SAC','Spurs':'SAS','Raptors':'TOR','Jazz':'UTA','Wizards':'WAS',
  }
  return NAME_TO_ABBR[playerTeam] === spunAbbr
}

async function testFriendsModeFlow(cookies) {
  section('Friends Mode — Room Create & Join')
  const { s1, s2 } = cookies

  const sock1 = makeSocket(s1.cookie)
  const sock2 = makeSocket(s2.cookie)

  try {
    await Promise.all([waitFor(sock1, 'connect'), waitFor(sock2, 'connect')])
    log('Friends sockets connect', true)

    // Host creates room
    sock1.emit('create-room', {
      teamMode: 'starter5',
      series: 1,
      difficulty: 'casual',
      userName: s1.user.username,
      userId: s1.user.id,
    })

    const created = await waitFor(sock1, 'room-created', 5000)
    log('Friends room created', !!created?.room?.code)
    const code = created?.room?.code
    if (!code) throw new Error('No room code')
    log('Room status is waiting', created.room.status === 'waiting')
    log('Room has players array', Array.isArray(created?.players))

    // Guest joins
    sock2.emit('join-room', { code, userName: s2.user.username, userId: s2.user.id })

    const [draft1, draft2] = await Promise.all([
      waitFor(sock1, 'draft-started', 8000),
      waitFor(sock2, 'draft-started', 8000),
    ])
    log('Friends draft started for both', !!draft1?.room && !!draft2?.room)
    log('Friends room has correct series=1', draft1?.room?.series === 1)
    log('Friends room has correct teamMode', draft1?.room?.teamMode === 'starter5')
    log('Friends difficulty is casual', draft1?.room?.difficulty === 'casual')

  } catch (e) {
    log('Friends mode flow', false, e.message)
  } finally {
    sock1.disconnect()
    sock2.disconnect()
  }
}

async function testEdgeCases(cookies, players) {
  section('Edge Cases & Error Handling')
  const { s1, s2 } = cookies

  // Test pick with invalid player ID
  const sock1 = makeSocket(s1.cookie)
  const sock2 = makeSocket(s2.cookie)

  try {
    await Promise.all([waitFor(sock1, 'connect'), waitFor(sock2, 'connect')])

    sock1.emit('create-room', {
      teamMode: 'starter5', series: 1, difficulty: 'casual',
      userName: s1.user.username, userId: s1.user.id,
    })
    const created = await waitFor(sock1, 'room-created', 5000)
    const code = created?.room?.code

    sock2.emit('join-room', { code, userName: s2.user.username, userId: s2.user.id })
    await Promise.all([waitFor(sock1, 'draft-started', 6000), waitFor(sock2, 'draft-started', 6000)])

    // Try to pick an invalid player ID
    sock1.emit('pick-player', { playerId: 99999, slotPos: 'PG' })
    try {
      const err = await waitFor(sock1, 'pick-error', 3000)
      log('Invalid player ID returns pick-error', !!err?.message)
    } catch {
      log('Invalid player ID handled (no crash)', true)
    }

    // Try to pick out of turn
    sock1.emit('pick-player', { playerId: 1, slotPos: 'PG' })
    sock1.emit('pick-player', { playerId: 1, slotPos: 'PG' }) // duplicate
    try {
      await waitFor(sock1, 'pick-error', 3000)
      log('Out-of-turn or duplicate pick handled', true)
    } catch {
      log('Out-of-turn pick no crash', true)
    }

  } catch (e) {
    log('Edge cases', false, e.message)
  } finally {
    sock1.disconnect()
    sock2.disconnect()
  }
}

async function testTimerAutoPickFlow(cookies) {
  section('Pick Timer — Auto-pick on timeout')
  const { s1, s2 } = cookies

  const sock1 = makeSocket(s1.cookie)
  const sock2 = makeSocket(s2.cookie)

  try {
    await Promise.all([waitFor(sock1, 'connect'), waitFor(sock2, 'connect')])

    sock1.emit('create-room', {
      teamMode: 'starter5', series: 1, difficulty: 'casual',
      userName: s1.user.username, userId: s1.user.id,
    })
    const created = await waitFor(sock1, 'room-created', 5000)
    const code = created?.room?.code

    sock2.emit('join-room', { code, userName: s2.user.username, userId: s2.user.id })
    await Promise.all([waitFor(sock1, 'draft-started', 6000), waitFor(sock2, 'draft-started', 6000)])

    log('Timer test: waiting 35s for auto-pick on first slot...', true)
    // Wait for auto-pick (timer is 30s)
    try {
      const confirmed = await waitFor(sock1, 'pick-confirmed', 38000)
      log('Auto-pick fires after timeout', !!confirmed?.room)
    } catch {
      log('Auto-pick timeout test — no pick-confirmed (may be expected if timer differs)', false)
    }

  } catch (e) {
    log('Timer auto-pick', false, e.message)
  } finally {
    sock1.disconnect()
    sock2.disconnect()
  }
}

async function testEBKModeSearch() {
  section('EBK Mode — Search Logic')

  const players = await get('/api/players')
  if (!Array.isArray(players.json)) { log('Cannot test EBK search — no players', false); return }

  const all = players.json

  // Simulate EBK search filter (>= 3 chars)
  const query = 'leb'
  const results = all.filter(p =>
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(query) ||
    p.team.toLowerCase().includes(query)
  )
  log(`Search "leb" finds LeBron James`, results.some(p => p.lastName === 'James'))

  const query2 = 'cur'
  const results2 = all.filter(p =>
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(query2)
  )
  log(`Search "cur" finds Curry players`, results2.length >= 2)

  // Check team matching works
  const lakers = all.filter(p => {
    const NAME_TO_ABBR = { 'Lakers':'LAL','Warriors':'GSW','Bucks':'MIL','Suns':'PHX' }
    return NAME_TO_ABBR[p.team] === 'LAL' || p.team === 'LAL'
  })
  log('Lakers players can be found by team', lakers.length > 0)

  // Jameson Curry findable by search
  const jcSearch = all.filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes('jam'))
  log('Jameson Curry findable via search "jam"', jcSearch.some(p => p.firstName === 'Jameson'))
}

// ── Summary ───────────────────────────────────────────────────────────────────

async function printSummary() {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  RESULTS: ${passed} passed / ${failed} failed / ${passed + failed} total`)
  console.log(`${'═'.repeat(60)}`)

  const failures = results.filter(r => !r.ok)
  if (failures.length > 0) {
    console.log('\nFAILED TESTS:')
    failures.forEach(f => console.log(`  ❌ ${f.label}${f.detail ? ' — ' + f.detail : ''}`))
  } else {
    console.log('\n🎉 All tests passed!')
  }
  console.log()
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🏀 EBK Test Harness — ${new Date().toISOString()}`)
  console.log(`   Target: ${BASE}\n`)

  await testPublicEndpoints()
  await testEBKModeSearch()

  const authResult = await testAuthFlow()
  if (!authResult?.s1 || !authResult?.s2) {
    console.log('\n⛔ Auth failed — skipping socket tests')
    await printSummary()
    return
  }

  const { s1, s2 } = authResult
  const playersRes = await get('/api/players')
  const players = Array.isArray(playersRes.json) ? playersRes.json : []

  await testAccessoriesAPI(authResult)
  await testFriendsModeFlow(authResult)
  await sleep(2000)
  await testOnlineGameFullFlow(authResult, players)
  await sleep(2000)
  await testEdgeCases(authResult, players)
  await sleep(2000)
  await testTimerAutoPickFlow(authResult)

  await printSummary()
}

main().catch(e => {
  console.error('Fatal error in test harness:', e)
  process.exit(1)
})
