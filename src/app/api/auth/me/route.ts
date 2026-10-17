export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decodeToken } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('ebk-token')?.value
    if (!token) return NextResponse.json({ user: null })

    // Decode the JWT (crypto only — no DB hit yet).
    const claims = await decodeToken(token)
    if (!claims) return NextResponse.json({ user: null })

    // Single DB query: fetch user fields + tokenVersion so we can validate
    // the session version without a separate round-trip (was 2 queries, now 1).
    const row = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: {
        id: true, username: true, email: true,
        wins: true, losses: true, draws: true,
        createdAt: true, gamesPlayed: true, winStreak: true, maxWinStreak: true,
        firstPickWins: true, firstPickGames: true,
        unlockedBadges: true, unlockedEmotes: true, unlockedMilestones: true,
        equippedBadge: true, equippedBadges: true, equippedEmote: true,
        tokenVersion: true,
      },
    })

    // Reject if user deleted or token was invalidated by a password change.
    if (!row || row.tokenVersion !== claims.tokenVersion) return NextResponse.json({ user: null })

    // Strip tokenVersion before sending to the client.
    const { tokenVersion: _tv, ...user } = row
    return NextResponse.json({ user })
  } catch {
    return NextResponse.json({ user: null })
  }
}
