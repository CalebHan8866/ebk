/**
 * EBK Load Test
 * Tests the app under realistic multi-user load:
 *   1. Bulk account creation (bypasses rate limit via admin endpoint)
 *   2. Concurrent logins  (X-Load-Test-Secret bypasses per-IP limit)
 *   3. Concurrent Socket.IO connections
 *   4. API endpoint stress (leaderboard, players, history)
 *   5. Concurrent online matchmaking — full draft games
 *   6. Concurrent friends rooms
 *
 * Usage:
 *   node load-test.mjs [users] [concurrentGames]
 *   node load-test.mjs 100 10
 *   node load-test.mjs 500 40   ← stress test
 */

import { io } from 'socket.io-client'

const BASE    = process.env.LOAD_TEST_URL || 'https://ebk-production.up.railway.app'
const SECRET  = process.env.DEV_SECRET    || 'ebktest2024'
const PASSWORD = 'TestPass123!'
const PREFIX   = 'LoadBot'

const TARGET_USERS     = parseInt(process.argv[2] || '100')
const CONCURRENT_GAMES = parseInt(process.argv[3] || '10')

// ── Timing helpers ────────────────────────────────────────────────────────────

const timings = {}
function recordTiming(key, ms) {
  if (!timings[key]) timings[key] = []
  timings[key].push(ms)
}
function pct(arr, p) { return arr[Math.floor(arr.length * p)] }
function stats(arr) {
  if (!arr?.length) return 'no data'
  const s = [...arr].sort((a, b) => a - b)
  return `avg=${Math.round(s.reduce((x, v) => x + v, 0) / s.length)}ms  p50=${pct(s, 0.5)}ms  p95=${pct(s, 0.95)}ms  max=${s[s.length - 1]}ms`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function http(method, path, body, cookie, extraHeaders = {}) {
  const t0 = Date.now()
  const headers = { 'Content-Type': 'application/json', ...extraHeaders }
  if (cookie) headers['Cookie'] = cookie
  const res = await fetch(`${BASE}${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const ms = Date.now() - t0
  let json
  try { json = await res.json() } catch { json = null }
  return { status: res.status, json, ms, headers: res.headers }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

let errors = 0, passed = 0
function pass(msg) { process.stdout.write(`  ✅ ${msg}\n`); passed++ }
function fail(msg) { process.stdout.write(`  ❌ ${msg}\n`); errors++ }
function warn(msg) { process.stdout.write(`  ⚠️  ${msg}\n`) }
function log(label, ok, detail = '') {
  ok ? pass(`${label}${detail ? '  ' + detail : ''}`) : fail(`${label}${detail ? '  ' + detail : ''}`)
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

function waitFor(sock, event, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout:${event}`)), timeoutMs)
    sock.once(event, data => { clearTimeout(t); resolve(data) })
  })
}

// ── Step 1: Create test accounts ──────────────────────────────────────────────

async function createAccounts(count) {
  console.log(`\n[1/6] Creating ${count} test accounts...`)
  const t0 = Date.now()
  const res = await http('POST', '/api/admin/create-test-users', { secret: SECRET, count, prefix: PREFIX })
  if (res.status !== 200) { fail(`Bulk create: ${res.status} ${JSON.stringify(res.json)}`); return false }
  log(`Bulk-created ${res.json.created} accounts`, res.json.created > 0, `(${Date.now() - t0}ms, skipped=${res.json.skipped})`)
  return true
}

// ── Step 2: Concurrent logins ─────────────────────────────────────────────────

async function loginAll(count) {
  console.log(`\n[2/6] Logging in ${count} users concurrently...`)
  const t0 = Date.now()
  const cookies = {}
  let ok = 0, bad = 0

  // 50 at a time, X-Load-Test-Secret bypasses rate limiter
  const chunks = []
  for (let i = 0; i < count; i += 50) chunks.push(Array.from({ length: Math.min(50, count - i) }, (_, j) => i + j + 1))

  for (const chunk of chunks) {
    const results = await Promise.all(chunk.map(async i => {
      const username = `${PREFIX}${String(i).padStart(4, '0')}`
      const email    = `${username.toLowerCase()}@ebk-load-test.internal`
      const t = Date.now()
      const res = await http('POST', '/api/auth/login', { email, password: PASSWORD }, null, { 'x-load-test-secret': SECRET })
      recordTiming('login', Date.now() - t)
      const setCookie = res.headers.get('set-cookie') || ''
      const token = setCookie.match(/ebk-token=([^;]+)/)?.[1]
      return { i, username, ok: res.status === 200 && !!token, cookie: token ? `ebk-token=${token}` : null }
    }))
    for (const r of results) {
      if (r.ok) { cookies[r.i] = { username: r.username, cookie: r.cookie }; ok++ }
      else bad++
    }
    await sleep(50)
  }

  log(`Logins: ${ok} ok / ${bad} failed`, bad === 0, `(${Date.now() - t0}ms)`)
  console.log(`   Login timing: ${stats(timings.login)}`)
  return cookies
}

