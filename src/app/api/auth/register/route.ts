export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { sendVerificationEmail } from '@/lib/email'
import { rateLimit } from '@/lib/ratelimit'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
    const { success } = rateLimit(`register:${ip}`, 5, 60 * 60 * 1000) // 5 signups per hour per IP
    if (!success) return NextResponse.json({ error: 'Too many signup attempts. Try again in an hour.' }, { status: 429 })

    const { username, email, password } = await request.json()
    if (!username || !email || !password) return NextResponse.json({ error: 'All fields required' }, { status: 400 })
    if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    if (username.length < 3) return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 })

    const existing = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] } })
    if (existing) return NextResponse.json({ error: 'Username or email already taken' }, { status: 409 })

    const hashed = await bcrypt.hash(password, 12)
    const verificationToken = crypto.randomBytes(32).toString('hex')

    await prisma.user.create({
      data: { username, email, password: hashed, verificationToken, emailVerified: false }
    })

    // Fire and forget — don't block the response waiting for email
    sendVerificationEmail(email, username, verificationToken).catch(err => console.error('Email error:', err))

    return NextResponse.json({ message: 'Account created! Check your email to verify your account.' })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
