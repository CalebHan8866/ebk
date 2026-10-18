export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { createToken } from '@/lib/auth'
import { cookies } from 'next/headers'
import { rateLimit } from '@/lib/ratelimit'

export async function POST(request: NextRequest) {
  try {
    const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
    const loadTestSecret = request.headers.get('x-load-test-secret')
    const isLoadTest = !!process.env.DEV_SECRET && loadTestSecret === process.env.DEV_SECRET
    const { email, password } = await request.json()

    if (!isLoadTest) {
      const { success: ipOk } = rateLimit(`login:${ip}`, 10, 15 * 60 * 1000) // 10 attempts per IP per 15 min
      if (!ipOk) return NextResponse.json({ error: 'Too many login attempts. Try again in 15 minutes.' }, { status: 429 })
      // Per-account rate limit — prevents distributed brute-force from multiple IPs targeting one account
      if (email && typeof email === 'string' && email.length <= 254) {
        const { success: emailOk } = rateLimit(`login:email:${email.toLowerCase()}`, 5, 15 * 60 * 1000) // 5 attempts per account per 15 min
        if (!emailOk) return NextResponse.json({ error: 'Too many login attempts. Try again in 15 minutes.' }, { status: 429 })
      }
    }
    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }
    if (email.length > 254 || password.length > 1024) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, username: true, email: true, password: true, emailVerified: true, wins: true, losses: true, draws: true, equippedBadges: true, tokenVersion: true } })

    // Always run bcrypt to prevent timing-based email enumeration
    const DUMMY_HASH = '$2a$12$irrelevant.hash.to.prevent.timing.sidechannel.XXXXXXXXX'
    const passwordMatch = user
      ? await bcrypt.compare(password, user.password)
      : await bcrypt.compare(password, DUMMY_HASH)
    if (!user || !passwordMatch) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    if (!user.emailVerified) {
      return NextResponse.json({ error: 'Please verify your email before logging in. Check your inbox.' }, { status: 403 })
    }

    const token = await createToken({ userId: user.id, username: user.username, tokenVersion: user.tokenVersion })
    const cookieStore = await cookies()
    cookieStore.set('ebk-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7,
    })

    return NextResponse.json({
      user: { id: user.id, username: user.username, email: user.email, wins: user.wins, losses: user.losses, draws: user.draws, equippedBadges: user.equippedBadges }
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