// ── Step 3: Connect sockets ───────────────────────────────────────────────────

async function connectSockets(cookies) {
  console.log(`\n[3/6] Opening ${Object.keys(cookies).length} Socket.IO connections...`)
  const t0 = Date.now()
  const sockets = {}
  let connOk = 0, connFail = 0

  const entries = Object.entries(cookies)
  const chunks = []
  for (let i = 0; i < entries.length; i += 50) chunks.push(entries.slice(i, i + 50))

  for (const chunk of chunks) {
    await Promise.all(chunk.map(([idx, { username, cookie }]) =>
      new Promise(resolve => {
        const t = Date.now()
        const sock = makeSocket(cookie)
        const timeout = setTimeout(() => { connFail++; sock.disconnect(); resolve() }, 8000)
        sock.on('connect', () => {
          clearTimeout(timeout)
          recordTiming('socket_connect', Date.now() - t)
          sockets[idx] = { sock, username, cookie }
          connOk++
          resolve()
        })
        sock.on('connect_error', () => { clearTimeout(timeout); connFail++; resolve() })
      })
    ))
    await sleep(50)
  }

  log(`Sockets: ${connOk} connected / ${connFail} failed`, connFail === 0, `(${Date.now() - t0}ms)`)
  console.log(`   Connect timing: ${stats(timings.socket_connect)}`)
  return sockets
}

// ── Step 4: API stress ────────────────────────────────────────────────────────

async function stressAPIs(cookies) {
  console.log(`\n[4/6] Stress-testing API endpoints (50 concurrent each)...`)
  const cookieList = Object.values(cookies).map(c => c.cookie)

  for (const ep of [
    { path: '/api/players',       auth: false },
    { path: '/api/leaderboard',   auth: false },
    { path: '/api/auth/me',       auth: true  },
    { path: '/api/games/history', auth: true  },
  ]) {
    const reqs = Array.from({ length: 50 }, (_, i) => {
      const cookie = ep.auth ? cookieList[i % cookieList.length] : undefined
      return http('GET', ep.path, null, cookie).then(r => { recordTiming(ep.path, r.ms); return r.status })
    })
    const statuses = await Promise.all(reqs)
    const ok200 = statuses.filter(s => s === 200).length
    log(`${ep.path}: ${ok200}/50 ok`, ok200 === 50, stats(timings[ep.path]))
    const bad = statuses.filter(s => s !== 200)
    if (bad.length) warn(`   Non-200: ${[...new Set(bad)].join(', ')}`)
  }
}

// ── Step 5: Concurrent online matchmaking ─────────────────────────────────────

// Map old team abbreviations → current franchise (mirrors server TEAM_LINEAGE)
const LINEAGE = {
  STL:'ATL',MHK:'ATL',TCB:'ATL',TRI:'ATL',
  NJN:'BKN',NJA:'BKN',NYN:'BKN',
  CHH:'CHA',CHB:'CHA',
  DNV:'DEN',
  FTW:'DET',
  SFW:'GSW',PHW:'GSW',
  SDR:'HOU',
  SDC:'LAC',BUF:'LAC',
  MNL:'LAL',
  VAN:'MEM',
  NOH:'NOP',NOK:'NOP',
  SEA:'OKC',
  SYR:'PHI',
  PHO:'PHX',
  KCK:'SAC',KCO:'SAC',CIN:'SAC',ROC:'SAC',
  NOJ:'UTA',
  WSB:'WAS',CAP:'WAS',BAL:'WAS',BLB:'WAS',CHZ:'WAS',
}
function normTeam(t) { return LINEAGE[t] || t }

function pickFirstValid(players, spunTeam, takenIds, usedPositions, benchUsed, teamSize) {
  const starters = ['PG', 'SG', 'SF', 'PF', 'C']
  const benchRemaining = (teamSize - 5) - benchUsed

  for (const p of players) {
    if (normTeam(p.team) !== spunTeam) continue
    if (takenIds.has(p.id)) continue
    const pPos = p.positions ? p.positions.split(',') : [p.position]
    for (const pos of pPos) {
      if (starters.includes(pos) && !usedPositions.has(pos)) {
        return { playerId: p.id, slotPos: pos }
      }
    }
    if (benchRemaining > 0) {
      return { playerId: p.id, slotPos: 'BENCH' }
    }
  }
  return null
}

