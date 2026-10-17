export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

    const user = await prisma.user.findFirst({
      where: { verificationToken: token },
      select: { id: true, username: true, tokenVersion: true },
    })
    if (!user) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verificationToken: null }
    })

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
