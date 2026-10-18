import crypto from 'crypto'

const SESSION_TTL_MS = 30 * 60 * 1000 // 30 minutes

// Capture the server-process start epoch once at module load time.
// This value is mixed into every HMAC so that tokens signed before a server
// restart are cryptographically invalid after restart — even if their TTL has
// not yet expired and the in-memory usedNonces set has been cleared.
// An attacker who saves a valid token and waits for a restart cannot replay it
// because the new process will compute a different HMAC secret.
const SERVER_EPOCH = Date.now()

function getHmacSecret(): Buffer {
  const key = process.env.JWT_SECRET ?? 'fallback-hl-dev-key'
  return crypto.createHash('sha256').update(`hl-session:${key}:epoch=${SERVER_EPOCH}`).digest()
}

// One-time-use nonce registry: nonce → expiry timestamp.
// Prevents a valid game token from being replayed across multiple /complete calls
// to claim every badge milestone in a single session without re-playing the game.
// Entries are lazily pruned when they expire so the map stays bounded.
const usedNonces = new Map<string, number>()

function pruneExpiredNonces() {
  const now = Date.now()
  usedNonces.forEach((expiry, nonce) => {
    if (now > expiry) usedNonces.delete(nonce)
  })
}

export function signGameToken(userId: string, nonce: string, issuedAt: number): string {
  const payload = `${userId}:${nonce}:${issuedAt}`
  const hmac = crypto.createHmac('sha256', getHmacSecret()).update(payload).digest('hex')
  return Buffer.from(`${payload}:${hmac}`).toString('base64url')
}

/**
 * Verifies a game token and marks its nonce as consumed.
 * Returns false if the token is invalid, expired, or has already been used.
 * Once this returns true the nonce is burned — subsequent calls with the same
 * token will return false, preventing badge-milestone replay attacks.
 */
export function verifyAndConsumeGameToken(token: string, userId: string): boolean {
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
    const valid = crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'))
    if (!valid) return false

    // Replay check: reject if this nonce has already been consumed
    pruneExpiredNonces()
    if (usedNonces.has(nonce)) return false

    // Burn the nonce — any future call with this token will be rejected
    usedNonces.set(nonce, issuedAt + SESSION_TTL_MS)
    return true
  } catch {
    return false
  }
}

/** @deprecated Use verifyAndConsumeGameToken for badge claims. */
export function verifyGameToken(token: string, userId: string): boolean {
  return verifyAndConsumeGameToken(token, userId)
}
