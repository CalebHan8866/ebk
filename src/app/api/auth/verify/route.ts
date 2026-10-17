export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    // Reject implausibly long tokens before hitting the DB (crypto.randomBytes(32).hex = 64 chars)
    if (token.length > 128) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })

    // Look up the user by token first so we have their id for the JWT.
    const user = await prisma.user.findFirst({
      where: { verificationToken: token },
      select: { id: true, username: true, tokenVersion: true },
    })
    if (!user) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })

    // Atomic single-use enforcement: include BOTH id AND token in the WHERE clause.
    // If two concurrent requests race on the same token, only the first updateMany
    // will match a row (count > 0) because the token is cleared by the first write.
    // The second request finds count === 0 and returns 400 — no duplicate sessions.
    const updated = await prisma.user.updateMany({
      where: { id: user.id, verificationToken: token },
      data: { emailVerified: true, verificationToken: null },
    })
    if (updated.count === 0) {
      // Lost the race — another concurrent request already consumed this token
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })
    }

    // Auto-log the user in after verification so they land on the success screen already authenticated.
    // Set the cookie directly on the redirect response — cookies().set() operates on a separate
    // response object and the cookie would be dropped when we return NextResponse.redirect().
    const authToken = await createToken({ userId: user.id, username: user.username, tokenVersion: user.tokenVersion })
    const appUrl = process.env.APP_URL ?? request.nextUrl.origin
    const response = NextResponse.redirect(new URL('/verify-email?success=1', appUrl))
    response.cookies.set('ebk-token', authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7,
    })
    return response
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
