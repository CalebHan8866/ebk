export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createToken } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const user = await prisma.user.findFirst({ where: { verificationToken: token } })
  if (!user) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, verificationToken: null }
  })

  // Auto-login after verification
  const authToken = await createToken({ userId: user.id, username: user.username })
  const cookieStore = await cookies()
  cookieStore.set('ebk-token', authToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
  })

  return NextResponse.redirect(new URL('/verify-email?success=1', request.url))
}
