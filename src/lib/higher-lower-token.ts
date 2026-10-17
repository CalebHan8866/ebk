import crypto from 'crypto'

const SESSION_TTL_MS = 30 * 60 * 1000 // 30 minutes

function getHmacSecret(): Buffer {
  const key = process.env.JWT_SECRET ?? 'fallback-hl-dev-key'
  return crypto.createHash('sha256').update(`hl-session:${key}`).digest()
}

export function signGameToken(userId: string, nonce: string, issuedAt: number): string {
  const payload = `${userId}:${nonce}:${issuedAt}`
  const hmac = crypto.createHmac('sha256', getHmacSecret()).update(payload).digest('hex')
  return Buffer.from(`${payload}:${hmac}`).toString('base64url')
}

export function verifyGameToken(token: string, userId: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64url').toString()
    const parts = decoded.split(':')
    if (parts.length !== 4) return false
    const [tid, nonce, issuedAtStr, hmac] = parts
    if (tid !== userId) return false
    const issuedAt = parseInt(issuedAtStr, 10)
    if (isNaN(issuedAt) || Date.now() - issuedAt > SESSION_TTL_MS) return false
    const expected = crypto.createHmac('sha256', getHmacSecret())
      .update(`${tid}:${nonce}:${issuedAtStr}`)
      .digest('hex')
    return crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}
