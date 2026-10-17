export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

// Bulk-creates test users for load testing. Requires DEV_SECRET.
// POST { secret, count, prefix }
export async function POST(request: NextRequest) {
  try {
    let body: { secret?: string; count?: number; prefix?: string }
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
    const { secret, count = 50, prefix = 'LoadBot' } = body
    if (!process.env.DEV_SECRET || secret !== process.env.DEV_SECRET) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (count > 600) return NextResponse.json({ error: 'Max 600 per batch' }, { status: 400 })

    const hashed = await bcrypt.hash('TestPass123!', 10)
    const created: string[] = []
    const skipped: string[] = []

    for (let i = 1; i <= count; i++) {
      const username = `${prefix}${String(i).padStart(4, '0')}`
      const email = `${username.toLowerCase()}@ebk-load-test.internal`
      try {
        await prisma.user.upsert({
          where: { email },
          create: { username, email, password: hashed, emailVerified: true },
          update: { emailVerified: true },
        })
        created.push(username)
      } catch {
        skipped.push(username)
      }
    }

    return NextResponse.json({ created: created.length, skipped: skipped.length, prefix })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE — wipe all load test accounts
export async function DELETE(request: NextRequest) {
  try {
    let body: { secret?: string; prefix?: string }
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
    const { secret } = body
    if (!process.env.DEV_SECRET || secret !== process.env.DEV_SECRET) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const result = await prisma.user.deleteMany({
      where: { email: { endsWith: '@ebk-load-test.internal' } },
    })
    return NextResponse.json({ deleted: result.count })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
