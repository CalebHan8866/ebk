export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decodeToken } from '@/lib/auth'
import { rateLimit } from '@/lib/ratelimit'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('ebk-token')?.value

  // Rate limit: 10 logout calls per minute per IP — a legitimate user never needs to
  // call logout in a tight loop; this prevents a script with a valid session cookie
  // from rapidly cycling tokenVersion increments (session-invalidation DoS).
  const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  const { success } = rateLimit(`logout:${ip}`, 10, 60 * 1000)
  if (!success) {
    // Still clear the cookie even if rate-limited — don't leave the user "logged in"
    // from their perspective just because the rate limit fired.
    cookieStore.set('ebk-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
    })
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  }

  // Bump tokenVersion so any copy of the old JWT (e.g. stolen from another device)
  // is immediately rejected by verifyToken even before the 7-day expiry.
  //
  // We use decodeToken (signature-only verify, no DB round-trip) to read the claims,
  // but we scope the UPDATE with a WHERE tokenVersion = claims.tokenVersion guard.
  // This means only the owner of the *current* active session can bump the counter —
  // a replayed or already-invalidated token (stale tokenVersion) matches zero rows
  // and cannot force-log-out the legitimate user.
  if (token) {
    try {
      const claims = await decodeToken(token)
      if (claims?.userId) {
        await prisma.user.updateMany({
          where: { id: claims.userId, tokenVersion: claims.tokenVersion },
          data: { tokenVersion: { increment: 1 } },
        })
      }
    } catch {
      // Non-critical — clear the cookie regardless
    }
  }

  // Explicitly expire the cookie with the same attributes it was set with.
  // A bare cookieStore.delete() emits Set-Cookie without httpOnly/secure/sameSite,
  // so browsers that stored the cookie with those flags may not honour the deletion
  // and the old token would persist in the jar.
  cookieStore.set('ebk-token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  })
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
