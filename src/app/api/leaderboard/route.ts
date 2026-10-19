export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/db'

interface CacheEntry { data: unknown; at: number }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL = 30 * 1000 // 30 seconds
const CACHE_MAX_ENTRIES = 500 // hard cap — evict all expired entries when exceeded

export async function GET(request: NextRequest) {
  try {
  const now = Date.now()

  // Check if the request includes a logged-in user
  const cookieStore = await cookies()
  const token = cookieStore.get('ebk-token')?.value
  const payload = token ? await verifyToken(token) : null

  // Cache per userId (or 'anon') so each user's rank data is cached independently
  const cacheKey = payload?.userId ?? 'anon'
  const cached = cache.get(cacheKey)
  if (cached && now - cached.at < CACHE_TTL) {
    return NextResponse.json(cached.data)
  }

  const [users, totalPlayers] = await Promise.all([
    prisma.user.findMany({
      where: { gamesPlayed: { gt: 0 } },
      select: {
        id: true,
        username: true,
        wins: true,
        losses: true,
        draws: true,
        gamesPlayed: true,
        winStreak: true,
        maxWinStreak: true,
        equippedBadges: true,
      },
      orderBy: [{ wins: 'desc' }, { gamesPlayed: 'desc' }],
      take: 100,
    }),
    prisma.user.count({ where: { gamesPlayed: { gt: 0 } } }),
  ])

  let me: {
    id: string; username: string; wins: number; losses: number; draws: number
    gamesPlayed: number; winStreak: number; maxWinStreak: number
    equippedBadges: string; rank: number
  } | null = null

  if (payload?.userId) {
    // Check if the user is already in the top-100 result to avoid an extra DB round trip
    const inTop100 = users.find(u => u.id === payload.userId)
    const myUser = inTop100 ?? await prisma.user.findUnique({
      where: { id: payload.userId },
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
  // Prune expired entries; if still over the hard cap after pruning, evict the
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
  cache.set(cacheKey, { data: result, at: now })
  return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
