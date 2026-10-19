export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'
import { verifyToken, createToken } from '@/lib/auth'
import { rateLimit } from '@/lib/ratelimit'
import { noStore } from '@/lib/no-store'
import bcrypt from 'bcryptjs'

// POST /api/auth/change-password
// Allows an authenticated user to change their password.
// Requires currentPassword for confirmation; prevents account takeover if a session cookie is stolen.
// After a successful change, tokenVersion is bumped to invalidate all other active sessions.
// A fresh token is issued so the current browser stays logged in.
export async function POST(request: NextRequest) {
  try {
    const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
    const { success: ipOk } = rateLimit(`change-pw:${ip}`, 5, 15 * 60 * 1000) // 5 attempts per 15 min per IP
    if (!ipOk) return noStore({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 })

    const cookieStore = await cookies()
    const token = cookieStore.get('ebk-token')?.value
    if (!token) return noStore({ error: 'Unauthorized' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload) return noStore({ error: 'Unauthorized' }, { status: 401 })

    // Per-account rate limit: prevents distributed brute-force (rotating IPs) from
    // guessing the current password via /change-password. Applied after auth so we
    // have payload.userId — always returns the same error message to avoid leaking
    // whether the account exists.
    const { success: userOk } = rateLimit(`change-pw:user:${payload.userId}`, 5, 15 * 60 * 1000) // 5 attempts per account per 15 min
    if (!userOk) return noStore({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 })

    let body: { currentPassword?: unknown; newPassword?: unknown }
    try { body = await request.json() } catch { return noStore({ error: 'Invalid body' }, { status: 400 }) }

    const { currentPassword, newPassword } = body

    if (!currentPassword || typeof currentPassword !== 'string') {
      return noStore({ error: 'Current password is required' }, { status: 400 })
    }
    if (!newPassword || typeof newPassword !== 'string') {
      return noStore({ error: 'New password is required' }, { status: 400 })
    }
    if (newPassword.length < 6) return noStore({ error: 'Password must be at least 6 characters' }, { status: 400 })
    if (newPassword.length > 72) return noStore({ error: 'Password must be 72 characters or less' }, { status: 400 })

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, username: true, password: true, tokenVersion: true },
    })
    if (!user) return noStore({ error: 'User not found' }, { status: 404 })

    const passwordMatch = await bcrypt.compare(currentPassword, user.password)
    if (!passwordMatch) return noStore({ error: 'Current password is incorrect' }, { status: 403 })

    if (currentPassword === newPassword) {
      return noStore({ error: 'New password must differ from current password' }, { status: 400 })
    }

    const hashed = await bcrypt.hash(newPassword, 12)
    const newVersion = user.tokenVersion + 1

    // Bump tokenVersion — all existing cookies (other sessions) are now invalid.
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, tokenVersion: newVersion },
    })

    // Reissue a fresh token for this session so the current browser stays logged in.
    const newToken = await createToken({ userId: user.id, username: user.username, tokenVersion: newVersion })
    cookieStore.set('ebk-token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })

    return noStore({ message: 'Password changed successfully.' })
  } catch {
    return noStore({ error: 'Server error' }, { status: 500 })
  }
}
