export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Internal-only route for test account setup — protected by secret
export async function POST(request: NextRequest) {
  const { email, secret } = await request.json()
  if (secret !== (process.env.DEV_SECRET || 'ebktest2024')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  await prisma.user.update({ where: { email }, data: { emailVerified: true } })
  return NextResponse.json({ ok: true })
}
