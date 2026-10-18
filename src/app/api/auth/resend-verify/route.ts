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

    const user = await prisma.user.findUnique({ where: { email } })
    // Return success regardless — don't leak whether the email exists
    if (!user || user.emailVerified) return noStore({ message: 'If that email is registered and unverified, a new link has been sent.' })

    const verificationToken = crypto.randomBytes(32).toString('hex')
    // Store only the hash; raw token is emailed so a DB read cannot replay links.
    const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex')
    await prisma.user.update({ where: { id: user.id }, data: { verificationToken: verificationTokenHash } })

    sendVerificationEmail(email, user.username, verificationToken).catch(err => console.error('Resend email error:', err))

    return noStore({ message: 'If that email is registered and unverified, a new link has been sent.' })
  } catch {
    return noStore({ error: 'Server error' }, { status: 500 })
  }
}
