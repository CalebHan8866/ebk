export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { BADGES } from '@/lib/accessories'
import { verifyAndConsumeGameTokenIssuedAt, verifyGameTokenIssuedAt } from '@/lib/higher-lower-token'
import { rateLimit } from '@/lib/ratelimit'

const HL_BADGE_IDS = ['hl_10', 'hl_25', 'hl_gauntlet']

// Minimum streak required (or full-sequence completion flag) to unlock each badge.
// The client must report a streak >= this value; hl_gauntlet additionally requires
// the `complete` flag set to true (meaning the client ran through the full sequence).
// hl_gauntlet requires BOTH complete=true AND streak >= 25 — without a streakRequired
// guard the server only checks `complete: true` from the request body, which any
// authenticated user can trivially fabricate with a valid game token.
const HL_BADGE_REQUIREMENTS: Record<string, { streakRequired?: number; requiresComplete?: boolean }> = {
  hl_10:      { streakRequired: 10 },
  hl_25:      { streakRequired: 25 },
  hl_gauntlet: { requiresComplete: true, streakRequired: 25 },
}

// Minimum milliseconds that must have elapsed between /start and /complete for
// each milestone. At ~2 s per guess a legitimate 10-streak takes ≥ 20 s;
// a full 66-comparison gauntlet takes ≥ 132 s. We use conservative lower bounds
// to accommodate slow connections and deliberate play styles while blocking
// instant scripted claims (which arrive in < 1 s after /start).
const HL_MIN_ELAPSED_MS: Record<string, number> = {
  hl_10:       15_000,   // 10 guesses × ~1.5 s minimum cadence
  hl_25:       40_000,   // 25 guesses × ~1.6 s minimum cadence
  hl_gauntlet: 90_000,   // 66 guesses × ~1.4 s minimum cadence
}

export async function POST(request: NextRequest) {
  try {
    const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
    // Rate limit: 20 badge claim attempts per hour per IP — generous for real play,
    // blocks scripted badge-farming even with a valid game token.
    const { success } = rateLimit(`hl-complete:${ip}`, 20, 60 * 60 * 1000)
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again in an hour.' }, { status: 429 })

    const cookieStore = await cookies()
    const token = cookieStore.get('ebk-token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: { milestone: string; streak?: number; complete?: boolean; gameToken?: string }
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

    const { milestone, streak, complete, gameToken } = body

    // Validate milestone first — before touching token state — so a bogus milestone
    // cannot trigger a side-effect (e.g. nonce consumption) on a valid game token.
    if (!milestone || !HL_BADGE_IDS.includes(milestone)) {
      return NextResponse.json({ error: 'Invalid milestone' }, { status: 400 })
    }

    // Require a valid server-issued game session token. This prevents callers from
    // directly POSTing badge claims without having started a game session via
    // GET /api/higher-lower/start — the token is HMAC-signed with a server secret
    // and expires after 30 minutes, so it cannot be forged or reused across sessions.
    //
    // hl_10 and hl_25 use a non-consuming verify so the same token remains valid
    // for subsequent milestones in the same run (they fire on separate guesses and
    // cannot both arrive in a single request). The DB-level alreadyUnlocked check
    // prevents double-awarding without needing a nonce burn.
    // hl_gauntlet consumes (burns) the nonce — it is always the last claim for a
    // session and we want full replay protection on that badge.
    //
    // We also enforce a minimum elapsed time between /start and /complete per
    // milestone (see HL_MIN_ELAPSED_MS). This blocks instant scripted claims
    // where a client calls /start and immediately POSTs /complete with a
    // fabricated streak — the token's issuedAt is HMAC-protected and cannot be
    // forged without the server secret.
    if (!gameToken || typeof gameToken !== 'string') {
      return NextResponse.json({ error: 'Invalid or expired game session' }, { status: 403 })
    }
    // Reject implausibly long tokens before handing them to the HMAC verifier.
    // A legitimate signed token is ~150 chars; anything longer is either garbage or a
    // deliberate attempt to waste CPU on the HMAC computation.
    if (gameToken.length > 512) {
      return NextResponse.json({ error: 'Invalid or expired game session' }, { status: 403 })
    }
    const isGauntlet = milestone === 'hl_gauntlet'
    const issuedAt = isGauntlet
      ? verifyAndConsumeGameTokenIssuedAt(gameToken, payload.userId)
      : verifyGameTokenIssuedAt(gameToken, payload.userId)
    if (issuedAt === null) {
      return NextResponse.json({ error: 'Invalid or expired game session' }, { status: 403 })
    }
    const minElapsed = HL_MIN_ELAPSED_MS[milestone] ?? 0
    if (Date.now() - issuedAt < minElapsed) {
      return NextResponse.json({ error: 'Game session too short' }, { status: 403 })
    }

    // Server-side eligibility check: validate the reported streak meets the threshold.
    // This prevents a user from POSTing badge claims without actually achieving the streak.
    const req = HL_BADGE_REQUIREMENTS[milestone]
    if (req) {
      if (req.streakRequired !== undefined) {
        // Validate type, sign, and impose a tight upper bound matching the actual game
        // sequence length. TOTAL_PLAYERS is 67, so the maximum possible streak is 66
        // (one comparison per pair). Accepting anything higher is a cheat vector —
        // a caller with a valid game token could POST streak=100 to claim hl_25.
        if (typeof streak !== 'number' || !Number.isFinite(streak) || streak < 0 || !Number.isInteger(streak) || streak > 66) {
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

    const badge = BADGES.find(b => b.id === milestone)
    if (!badge) return NextResponse.json({ error: 'Badge not found' }, { status: 404 })

    // Atomic badge unlock: use a $transaction that reads and writes under a
    // serializable-equivalent lock so concurrent requests for the same milestone
    // cannot both pass the already-unlocked check and double-append the badge.
    // The inner updateMany WHERE guard (string NOT-contains the milestone) acts as
    // a final compare-and-swap: even if two requests enter the transaction
    // simultaneously, exactly one will match the WHERE and update; the other will
    // see count === 0 and return alreadyUnlocked — preventing duplicate badge grants.
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: payload.userId },
        select: { unlockedBadges: true },
      })
      if (!user) return { notFound: true } as const

      let unlocked: string[] = []
      try { unlocked = JSON.parse(user.unlockedBadges) } catch {}

      if (unlocked.includes(milestone)) {
        return { alreadyUnlocked: true } as const
      }

      // Atomic guard: the WHERE clause requires the badge is still absent.
      // If a concurrent transaction already appended it, this update matches
      // zero rows and we treat it as alreadyUnlocked.
      const updated = await tx.user.updateMany({
        where: {
          id: payload.userId,
          // string_contains: milestone checks that the JSON array text does NOT
          // contain this badge id.  We invert with NOT to guard against a race.
          NOT: { unlockedBadges: { contains: `"${milestone}"` } },
        },
        data: { unlockedBadges: JSON.stringify([...unlocked, milestone]) },
      })

      if (updated.count === 0) {
        return { alreadyUnlocked: true } as const
      }

      return { unlocked: true } as const
    })

    if ('notFound' in result) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (result.alreadyUnlocked) return NextResponse.json({ alreadyUnlocked: true })

    return NextResponse.json({ unlocked: true, badge: { id: badge.id, name: badge.name } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