async function runConcurrentGames(sockets, numGames) {
  console.log(`\n[5/6] Running ${numGames} simultaneous online games...`)
  const entries = Object.values(sockets)
  if (entries.length < numGames * 2) {
    warn(`Only ${entries.length} sockets — running ${Math.floor(entries.length / 2)} games`)
    numGames = Math.floor(entries.length / 2)
  }

  const t0 = Date.now()
  let gamesOk = 0, gamesFail = 0
  const gameTimings = []

  await Promise.all(Array.from({ length: numGames }, async (_, i) => {
    const hostEntry = entries[i * 2]
    const guestEntry = entries[i * 2 + 1]
    const { sock: hostSock, username: hostName } = hostEntry
    const { sock: guestSock, username: guestName } = guestEntry
    const gt0 = Date.now()

    try {
      // Host creates listing
      hostSock.emit('create-listing', { teamMode: 'starter5', series: 1, userName: hostName, userId: null })
      const { code } = await waitFor(hostSock, 'listing-created', 8000)

      // Guest joins listing
      guestSock.emit('join-listing', { code, userName: guestName, userId: null })

      // Both get match-found
      await Promise.all([waitFor(hostSock, 'match-found', 8000), waitFor(guestSock, 'match-found', 8000)])

      // Buffer pick-timer-start events BEFORE awaiting draft-started —
      // the server sends both nearly simultaneously and we'd miss the first one.
      const timerBuf = []
      let timerWaiter = null
      const onTimer = (data) => {
        if (timerWaiter) { const r = timerWaiter; timerWaiter = null; r(data) }
        else timerBuf.push(data)
      }
      hostSock.on('pick-timer-start', onTimer)
      guestSock.on('pick-timer-start', onTimer)

      // Also buffer pick-timeout (auto-picks) to track taken IDs
      const autoTaken = []
      const onTimeout = ({ pickedId }) => { if (pickedId) autoTaken.push(pickedId) }
      hostSock.on('pick-timeout', onTimeout)

      // Both accept
      hostSock.emit('confirm-ready', { code })
      guestSock.emit('confirm-ready', { code })

      // Wait for draft-started
      const [draftData] = await Promise.all([
        waitFor(hostSock, 'draft-started', 10000),
        waitFor(guestSock, 'draft-started', 10000),
      ])
      const players = draftData.players || []
      const teamSize = 5 // starter5

      // Terminal event: resolves as soon as game ends for any reason
      let terminalResolve, terminalReject
      const terminalPromise = new Promise((res, rej) => { terminalResolve = res; terminalReject = rej })
      const termTimeout = setTimeout(() => terminalReject(new Error('timeout:terminal')), 120000)
      const onTerminal = (d) => { clearTimeout(termTimeout); terminalResolve(d) }
      hostSock.once('game-result',         onTerminal)
      hostSock.once('series-complete',     onTerminal)
      hostSock.once('player-disqualified', onTerminal)

      function nextTimer(ms = 35000) {
        return new Promise((res, rej) => {
          if (timerBuf.length) { res(timerBuf.shift()); return }
          const t = setTimeout(() => { timerWaiter = null; rej(new Error('timeout:pick-timer-start')) }, ms)
          timerWaiter = (d) => { clearTimeout(t); res(d) }
        })
      }

      const takenIds = new Set()
      const usedPositions = { host: new Set(), guest: new Set() }
      const benchUsed = { host: 0, guest: 0 }

      // Drive the pick loop — bail out as soon as the game ends
      const pickLoop = (async () => {
        for (let pick = 0; pick < 10; pick++) {
          autoTaken.forEach(id => takenIds.add(id))
          autoTaken.length = 0

          // Wait for next timer OR game over, whichever comes first
          let timerData
          try {
            timerData = await Promise.race([nextTimer(42000), terminalPromise.then(() => null)])
          } catch { break } // nextTimer timeout — game likely ended without our listener catching it
          if (!timerData) break // game ended via terminal event

          const { picker, spunTeam } = timerData
          const pickerKey = picker === 'host' ? 'host' : 'guest'
          const activeSock = picker === 'host' ? hostSock : guestSock

          const choice = pickFirstValid(players, spunTeam, takenIds, usedPositions[pickerKey], benchUsed[pickerKey], teamSize)
          if (!choice) continue

          takenIds.add(choice.playerId)
          if (choice.slotPos === 'BENCH') benchUsed[pickerKey]++
          else usedPositions[pickerKey].add(choice.slotPos)

          activeSock.emit('pick-player', { code, playerId: choice.playerId, position: choice.slotPos })
          await sleep(80)
        }
      })().catch(() => {})

      // Wait for game to fully end
      await terminalPromise

      // Cleanup
      hostSock.off('pick-timer-start', onTimer)
      guestSock.off('pick-timer-start', onTimer)
      hostSock.off('pick-timeout', onTimeout)
      hostSock.off('game-result',         onTerminal)
      hostSock.off('series-complete',     onTerminal)
      hostSock.off('player-disqualified', onTerminal)

      gameTimings.push(Date.now() - gt0)
      gamesOk++
    } catch (e) {
      gamesFail++
    }
  }))

  log(`Online games: ${gamesOk}/${numGames} completed`, gamesFail === 0,
    `(${Date.now() - t0}ms wall, avg game=${gameTimings.length ? Math.round(gameTimings.reduce((s, v) => s + v, 0) / gameTimings.length) : '?'}ms)`)
  if (gamesFail) warn(`   ${gamesFail} game(s) failed`)
}

