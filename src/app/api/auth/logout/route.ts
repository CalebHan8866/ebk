export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decodeToken } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get('ebk-token')?.value

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
