export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('ebk-token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const records = await prisma.gameRecord.findMany({
    where: { userId: payload.userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({ records })
}
