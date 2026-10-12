export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const user = await prisma.user.findFirst({ where: { verificationToken: token } })
  if (!user) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, verificationToken: null }
  })

  return NextResponse.redirect(new URL('/login?verified=1', request.url))
}
