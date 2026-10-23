export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/ratelimit'

interface CacheEntry { data: unknown; at: number }
const cache = new Map<string, CacheEntry>()
const SWR_TTL   = 30 * 1000 // serve stale, trigger background refresh after 30s
const CACHE_TTL = 60 * 1000 // hard expiry — block on fresh fetch after 60s
const CACHE_MAX_ENTRIES = 500 // hard cap — evict all expired entries when exceeded

// Background refresh guard: one in-flight refresh per cache key at a time
const refreshing = new Map<string, boolean>()

// Inflight guard: if a DB fetch is already in progress for a given cache key,
// subsequent cold-cache requests attach to the same Promise rather than each
// issuing their own query. Without this, N simultaneous requests on a cold cache
// would all miss, all hit the DB, and all race to overwrite the cache entry —
// a classic thundering-herd problem that's especially costly for leaderboard
// queries (top-100 users + rank count = 2–3 Postgres round-trips per request).
const inflight = new Map<string, Promise<unknown>>()

const USER_SELECT = {
  id: true,
  username: true,
  wins: true,
  losses: true,
  draws: true,
  gamesPlayed: true,
  winStreak: true,
  maxWinStreak: true,
  equippedBadges: true,
} as const

async function fetchLeaderboardData(userId: string | undefined, now: number): Promise<unknown> {
  // Fetch separate top-100 pools for each sort dimension so that the correct
  // players appear regardless of which tab the client is viewing.
  //
  // Problem with a single "top 100 by wins" query: a player with 8 wins and
  // 100% win rate (or a 20-game hot streak) may not be in the top 100 by raw
  // wins, making them invisible on the Win% and Hot Streak tabs.
  //
  // Fix: union top-100-by-wins with top-100-by-winStreak, deduplicate by id,
  // and return the merged set (≤ 200 rows). For Win%, fetching by wins already
  // covers most candidates; users outside the top-200-by-wins with an extreme
  // win rate are rare enough that this sample is representative in practice.
  const [byWins, byStreak, totalPlayers] = await Promise.all([
    prisma.user.findMany({
      where: { gamesPlayed: { gt: 0 } },
      select: USER_SELECT,
      orderBy: [{ wins: 'desc' }, { gamesPlayed: 'desc' }],
      take: 100,
    }),
    prisma.user.findMany({
      where: { gamesPlayed: { gt: 0 } },
      select: USER_SELECT,
      orderBy: [{ winStreak: 'desc' }, { wins: 'desc' }],
      take: 100,
    }),
    prisma.user.count({ where: { gamesPlayed: { gt: 0 } } }),
  ])

  // Deduplicate: start with byWins (already ordered), then append any streak
  // leaders not already in that set.
  const seen = new Set(byWins.map(u => u.id))
  const users = [...byWins, ...byStreak.filter(u => !seen.has(u.id))]

  let me: {
    id: string; username: string; wins: number; losses: number; draws: number
    gamesPlayed: number; winStreak: number; maxWinStreak: number
    equippedBadges: string; rank: number
  } | null = null

  if (userId) {
    // Check if the user is already in the top-100 result to avoid an extra DB round trip
    const inTop100 = users.find(u => u.id === userId)
    const myUser = inTop100 ?? await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, username: true, wins: true, losses: true, draws: true,
        gamesPlayed: true, winStreak: true, maxWinStreak: true, equippedBadges: true,
      },
    })
    if (myUser && myUser.gamesPlayed > 0) {
      // Rank = number of players with strictly more wins + 1
      const ahead = await prisma.user.count({
        where: { gamesPlayed: { gt: 0 }, wins: { gt: myUser.wins } },
      })
      me = { ...myUser, rank: ahead + 1 }
    }
  }

  const result = { users, totalPlayers, me }

  // Prune hard-expired entries; if still over the hard cap after pruning, evict the
  // oldest quarter by insertion order rather than clearing the entire map.
  // cache.clear() would cause a stampede where every cached user simultaneously
  // misses and hammers the DB — LRU-style partial eviction avoids that.
  cache.forEach((entry, key) => {
    if (now - entry.at >= CACHE_TTL) cache.delete(key)
  })
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const evict = Math.floor(cache.size / 4)
    const keys = Array.from(cache.keys()).slice(0, evict)
    for (const key of keys) cache.delete(key)
  }
  cache.set(userId ?? 'anon', { data: result, at: now })

  return result
}

export async function GET(request: NextRequest) {
  try {
  const now = Date.now()

  const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  // Rate limit: 60 requests per minute per IP — enough for rapid page refreshes by real users,
  // prevents automated scraping of username + stats data for account enumeration.
  const { success } = rateLimit(`leaderboard:${ip}`, 60, 60 * 1000)
  if (!success) return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 })

  // Check if the request includes a logged-in user
  const cookieStore = await cookies()
  const token = cookieStore.get('ebk-token')?.value
  const payload = token ? await verifyToken(token) : null

  // Cache per userId (or 'anon') so each user's rank data is cached independently
  const cacheKey = payload?.userId ?? 'anon'
  const cached = cache.get(cacheKey)
  const age = cached ? now - cached.at : Infinity

  if (age >= CACHE_TTL) {
    // Hard-expired — block on a fresh DB fetch before responding (thundering-herd
    // protection: attach to any already-inflight promise for this key)
    let promise = inflight.get(cacheKey)
    if (!promise) {
      promise = fetchLeaderboardData(payload?.userId, now).finally(() => {
        inflight.delete(cacheKey)
      })
      inflight.set(cacheKey, promise)
    }
    await promise
  } else if (age >= SWR_TTL) {
    // Stale but usable — serve immediately, kick off a background refresh
    if (!refreshing.get(cacheKey)) {
      refreshing.set(cacheKey, true)
      fetchLeaderboardData(payload?.userId, now).catch(err => {
        console.error('[leaderboard] Background cache refresh failed:', err)
      }).finally(() => {
        refreshing.delete(cacheKey)
      })
    }
  }
  // Fresh (age < SWR_TTL): serve from cache immediately, no refresh needed

  const result = cache.get(cacheKey)?.data
  return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
