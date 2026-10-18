export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { noStore } from '@/lib/no-store'

// Internal-only route for test account setup — protected by secret
export async function POST(request: NextRequest) {
  try {
    let body: { email?: string; secret?: string }
    try { body = await request.json() } catch { return noStore({ error: 'Invalid body' }, { status: 400 }) }
    const { email, secret } = body
    if (!process.env.DEV_SECRET || secret !== process.env.DEV_SECRET) {
      return noStore({ error: 'Forbidden' }, { status: 403 })
    }
    if (!email || typeof email !== 'string') {
      return noStore({ error: 'Email required' }, { status: 400 })
    }
    const result = await prisma.user.updateMany({ where: { email }, data: { emailVerified: true } })
    if (result.count === 0) return noStore({ error: 'User not found' }, { status: 404 })
    return noStore({ ok: true })
  } catch {
    return noStore({ error: 'Server error' }, { status: 500 })
  }
}
