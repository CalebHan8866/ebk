export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

let cache: { data: unknown; at: number } | null = null
const CACHE_TTL = 60 * 1000 // 1 minute

export async function GET() {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL) return NextResponse.json(cache.data)

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
  const result = { users }
  cache = { data: result, at: now }
  return NextResponse.json(result)
}
