import { SignJWT, jwtVerify } from 'jose'
import crypto from 'crypto'

// If JWT_SECRET is not set, generate a random one at startup.
// Sessions will not survive server restarts but tokens cannot be forged.
if (!process.env.JWT_SECRET) {
  console.warn('[auth] WARNING: JWT_SECRET env var is not set — using random secret. Sessions will invalidate on restart.')
}

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex')
)

export async function createToken(payload: { userId: string; username: string }) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret)
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret)
    return payload as { userId: string; username: string }
  } catch {
    return null
  }
}
