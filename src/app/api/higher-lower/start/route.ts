export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { rateLimit } from '@/lib/ratelimit'
import crypto from 'crypto'
import { signGameToken } from '@/lib/higher-lower-token'

// GET /api/higher-lower/start
// Issues a short-lived, HMAC-signed session token that the client must present
// when claiming a higher-lower badge. This prevents a user from calling the
// /complete endpoint directly without having actually started a game session.

export async function GET(request: NextRequest) {
  try {
    const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
    // Rate limit: max 20 game starts per hour per IP — generous for real players, tight for scripts
    const { success } = rateLimit(`hl-start:${ip}`, 20, 60 * 60 * 1000)
    if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const cookieStore = await cookies()
    const token = cookieStore.get('ebk-token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const nonce = crypto.randomBytes(16).toString('hex')
    const issuedAt = Date.now()
    const gameToken = signGameToken(payload.userId, nonce, issuedAt)

    return NextResponse.json({ gameToken })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
