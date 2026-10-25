export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createToken } from '@/lib/auth'
import { rateLimit } from '@/lib/ratelimit'
import { noStore } from '@/lib/no-store'
import crypto from 'crypto'

export async function GET(request: NextRequest) {
  try {
    const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
    // Rate limit: 20 verify attempts per hour per IP — generous for real users clicking links,
    // blocks brute-force token enumeration which would otherwise only be stopped by the
    // 128-char length cap and SHA-256 hash lookup.
    const { success } = rateLimit(`verify:${ip}`, 20, 60 * 60 * 1000)
    if (!success) return noStore({ error: 'Too many verification attempts. Try again in an hour.' }, { status: 429 })

    const token = request.nextUrl.searchParams.get('token')
    if (!token) return noStore({ error: 'Missing token' }, { status: 400 })
    // Reject implausibly long tokens before hitting the DB (crypto.randomBytes(32).hex = 64 chars)
    if (token.length > 128) return noStore({ error: 'Invalid or expired token' }, { status: 400 })

    // The DB stores the SHA-256 hash of the token, not the raw token.
    // Hash the incoming value before querying so a DB read cannot replay links.
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    // Look up the user by token hash, also enforce expiry so stale email links
    // cannot be replayed long after the account was created or the link was
    // intercepted. Users can request a fresh link via /api/auth/resend-verify.
    const user = await prisma.user.findFirst({
      where: {
        verificationToken: tokenHash,
        verificationTokenExpiry: { gt: new Date() },
      },
      select: { id: true, username: true, tokenVersion: true },
    })
    if (!user) return noStore({ error: 'Invalid or expired token' }, { status: 400 })

    // Atomic single-use enforcement: include BOTH id AND token hash in the WHERE clause.
    // If two concurrent requests race on the same token, only the first updateMany
    // will match a row (count > 0) because the token is cleared by the first write.
    // The second request finds count === 0 and returns 400 — no duplicate sessions.
    const updated = await prisma.user.updateMany({
      where: {
        id: user.id,
        verificationToken: tokenHash,
        verificationTokenExpiry: { gt: new Date() },
      },
      data: { emailVerified: true, verificationToken: null, verificationTokenExpiry: null },
    })
    if (updated.count === 0) {
      // Lost the race — another concurrent request already consumed this token
      return noStore({ error: 'Invalid or expired token' }, { status: 400 })
    }

    // Auto-log the user in after verification so they land on the success screen already authenticated.
    // Set the cookie directly on the redirect response — cookies().set() operates on a separate
    // response object and the cookie would be dropped when we return NextResponse.redirect().
    const authToken = await createToken({ userId: user.id, username: user.username, tokenVersion: user.tokenVersion })
    const appUrl = process.env.APP_URL ?? request.nextUrl.origin
    const response = NextResponse.redirect(new URL('/verify-email?success=1', appUrl))
    response.headers.set('Cache-Control', 'no-store')
    response.cookies.set('ebk-token', authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })
    return response
  } catch {
    return noStore({ error: 'Server error' }, { status: 500 })
  }
}
