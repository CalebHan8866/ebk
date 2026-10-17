export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('ebk-token')?.value
    if (!token) return NextResponse.json({ user: null })
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ user: null })
    const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true, username: true, email: true, wins: true, losses: true, draws: true, createdAt: true, gamesPlayed: true, winStreak: true, maxWinStreak: true, firstPickWins: true, firstPickGames: true, unlockedBadges: true, unlockedEmotes: true, unlockedMilestones: true, equippedBadge: true, equippedBadges: true, equippedEmote: true } })
    return NextResponse.json({ user })
  } catch {
    return NextResponse.json({ user: null })
  }
}
