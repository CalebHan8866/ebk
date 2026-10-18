export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/email'
import { rateLimit } from '@/lib/ratelimit'
import { noStore } from '@/lib/no-store'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
    const { success } = rateLimit(`forgot:${ip}`, 5, 60 * 60 * 1000) // 5 attempts per hour per IP
    if (!success) return noStore({ error: 'Too many requests. Try again in an hour.' }, { status: 429 })

    let body: { email?: unknown }
    try { body = await request.json() } catch { return noStore({ error: 'Email required' }, { status: 400 }) }
    const { email: rawEmail } = body
    if (!rawEmail || typeof rawEmail !== 'string') return noStore({ error: 'Email required' }, { status: 400 })
    if (rawEmail.length > 254) return noStore({ error: 'Invalid email' }, { status: 400 })
    // Normalize to lowercase — emails are stored lowercased at registration.
    const email = rawEmail.toLowerCase()

    const user = await prisma.user.findUnique({ where: { email } })

    // Always return success to prevent email enumeration
    if (!user) {
      return noStore({ message: 'If that email exists, a reset link has been sent.' })
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    // Store only the SHA-256 hash so a DB read cannot be used to replay reset links.
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: tokenHash, resetTokenExpiry: expiry },
    })

    // Fire and forget — don't block the response waiting for email
    sendPasswordResetEmail(email, user.username, token).catch(err => console.error('Email error:', err))

    return noStore({ message: 'If that email exists, a reset link has been sent.' })
  } catch (e) {
    console.error(e)
    return noStore({ error: 'Server error' }, { status: 500 })
  }
}
