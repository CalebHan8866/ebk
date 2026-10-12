/**
 * EBK Load Test
 * Tests the app under realistic multi-user load:
 *   - Bulk account creation (bypasses rate limit via admin endpoint)
 *   - Concurrent logins
 *   - Concurrent Socket.IO connections
 *   - Concurrent matchmaking (queue + match + full game)
 *   - Concurrent friends rooms
 *   - API endpoint stress (leaderboard, players, history)
 *
 * Usage:
 *   node load-test.mjs [users] [concurrentGames]
 *   node load-test.mjs 100 20    # 100 users, 20 simultaneous games
 *   node load-test.mjs 500 50    # 500 users, 50 simultaneous games (stress)
 */

import { io } from 'socket.io-client'

const BASE = process.env.LOAD_TEST_URL || 'https://ebk-production.up.railway.app'
const SECRET = process.env.DEV_SECRET || 'ebktest2024'
const PASSWORD = 'TestPass123!'
const PREFIX = 'LoadBot'

const TARGET_USERS  = parseInt(process.argv[2] || '100')
const CONCURRENT_GAMES = parseInt(process.argv[3] || '10')

// ── Timing helpers ────────────────────────────────────────────────────────────

const timings = {}
function recordTiming(key, ms) {
  if (!timings[key]) timings[key] = []
  timings[key].push(ms)
}
function stats(arr) {
  if (!arr?.length) return 'no data'
  const sorted = [...arr].sort((a, b) => a - b)
  const avg = (arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(0)
  return `avg=${avg}ms  p50=${sorted[Math.floor(arr.length * 0.5)]}ms  p95=${sorted[Math.floor(arr.length * 0.95)]}ms  max=${sorted[arr.length - 1]}ms`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function http(method, path, body, cookie) {
  const t0 = Date.now()
  const headers = { 'Content-Type': 'application/json' }
  if (cookie) headers['Cookie'] = cookie
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const ms = Date.now() - t0
  let json
  try { json = await res.json() } catch { json = null }
  return { status: res.status, json, ms, headers: res.headers }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function pass(msg) { process.stdout.write(`  ✅ ${msg}\n`) }
function fail(msg) { process.stdout.write(`  ❌ ${msg}\n`); errors++ }
function warn(msg) { process.stdout.write(`  ⚠️  ${msg}\n`) }

let errors = 0
let passed = 0

function log(label, ok, detail = '') {
  if (ok) { pass(`${label}${detail ? '  ' + detail : ''}`); passed++ }
  else     { fail(`${label}${detail ? '  ' + detail : ''}`) }
}

// ── Socket helper ─────────────────────────────────────────────────────────────

function makeSocket(cookie) {
  return io(BASE, {
    transports: ['websocket'],
    extraHeaders: cookie ? { Cookie: cookie } : {},
    timeout: 15000,
    reconnection: false,
  })
}

function waitFor(sock, event, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout:${event}`)), timeoutMs)
    sock.once(event, data => { clearTimeout(t); resolve(data) })
  })
}

// ── Step 1: Create test accounts ──────────────────────────────────────────────

async function createAccounts(count) {
  console.log(`\n[1/6] Creating ${count} test accounts via admin endpoint...`)
  const t0 = Date.now()
  const res = await http('POST', '/api/admin/create-test-users', { secret: SECRET, count, prefix: PREFIX })
  const ms = Date.now() - t0
  if (res.status !== 200) {
    fail(`Bulk create failed: ${res.status} ${JSON.stringify(res.json)}`)
    return false
  }
  log(`Bulk-created ${res.json.created} accounts`, res.json.created > 0, `(${ms}ms, skipped=${res.json.skipped})`)
  return true
}

// ── Step 2: Concurrent logins ─────────────────────────────────────────────────

async function loginAll(count) {
  console.log(`\n[2/6] Logging in ${count} users concurrently...`)
  const t0 = Date.now()

  const chunks = []
  for (let i = 0; i < count; i += 50) chunks.push(Array.from({ length: Math.min(50, count - i) }, (_, j) => i + j + 1))

  const cookies = {}
  let loginOk = 0, loginFail = 0

  for (const chunk of chunks) {
    const results = await Promise.all(chunk.map(async i => {
      const username = `${PREFIX}${String(i).padStart(4, '0')}`
      const email = `${username.toLowerCase()}@ebk-load-test.internal`
      const t = Date.now()
      const res = await http('POST', '/api/auth/login', { email, password: PASSWORD })
      recordTiming('login', Date.now() - t)
      if (res.status === 200) {
        const setCookie = res.headers.get('set-cookie') || ''
        const token = setCookie.match(/ebk-token=([^;]+)/)?.[1]
        return { i, username, cookie: token ? `ebk-token=${token}` : null, ok: true }
      }
      return { i, username, cookie: null, ok: false }
    }))
    for (const r of results) {
      if (r.ok && r.cookie) { cookies[r.i] = { username: r.username, cookie: r.cookie }; loginOk++ }
      else loginFail++
    }
    await sleep(100) // small pause between batches
  }

  const ms = Date.now() - t0
  log(`Logins: ${loginOk} ok / ${loginFail} failed`, loginFail === 0, `(${ms}ms total)`)
  console.log(`   Login timing: ${stats(timings.login)}`)
  return cookies
}

// ── Step 3: Concurrent socket connections ─────────────────────────────────────

async function connectSockets(cookies) {
  console.log(`\n[3/6] Opening ${Object.keys(cookies).length} Socket.IO connections concurrently...`)
  const t0 = Date.now()

  const sockets = {}
  const entries = Object.entries(cookies)

  const chunks = []
  for (let i = 0; i < entries.length; i += 50) chunks.push(entries.slice(i, i + 50))

  let connOk = 0, connFail = 0

  for (const chunk of chunks) {
    await Promise.all(chunk.map(([idx, { username, cookie }]) =>
      new Promise(resolve => {
        const t = Date.now()
        const sock = makeSocket(cookie)
        const timeout = setTimeout(() => {
          connFail++
          sock.disconnect()
          resolve()
        }, 8000)
        sock.on('connect', () => {
          clearTimeout(timeout)
          recordTiming('socket_connect', Date.now() - t)
          sockets[idx] = { sock, username, cookie }
          connOk++
          resolve()
        })
        sock.on('connect_error', () => {
          clearTimeout(timeout)
          connFail++
          resolve()
        })
      })
    ))
    await sleep(100)
  }

  const ms = Date.now() - t0
  log(`Sockets: ${connOk} connected / ${connFail} failed`, connFail === 0, `(${ms}ms total)`)
  console.log(`   Connect timing: ${stats(timings.socket_connect)}`)
  return sockets
}

// ── Step 4: API endpoint stress test ──────────────────────────────────────────

async function stressAPIs(cookies) {
  console.log(`\n[4/6] Stress-testing API endpoints (50 concurrent requests each)...`)
  const cookieList = Object.values(cookies).map(c => c.cookie)

  const endpoints = [
    { path: '/api/players', auth: false, label: '/api/players' },
    { path: '/api/leaderboard', auth: false, label: '/api/leaderboard' },
    { path: '/api/auth/me', auth: true, label: '/api/auth/me' },
    { path: '/api/games/history', auth: true, label: '/api/games/history' },
  ]

  for (const ep of endpoints) {
    const requests = Array.from({ length: 50 }, (_, i) => {
      const cookie = ep.auth ? cookieList[i % cookieList.length] : undefined
      return http('GET', ep.path, null, cookie).then(r => {
        recordTiming(ep.label, r.ms)
        return r.status
      })
    })
    const statuses = await Promise.all(requests)
    const ok200 = statuses.filter(s => s === 200).length
    const bad = statuses.filter(s => s !== 200)
    log(`${ep.label}: ${ok200}/50 ok`, bad.length === 0, stats(timings[ep.label]))
    if (bad.length) warn(`  Non-200 statuses: ${[...new Set(bad)].join(', ')}`)
  }
}

// ── Step 5: Concurrent matchmaking games ─────────────────────────────────────

async function runConcurrentGames(sockets, numGames) {
  console.log(`\n[5/6] Running ${numGames} simultaneous online games (${numGames * 2} players)...`)

  const entries = Object.values(sockets)
  if (entries.length < numGames * 2) {
    warn(`Not enough connected sockets (${entries.length}) for ${numGames} games — running ${Math.floor(entries.length / 2)}`)
    numGames = Math.floor(entries.length / 2)
  }

  const t0 = Date.now()
  let gamesCompleted = 0, gamesFailed = 0
  const gameTimings = []

  const gamePairs = Array.from({ length: numGames }, (_, i) => ({
    s1: entries[i * 2].sock,
    s2: entries[i * 2 + 1].sock,
    u1: entries[i * 2].username,
    u2: entries[i * 2 + 1].username,
  }))

  await Promise.all(gamePairs.map(async ({ s1, s2, u1, u2 }) => {
    const gt0 = Date.now()
    try {
      // Both queue up
      s1.emit('join-queue', { teamMode: 'starter5', series: 1, userName: u1, userId: null })
      s2.emit('join-queue', { teamMode: 'starter5', series: 1, userName: u2, userId: null })

      // Wait for match-found on both
      const [mf1] = await Promise.all([
        waitFor(s1, 'match-found', 12000),
        waitFor(s2, 'match-found', 12000),
      ])

      const code = mf1.code

      // Both accept
      await sleep(200)
      s1.emit('accept-match', { code })
      s2.emit('accept-match', { code })

      // Wait for draft-started
      await Promise.all([waitFor(s1, 'draft-started', 8000), waitFor(s2, 'draft-started', 8000)])

      // Play out all 10 picks (5 each)
      for (let pick = 0; pick < 10; pick++) {
        const [timerData] = await Promise.all([
          waitFor(s1, 'pick-timer-start', 8000),
          waitFor(s2, 'pick-timer-start', 8000).catch(() => null),
        ])
        const picker = timerData.picker
        const sock = picker === 'host' ? s1 : s2
        sock.emit('pick-player', { code, playerId: -1, position: timerData.spunTeam || 'BENCH' })
        // auto-pick will handle if -1 is invalid — wait for next timer or result
        await sleep(300)
      }

      // Wait for game result
      await Promise.all([
        waitFor(s1, 'game-result', 15000),
        waitFor(s2, 'game-result', 15000),
      ])

      gameTimings.push(Date.now() - gt0)
      gamesCompleted++
    } catch (e) {
      gamesFailed++
    }
  }))

  const ms = Date.now() - t0
  log(`Concurrent games: ${gamesCompleted}/${numGames} completed`, gamesFailed === 0,
    `(${ms}ms wall time, avg per game: ${gameTimings.length ? Math.round(gameTimings.reduce((s, v) => s + v, 0) / gameTimings.length) : '?'}ms)`)
  if (gamesFailed) warn(`  ${gamesFailed} games failed (timeouts count as failures)`)
}

// ── Step 6: Friends room stress ───────────────────────────────────────────────

async function runFriendsRoomStress(sockets, numRooms) {
  console.log(`\n[6/6] Running ${numRooms} simultaneous friends rooms...`)
  const entries = Object.values(sockets)
  if (entries.length < numRooms * 2) numRooms = Math.floor(entries.length / 2)

  // Use sockets that weren't used in matchmaking (take from the end)
  const offset = Math.min(entries.length - numRooms * 2, entries.length / 2 | 0)
  let roomsOk = 0, roomsFail = 0

  await Promise.all(Array.from({ length: numRooms }, async (_, i) => {
    const s1 = entries[offset + i * 2].sock
    const s2 = entries[offset + i * 2 + 1].sock
    const u1 = entries[offset + i * 2].username
    const u2 = entries[offset + i * 2 + 1].username
    try {
      s1.emit('create-room', { teamMode: 'starter5', series: 1, difficulty: 'casual', userName: u1, userId: null })
      const { room } = await waitFor(s1, 'room-created', 6000)
      s2.emit('join-room', { code: room.code, userName: u2, userId: null })
      await waitFor(s2, 'draft-started', 8000)
      roomsOk++
    } catch {
      roomsFail++
    }
  }))

  log(`Friends rooms: ${roomsOk}/${numRooms} created+joined`, roomsFail === 0,
    roomsFail ? `(${roomsFail} failed)` : '')
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const userCount = TARGET_USERS
  const gameCount = CONCURRENT_GAMES

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  EBK LOAD TEST  —  ${userCount} users  /  ${gameCount} concurrent games`)
  console.log(`  Target: ${BASE}`)
  console.log(`${'═'.repeat(60)}`)

  const memStart = process.memoryUsage().heapUsed / 1024 / 1024

  // 1. Create accounts
  const created = await createAccounts(userCount)
  if (!created) { console.log('\nAbort: could not create accounts.'); process.exit(1) }

  // 2. Login all
  const cookies = await loginAll(userCount)
  const loggedIn = Object.keys(cookies).length
  if (loggedIn < 4) { console.log('\nAbort: not enough logins.'); process.exit(1) }

  // 3. Connect sockets
  const sockets = await connectSockets(cookies)
  const connected = Object.keys(sockets).length

  // 4. API stress
  await stressAPIs(cookies)

  // 5. Concurrent matchmaking
  if (connected >= 2) {
    await runConcurrentGames(sockets, Math.min(gameCount, Math.floor(connected / 2)))
  }

  // 6. Friends rooms
  await runFriendsRoomStress(sockets, Math.min(5, Math.floor(connected / 4)))

  // Teardown
  Object.values(sockets).forEach(({ sock }) => sock.disconnect())

  const memEnd = process.memoryUsage().heapUsed / 1024 / 1024

  // ── Final report ─────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  LOAD TEST RESULTS`)
  console.log(`${'═'.repeat(60)}`)
  console.log(`  Users created:    ${userCount}`)
  console.log(`  Logins OK:        ${loggedIn}`)
  console.log(`  Sockets OK:       ${connected}`)
  console.log(`  Tests passed:     ${passed}`)
  console.log(`  Tests failed:     ${errors}`)
  console.log(`  Client heap:      ${memStart.toFixed(1)} MB → ${memEnd.toFixed(1)} MB`)
  console.log(``)
  console.log(`  Timings`)
  for (const [k, v] of Object.entries(timings)) {
    console.log(`    ${k.padEnd(28)} ${stats(v)}`)
  }

  if (errors === 0) {
    console.log(`\n  🟢 ALL PASSED — app handles ${userCount} users cleanly`)
  } else {
    console.log(`\n  🔴 ${errors} FAILURE(S) — see above`)
  }
  console.log(`${'═'.repeat(60)}\n`)

  process.exit(errors > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
