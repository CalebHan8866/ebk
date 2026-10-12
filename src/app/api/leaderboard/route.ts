export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/db'

let cache: { data: unknown; at: number } | null = null
const CACHE_TTL = 30 * 1000 // 30 seconds

export async function GET(request: NextRequest) {
  const now = Date.now()

  // Check if the request includes a logged-in user
  const cookieStore = await cookies()
  const token = cookieStore.get('ebk-token')?.value
  const payload = token ? await verifyToken(token) : null

  // Only use cache for unauthenticated requests (or when same user)
  const cacheKey = payload?.userId ?? 'anon'
  if (cache && now - cache.at < CACHE_TTL && (cache as any).key === cacheKey) {
    return NextResponse.json(cache.data)
  }

  const users = await prisma.user.findMany({
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
    orderBy: { wins: 'desc' },
    take: 100,
  })

  const totalPlayers = await prisma.user.count({ where: { gamesPlayed: { gt: 0 } } })

  let me: {
    id: string; username: string; wins: number; losses: number; draws: number
    gamesPlayed: number; winStreak: number; maxWinStreak: number
    equippedBadges: string; rank: number
  } | null = null

  if (payload?.userId) {
    const myUser = await prisma.user.findUnique({
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
  cache = { data: result, at: now, key: cacheKey } as any
  return NextResponse.json(result)
}
