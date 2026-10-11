export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('ebk-token')?.value
  if (!token) return NextResponse.json({ user: null })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ user: null })
  const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true, username: true, email: true, wins: true, losses: true, draws: true, createdAt: true } })
  return NextResponse.json({ user })
}
