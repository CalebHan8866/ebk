export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendVerificationEmail } from '@/lib/email'
import { rateLimit } from '@/lib/ratelimit'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
    const { success } = rateLimit(`resend-verify:${ip}`, 3, 60 * 60 * 1000) // 3 resends per hour per IP
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again in an hour.' }, { status: 429 })

    const { email } = await request.json()
    if (!email || typeof email !== 'string') return NextResponse.json({ error: 'Email required' }, { status: 400 })

    const user = await prisma.user.findUnique({ where: { email } })
    // Return success regardless — don't leak whether the email exists
    if (!user || user.emailVerified) return NextResponse.json({ message: 'If that email is registered and unverified, a new link has been sent.' })

    const verificationToken = crypto.randomBytes(32).toString('hex')
    await prisma.user.update({ where: { id: user.id }, data: { verificationToken } })

    sendVerificationEmail(email, user.username, verificationToken).catch(err => console.error('Resend email error:', err))

    return NextResponse.json({ message: 'If that email is registered and unverified, a new link has been sent.' })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
