export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { rateLimit } from '@/lib/ratelimit'
import bcrypt from 'bcryptjs'

// POST /api/auth/change-password
// Allows an authenticated user to change their password.
// Requires currentPassword for confirmation; prevents account takeover if a session cookie is stolen.
export async function POST(request: NextRequest) {
  try {
    const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
    const { success } = rateLimit(`change-pw:${ip}`, 5, 15 * 60 * 1000) // 5 attempts per 15 min
    if (!success) return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 })

    const cookieStore = await cookies()
    const token = cookieStore.get('ebk-token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: { currentPassword?: unknown; newPassword?: unknown }
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

    const { currentPassword, newPassword } = body

    if (!currentPassword || typeof currentPassword !== 'string') {
      return NextResponse.json({ error: 'Current password is required' }, { status: 400 })
    }
    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json({ error: 'New password is required' }, { status: 400 })
    }
    if (newPassword.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    if (newPassword.length > 72) return NextResponse.json({ error: 'Password must be 72 characters or less' }, { status: 400 })

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, password: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const passwordMatch = await bcrypt.compare(currentPassword, user.password)
    if (!passwordMatch) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 })

    if (currentPassword === newPassword) {
      return NextResponse.json({ error: 'New password must differ from current password' }, { status: 400 })
    }

    const hashed = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    })

    return NextResponse.json({ message: 'Password changed successfully.' })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
