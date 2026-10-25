export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createToken } from '@/lib/auth'
import { rateLimit } from '@/lib/ratelimit'
import crypto from 'crypto'

export async function GET(request: NextRequest) {
  const appUrl = process.env.APP_URL ?? request.nextUrl.origin

  // Helper: redirect to the verify-email page with an error param so the
  // polished client-side error UI renders instead of a raw JSON response.
  function errorRedirect(type: 'expired' | 'invalid') {
    const url = new URL(`/verify-email?error=${type}`, appUrl)
    const res = NextResponse.redirect(url)
    res.headers.set('Cache-Control', 'no-store')
    return res
  }

  try {
    const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
    // Rate limit: 20 verify attempts per hour per IP — generous for real users clicking links,
    // blocks brute-force token enumeration which would otherwise only be stopped by the
    // 128-char length cap and SHA-256 hash lookup.
    const { success } = rateLimit(`verify:${ip}`, 20, 60 * 60 * 1000)
    if (!success) return errorRedirect('invalid')

    const token = request.nextUrl.searchParams.get('token')
    if (!token) return errorRedirect('invalid')
    // Reject implausibly long tokens before hitting the DB (crypto.randomBytes(32).hex = 64 chars)
    if (token.length > 128) return errorRedirect('invalid')

    // The DB stores the SHA-256 hash of the token, not the raw token.
    // Hash the incoming value before querying so a DB read cannot replay links.
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    // Check whether a matching user exists at all (ignoring expiry) so we can
    // distinguish "token not found / already used" from "token found but expired".
    const userAny = await prisma.user.findFirst({
      where: { verificationToken: tokenHash },
      select: { id: true, username: true, tokenVersion: true, verificationTokenExpiry: true, emailVerified: true },
    })

    // Already-verified: token was cleared after first use — treat the same as
    // "invalid" so we don't leak that the account exists and is active.
    if (!userAny) return errorRedirect('invalid')

    // Token exists but has expired.
    if (!userAny.verificationTokenExpiry || userAny.verificationTokenExpiry <= new Date()) {
      return errorRedirect('expired')
    }

    // If the account is already verified but the token row was somehow left
    // intact, redirect to success rather than error (idempotent happy path).
    if (userAny.emailVerified) {
      const authToken = await createToken({ userId: userAny.id, username: userAny.username, tokenVersion: userAny.tokenVersion })
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
    }

    // Atomic single-use enforcement: include BOTH id AND token hash in the WHERE clause.
    // If two concurrent requests race on the same token, only the first updateMany
    // will match a row (count > 0) because the token is cleared by the first write.
    // The second request finds count === 0 and is redirected to the error page.
    const updated = await prisma.user.updateMany({
      where: {
        id: userAny.id,
        verificationToken: tokenHash,
        verificationTokenExpiry: { gt: new Date() },
      },
      data: { emailVerified: true, verificationToken: null, verificationTokenExpiry: null },
    })
    if (updated.count === 0) {
      // Lost the race — another concurrent request already consumed this token
      return errorRedirect('invalid')
    }

    // Auto-log the user in after verification so they land on the success screen already authenticated.
    // Set the cookie directly on the redirect response — cookies().set() operates on a separate
    // response object and the cookie would be dropped when we return NextResponse.redirect().
    const authToken = await createToken({ userId: userAny.id, username: userAny.username, tokenVersion: userAny.tokenVersion })
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
    return errorRedirect('invalid')
  }
}
