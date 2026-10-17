export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Internal-only route for test account setup — protected by secret
export async function POST(request: NextRequest) {
  try {
    let body: { email?: string; secret?: string }
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
    const { email, secret } = body
    if (!process.env.DEV_SECRET || secret !== process.env.DEV_SECRET) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }
    const result = await prisma.user.updateMany({ where: { email }, data: { emailVerified: true } })
    if (result.count === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
