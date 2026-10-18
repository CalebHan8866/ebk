export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'
import { createToken } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import { rateLimit } from '@/lib/ratelimit'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
    const { success } = rateLimit(`reset-pw:${ip}`, 10, 60 * 60 * 1000) // 10 attempts per hour per IP
    if (!success) return NextResponse.json({ error: 'Too many attempts. Try again in an hour.' }, { status: 429 })

    const { token, password } = await request.json()
    if (!token || !password || typeof token !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    if (password.length > 72) return NextResponse.json({ error: 'Password must be 72 characters or less' }, { status: 400 })

    // The DB stores the SHA-256 hash of the reset token; hash before lookup.
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    const user = await prisma.user.findFirst({
      where: {
        resetToken: tokenHash,
        resetTokenExpiry: { gt: new Date() },
      },
      select: { id: true, username: true, tokenVersion: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Reset link is invalid or has expired.' }, { status: 400 })
    }

    const hashed = await bcrypt.hash(password, 12)
    const newVersion = user.tokenVersion + 1

    // Atomic single-use enforcement: the WHERE clause includes the token so this
    // update only succeeds if the token has not already been cleared by a
    // concurrent request. If two requests race, exactly one wins; the other
    // finds count === 0 and is rejected — no token reuse possible.
    // Bumping tokenVersion also invalidates all existing sessions so a stolen
    // cookie cannot be used after a successful password reset.
    const result = await prisma.user.updateMany({
      where: {
        id: user.id,
        resetToken: tokenHash,         // atomic guard against concurrent use (compare hash)
        resetTokenExpiry: { gt: new Date() },
      },
      data: { password: hashed, resetToken: null, resetTokenExpiry: null, tokenVersion: newVersion },
    })

    if (result.count === 0) {
      // Lost the race — another request already consumed this token
      return NextResponse.json({ error: 'Reset link is invalid or has expired.' }, { status: 400 })
    }

    // Issue a fresh session cookie so the user is automatically logged in after
    // resetting their password — no need to re-enter credentials on the login page.
    const newToken = await createToken({ userId: user.id, username: user.username, tokenVersion: newVersion })
    const cookieStore = await cookies()
    cookieStore.set('ebk-token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7,
    })

    return NextResponse.json({ message: 'Password reset successfully.' })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
