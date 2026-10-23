export const dynamic = 'force-dynamic'

import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { decodeToken } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { noStore } from '@/lib/no-store'
import { rateLimit } from '@/lib/ratelimit'

export async function GET(req: NextRequest) {
  try {
    // Rate limit: 120 requests per minute per IP — well above any legitimate browser
    // polling cadence while blocking scripts that hammer this endpoint to scrape user
    // state or force repeated DB reads.
    const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
    const { success } = rateLimit(`me:${ip}`, 120, 60 * 1000)
    if (!success) return noStore({ user: null })

    const cookieStore = await cookies()
    const token = cookieStore.get('ebk-token')?.value
    if (!token) return noStore({ user: null })

    // Decode the JWT (crypto only — no DB hit yet).
    const claims = await decodeToken(token)
    if (!claims) return noStore({ user: null })

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
        tokenVersion: true, emailVerified: true,
      },
    })

    // Reject if user deleted, token was invalidated, or email is not yet verified.
    // The emailVerified check is defense-in-depth: the login route already blocks
    // unverified users, but this ensures any future code path that issues a JWT
    // before email verification cannot bypass the gate.
    if (!row || row.tokenVersion !== claims.tokenVersion || !row.emailVerified) return noStore({ user: null })

    // Strip internal fields before sending to the client.
    const { tokenVersion: _tv, emailVerified: _ev, ...user } = row
    return noStore({ user })
  } catch {
    return noStore({ user: null })
  }
}
