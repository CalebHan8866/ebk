export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'
import { verifyToken, createToken } from '@/lib/auth'
import { containsProfanity } from '@/lib/profanity'
import bcrypt from 'bcryptjs'
import { rateLimit } from '@/lib/ratelimit'

// A bcrypt hash of a dummy password used to make the DELETE timing constant
// regardless of whether the user record exists (mirrors the login pattern).
const DUMMY_HASH = '$2a$12$irrelevant.hash.to.prevent.timing.sidechannel.XXXXXXXXX'

async function getAuthUser(request: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('ebk-token')?.value
  if (!token) return null
  return verifyToken(token)
}

export async function GET(request: NextRequest) {
  try {
    const payload = await getAuthUser(request)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true, username: true, email: true,
        wins: true, losses: true, draws: true,
        gamesPlayed: true, winStreak: true, maxWinStreak: true,
        firstPickWins: true, firstPickGames: true,
        unlockedBadges: true, unlockedEmotes: true, unlockedMilestones: true,
        equippedBadge: true, equippedBadges: true, equippedEmote: true,
        usernameChanges: true,
        createdAt: true,
      },
    })

    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ user })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH /api/profile — update username
// After a successful rename the JWT is reissued so the username claim in the
// cookie is immediately up to date. Without this the old username would persist
// in the token for up to 7 days.
export async function PATCH(request: NextRequest) {
  try {
    const payload = await getAuthUser(request)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Rate limit: 3 username changes per hour (prevents rapid cycling).
    const { success: renameOk } = rateLimit(`username-change:${payload.userId}`, 3, 60 * 60 * 1000)
    if (!renameOk) return NextResponse.json({ error: 'Too many username changes. Try again in an hour.' }, { status: 429 })

    // Lifetime cap: 2 username changes maximum.
    const currentUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { usernameChanges: true },
    })
    if (!currentUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (currentUser.usernameChanges >= 2) {
      return NextResponse.json({ error: 'Username can only be changed twice in a lifetime. You have used both changes.' }, { status: 403 })
    }

    let body: { username?: unknown }
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

    const { username } = body
    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'username is required' }, { status: 400 })
    }
    if (username.length < 3) return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 })
    if (username.length > 20) return NextResponse.json({ error: 'Username must be 20 characters or less' }, { status: 400 })
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return NextResponse.json({ error: 'Username can only contain letters, numbers, and underscores' }, { status: 400 })
    }
    if (containsProfanity(username)) return NextResponse.json({ error: 'Username contains disallowed words' }, { status: 400 })

    // Reject a no-op change so the client sees a clear message instead of a silent success.
    // Compare case-insensitively so "Admin" → "admin" is also treated as a no-op.
    if (username.toLowerCase() === payload.username?.toLowerCase()) {
      return NextResponse.json({ error: 'That is already your username' }, { status: 400 })
    }

    // Case-insensitive uniqueness check before the update to prevent "Admin" / "admin"
    // collisions that the DB unique constraint (case-sensitive) would not catch.
    const collision = await prisma.user.findFirst({
      where: {
        username: { equals: username, mode: 'insensitive' },
        NOT: { id: payload.userId },
      },
    })
    if (collision) {
      return NextResponse.json({ error: 'Username is already taken' }, { status: 409 })
    }

    try {
      const user = await prisma.user.update({
        where: { id: payload.userId },
        data: { username, usernameChanges: { increment: 1 } },
        select: { id: true, username: true, email: true, tokenVersion: true, usernameChanges: true },
      })

      // Reissue the JWT so the updated username is reflected in the cookie
      // immediately rather than waiting up to 7 days for the old token to expire.
      const cookieStore = await cookies()
      const newToken = await createToken({ userId: user.id, username: user.username, tokenVersion: user.tokenVersion })
      cookieStore.set('ebk-token', newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      })

      // Strip tokenVersion — it's an internal session counter, not client data
      const { tokenVersion: _tv, ...safeUser } = user
      return NextResponse.json({ user: safeUser, changesRemaining: 2 - safeUser.usernameChanges })
    } catch (e: unknown) {
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === 'P2002') {
        return NextResponse.json({ error: 'Username is already taken' }, { status: 409 })
      }
      throw e
    }
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE /api/profile — permanently delete account (GDPR right to erasure)
// Requires the user's current password as confirmation to prevent accidental/malicious deletion.
// bcrypt.compare is always called (even when the user record is not found) to
// keep the response time constant and avoid leaking whether an account exists.
export async function DELETE(request: NextRequest) {
  try {
    const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
    // Rate limit: 5 delete attempts per hour per IP — bcrypt is expensive so this also
    // protects against a distributed password-guessing attack on the confirmation field.
    const { success: ipOk } = rateLimit(`delete-account:${ip}`, 5, 60 * 60 * 1000)
    if (!ipOk) return NextResponse.json({ error: 'Too many attempts. Try again in an hour.' }, { status: 429 })

    const payload = await getAuthUser(request)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Per-account rate limit: prevents distributed brute-force (rotating IPs) from
    // guessing the confirmation password for a specific account.
    const { success: userOk } = rateLimit(`delete-account:user:${payload.userId}`, 5, 60 * 60 * 1000)
    if (!userOk) return NextResponse.json({ error: 'Too many attempts. Try again in an hour.' }, { status: 429 })

    let body: { password?: unknown }
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

    const { password } = body
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password confirmation is required to delete your account' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, password: true },
    })

    // Always run bcrypt to keep timing constant regardless of whether the user
    // record exists. This prevents a theoretical timing oracle for account existence.
    const passwordMatch = await bcrypt.compare(password, user?.password ?? DUMMY_HASH)

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (!passwordMatch) return NextResponse.json({ error: 'Incorrect password' }, { status: 403 })

    // GameRecords are cascade-deleted via the FK onDelete: Cascade in schema.prisma
    await prisma.user.delete({ where: { id: user.id } })

    // Clear the auth cookie so the client is immediately logged out.
    // Use an explicit set-with-maxAge=0 matching all original cookie attributes
    // so the browser's cookie-matching algorithm correctly evicts the stored cookie.
    const cookieStore = await cookies()
    cookieStore.set('ebk-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
    })

    return new NextResponse(null, { status: 204 })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
