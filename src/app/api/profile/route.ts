export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { containsProfanity } from '@/lib/profanity'
import bcrypt from 'bcryptjs'

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
export async function PATCH(request: NextRequest) {
  try {
    const payload = await getAuthUser(request)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

    try {
      const user = await prisma.user.update({
        where: { id: payload.userId },
        data: { username },
        select: { id: true, username: true, email: true },
      })
      return NextResponse.json({ user })
    } catch (e: any) {
      if (e?.code === 'P2002') {
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
export async function DELETE(request: NextRequest) {
  try {
    const payload = await getAuthUser(request)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const passwordMatch = await bcrypt.compare(password, user.password)
    if (!passwordMatch) return NextResponse.json({ error: 'Incorrect password' }, { status: 403 })

    // GameRecords are cascade-deleted via the FK onDelete: Cascade in schema.prisma
    await prisma.user.delete({ where: { id: user.id } })

    // Clear the auth cookie so the client is immediately logged out
    const cookieStore = await cookies()
    cookieStore.delete('ebk-token')

    return new NextResponse(null, { status: 204 })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
