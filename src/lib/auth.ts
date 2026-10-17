import { SignJWT, jwtVerify } from 'jose'
import crypto from 'crypto'
import { prisma } from '@/lib/db'

// If JWT_SECRET is not set, generate a random one at startup.
// Sessions will not survive server restarts but tokens cannot be forged.
if (!process.env.JWT_SECRET) {
  console.warn('[auth] WARNING: JWT_SECRET env var is not set — using random secret. Sessions will invalidate on restart.')
}

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex')
)

export async function createToken(payload: { userId: string; username: string; tokenVersion: number }) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret)
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret)
    const claims = payload as { userId: string; username: string; tokenVersion: number }

    // Validate tokenVersion against DB to support immediate session invalidation
    // after password changes. This is a cheap indexed lookup by primary key.
    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: { tokenVersion: true },
    })
    if (!user || user.tokenVersion !== claims.tokenVersion) return null

    return claims
  } catch {
    return null
  }
}