// ── Step 6: Friends rooms ─────────────────────────────────────────────────────

async function runFriendsRooms(sockets, numRooms) {
  console.log(`\n[6/6] Running ${numRooms} simultaneous friends rooms...`)
  const entries = Object.values(sockets)
  numRooms = Math.min(numRooms, Math.floor(entries.length / 2))
  const offset = Math.floor(entries.length / 2)

  let ok = 0, fail_ = 0
  await Promise.all(Array.from({ length: numRooms }, async (_, i) => {
    const s1 = entries[offset + i * 2]?.sock
    const s2 = entries[offset + i * 2 + 1]?.sock
    const u1 = entries[offset + i * 2]?.username
    const u2 = entries[offset + i * 2 + 1]?.username
    if (!s1 || !s2) return
    try {
      s1.emit('create-room', { teamMode: 'starter5', series: 1, difficulty: 'casual', userName: u1, userId: null })
      const { room } = await waitFor(s1, 'room-created', 6000)
      s2.emit('join-room', { code: room.code, userName: u2, userId: null })
      await waitFor(s2, 'draft-started', 8000)
      ok++
    } catch { fail_++ }
  }))

  log(`Friends rooms: ${ok}/${numRooms} ok`, fail_ === 0, fail_ ? `(${fail_} failed)` : '')
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  EBK LOAD TEST — ${TARGET_USERS} users / ${CONCURRENT_GAMES} concurrent games`)
  console.log(`  Target: ${BASE}`)
  console.log(`${'═'.repeat(60)}`)

  if (!await createAccounts(TARGET_USERS)) process.exit(1)
  const cookies = await loginAll(TARGET_USERS)
  if (Object.keys(cookies).length < 4) { console.log('\nAbort: not enough logins'); process.exit(1) }

  const sockets = await connectSockets(cookies)
  await stressAPIs(cookies)
  await runConcurrentGames(sockets, Math.min(CONCURRENT_GAMES, Math.floor(Object.keys(sockets).length / 2)))
  await runFriendsRooms(sockets, Math.min(5, Math.floor(Object.keys(sockets).length / 4)))

  Object.values(sockets).forEach(({ sock }) => sock.disconnect())

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  LOAD TEST RESULTS`)
  console.log(`${'═'.repeat(60)}`)
  console.log(`  Users created:   ${TARGET_USERS}`)
  console.log(`  Logins OK:       ${Object.keys(cookies).length}`)
  console.log(`  Sockets OK:      ${Object.keys(sockets).length}`)
  console.log(`  Passed:          ${passed}`)
  console.log(`  Failed:          ${errors}`)
  console.log()
  console.log(`  Timings:`)
  for (const [k, v] of Object.entries(timings)) {
    console.log(`    ${k.padEnd(26)} ${stats(v)}`)
  }
  console.log()
  if (errors === 0) console.log(`  🟢 ALL PASSED — app handles ${TARGET_USERS} users cleanly`)
  else              console.log(`  🔴 ${errors} FAILURE(S) — review above`)
  console.log(`${'═'.repeat(60)}\n`)
  process.exit(errors > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
