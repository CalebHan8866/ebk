export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { BADGES } from '@/lib/accessories'
import { verifyGameToken } from '@/lib/higher-lower-token'

const HL_BADGE_IDS = ['hl_10', 'hl_25', 'hl_gauntlet']

// Minimum streak required (or full-sequence completion flag) to unlock each badge.
// The client must report a streak >= this value; hl_gauntlet additionally requires
// the `complete` flag set to true (meaning the client ran through the full sequence).
const HL_BADGE_REQUIREMENTS: Record<string, { streakRequired?: number; requiresComplete?: boolean }> = {
  hl_10:      { streakRequired: 10 },
  hl_25:      { streakRequired: 25 },
  hl_gauntlet: { requiresComplete: true },
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('ebk-token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: { milestone: string; streak?: number; complete?: boolean; gameToken?: string }
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

    const { milestone, streak, complete, gameToken } = body

    // Require a valid server-issued game session token. This prevents callers from
    // directly POSTing badge claims without having started a game session via
    // GET /api/higher-lower/start — the token is HMAC-signed with a server secret
    // and expires after 30 minutes, so it cannot be forged or reused across sessions.
    if (!gameToken || typeof gameToken !== 'string' || !verifyGameToken(gameToken, payload.userId)) {
      return NextResponse.json({ error: 'Invalid or expired game session' }, { status: 403 })
    }

    if (!milestone || !HL_BADGE_IDS.includes(milestone)) {
      return NextResponse.json({ error: 'Invalid milestone' }, { status: 400 })
    }

    // Server-side eligibility check: validate the reported streak meets the threshold.
    // This prevents a user from POSTing badge claims without actually achieving the streak.
    const req = HL_BADGE_REQUIREMENTS[milestone]
    if (req) {
      if (req.streakRequired !== undefined) {
        // Validate type, sign, and impose a sane upper bound (total player pool is ~4 000,
        // so no legitimate game could produce a streak above that).
        if (typeof streak !== 'number' || !Number.isFinite(streak) || streak < 0 || !Number.isInteger(streak) || streak > 10_000) {
          return NextResponse.json({ error: 'Invalid streak value' }, { status: 400 })
        }
        if (streak < req.streakRequired) {
          return NextResponse.json({ error: 'Streak requirement not met' }, { status: 403 })
        }
      }
      if (req.requiresComplete) {
        if (complete !== true) {
          return NextResponse.json({ error: 'Must complete the full sequence' }, { status: 403 })
        }
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { unlockedBadges: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    let unlocked: string[] = []
    try { unlocked = JSON.parse(user.unlockedBadges) } catch {}

    if (unlocked.includes(milestone)) {
      return NextResponse.json({ alreadyUnlocked: true })
    }

    const badge = BADGES.find(b => b.id === milestone)
    if (!badge) return NextResponse.json({ error: 'Badge not found' }, { status: 404 })

    await prisma.user.update({
      where: { id: payload.userId },
      data: { unlockedBadges: JSON.stringify([...unlocked, milestone]) },
    })

    return NextResponse.json({ unlocked: true, badge: { id: badge.id, name: badge.name } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
