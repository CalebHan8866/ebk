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
// Hard cap: if the map grows beyond this (e.g. many IPs flooding /start before
// /complete), drop all expired entries and, if still over the cap, evict the oldest
// quarter to prevent unbounded memory growth.
const MAX_USED_NONCES = 10_000
const usedNonces = new Map<string, number>()

function pruneExpiredNonces() {
  const now = Date.now()
  usedNonces.forEach((expiry, nonce) => {
    if (now > expiry) usedNonces.delete(nonce)
  })
  // If the map is still above the hard cap after pruning, evict the oldest quarter
  // (by insertion order — Map iteration is insertion-ordered in V8) so the map
  // cannot grow without bound even when callers never reach /complete to consume tokens.
  if (usedNonces.size > MAX_USED_NONCES) {
    const evict = Math.floor(usedNonces.size / 4)
    const keys = Array.from(usedNonces.keys()).slice(0, evict)
    for (const key of keys) usedNonces.delete(key)
  }
}

export function signGameToken(userId: string, nonce: string, issuedAt: number): string {
  const payload = `${userId}:${nonce}:${issuedAt}`
  const hmac = crypto.createHmac('sha256', getHmacSecret()).update(payload).digest('hex')
  return Buffer.from(`${payload}:${hmac}`).toString('base64url')
}

/**
 * Shared signature verification (no nonce side-effects).
 * Returns the parsed nonce on success, or null on any failure.
 */
function verifyTokenSignature(token: string, userId: string): { nonce: string; issuedAt: number } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString()
    const parts = decoded.split(':')
    if (parts.length !== 4) return null
    const [tid, nonce, issuedAtStr, hmac] = parts
    if (tid !== userId) return null
    const issuedAt = parseInt(issuedAtStr, 10)
    if (isNaN(issuedAt) || Date.now() - issuedAt > SESSION_TTL_MS) return null
    const expected = crypto.createHmac('sha256', getHmacSecret())
      .update(`${tid}:${nonce}:${issuedAtStr}`)
      .digest('hex')
    if (!crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'))) return null
    return { nonce, issuedAt }
  } catch {
    return null
  }
}

/**
 * Verifies a game token WITHOUT consuming the nonce.
 * Use this for non-final badge milestones (hl_10, hl_25) where the same token
 * must remain valid for subsequent milestone claims in the same game session.
 * The DB-level alreadyUnlocked check prevents double-awarding.
 */
export function verifyGameToken(token: string, userId: string): boolean {
  pruneExpiredNonces()
  const result = verifyTokenSignature(token, userId)
  if (!result) return false
  // Reject tokens whose nonce has already been finally consumed (gauntlet claimed)
  if (usedNonces.has(result.nonce)) return false
  return true
}

/**
 * Verifies a game token and marks its nonce as consumed.
 * Returns false if the token is invalid, expired, or has already been used.
 * Once this returns true the nonce is burned — subsequent calls with the same
 * token will return false, preventing badge-milestone replay attacks.
 * Use this only for the final milestone (hl_gauntlet) to lock out replay.
 */
export function verifyAndConsumeGameToken(token: string, userId: string): boolean {
  pruneExpiredNonces()
  const result = verifyTokenSignature(token, userId)
  if (!result) return false
  if (usedNonces.has(result.nonce)) return false
  // Burn the nonce — any future call with this token will be rejected
  usedNonces.set(result.nonce, result.issuedAt + SESSION_TTL_MS)
  return true
}
