import { SignJWT, jwtVerify } from 'jose'
import crypto from 'crypto'
import { prisma } from './db'

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
    // Explicitly allowlist HS256 to prevent algorithm confusion attacks
    // (e.g. alg:"none" or an attacker substituting an asymmetric algorithm).
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] })
    const claims = payload as { userId: string; username: string; tokenVersion: number }

    // Validate tokenVersion against DB to support immediate session invalidation
    // after password changes. Also enforce emailVerified so that any future code
    // path that issues a JWT before verification (or a manual DB flip to false)
    // cannot bypass the email-verification gate on authenticated endpoints.
    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: { tokenVersion: true, emailVerified: true },
    })
    if (!user || user.tokenVersion !== claims.tokenVersion || !user.emailVerified) return null

    return claims
  } catch {
    return null
  }
}

/**
 * Decode and cryptographically verify the JWT without hitting the database.
 * Returns the raw claims (including tokenVersion) if the signature is valid,
 * or null if the token is missing, malformed, or expired.
 *
 * Use this in routes that will fetch the full user record themselves anyway
 * (e.g. GET /api/auth/me) — the caller is responsible for checking that
 * claims.tokenVersion matches the DB value, which they can do in the same
 * query used to load the user, eliminating a redundant round-trip.
 */
export async function decodeToken(token: string) {
  try {
    // Explicitly allowlist HS256 to prevent algorithm confusion attacks.
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] })
    return payload as { userId: string; username: string; tokenVersion: number }
  } catch {
    return null
  }
}
