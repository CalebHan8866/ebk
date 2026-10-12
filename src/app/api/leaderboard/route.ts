export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
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
  return NextResponse.json({ users })
}
