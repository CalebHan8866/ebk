export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Internal-only route for test account setup — protected by secret
export async function POST(request: NextRequest) {
  const { email, secret } = await request.json()
  if (!process.env.DEV_SECRET || secret !== process.env.DEV_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const result = await prisma.user.updateMany({ where: { email }, data: { emailVerified: true } })
  if (result.count === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
