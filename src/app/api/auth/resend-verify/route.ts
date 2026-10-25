export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { sendVerificationEmail } from '@/lib/email'
import { rateLimit } from '@/lib/ratelimit'
import { noStore } from '@/lib/no-store'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
    const { success } = rateLimit(`resend-verify:${ip}`, 3, 60 * 60 * 1000) // 3 resends per hour per IP
    if (!success) return noStore({ error: 'Too many requests. Try again in an hour.' }, { status: 429 })

    let body: { email?: unknown }
    try { body = await request.json() } catch { return noStore({ error: 'Email required' }, { status: 400 }) }
    const { email: rawEmail } = body
    if (!rawEmail || typeof rawEmail !== 'string') return noStore({ error: 'Email required' }, { status: 400 })
    if (rawEmail.length > 254) return noStore({ error: 'Invalid email' }, { status: 400 })
    // Normalize to lowercase — emails are stored lowercased at registration.
    const email = rawEmail.toLowerCase()

    // Per-email rate limit: prevents a distributed attacker from flooding one inbox
    // with verification emails. Applied before the DB lookup; still returns the generic
    // message so email existence is not leaked.
    const { success: emailOk } = rateLimit(`resend-verify:email:${email}`, 2, 60 * 60 * 1000) // 2 resends per hour per address
    if (!emailOk) return noStore({ message: 'If that email is registered and unverified, a new link has been sent.' })

    const user = await prisma.user.findUnique({ where: { email } })
    // Return success regardless — don't leak whether the email exists
    if (!user || user.emailVerified) return noStore({ message: 'If that email is registered and unverified, a new link has been sent.' })

    const verificationToken = crypto.randomBytes(32).toString('hex')
    // Store only the hash; raw token is emailed so a DB read cannot replay links.
    const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex')
    // Fresh expiry: 24 hours from now — resets the window on each resend.
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await prisma.user.update({ where: { id: user.id }, data: { verificationToken: verificationTokenHash, verificationTokenExpiry } })

    sendVerificationEmail(email, user.username, verificationToken).catch(err => console.error('Resend email error:', err))

    return noStore({ message: 'If that email is registered and unverified, a new link has been sent.' })
  } catch {
    return noStore({ error: 'Server error' }, { status: 500 })
  }
}
