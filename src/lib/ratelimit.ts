// Simple in-memory rate limiter — no external service needed
// Resets on server restart, good enough for Railway single-instance deployments

const attempts = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(key: string, maxAttempts: number, windowMs: number): { success: boolean; remaining: number } {
  const now = Date.now()
  const entry = attempts.get(key)

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs })
    return { success: true, remaining: maxAttempts - 1 }
  }

  if (entry.count >= maxAttempts) {
    return { success: false, remaining: 0 }
  }

  entry.count++
  return { success: true, remaining: maxAttempts - entry.count }
}

// Clean up old entries every 10 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now()
  attempts.forEach((entry, key) => {
    if (now > entry.resetAt) attempts.delete(key)
  })
}, 10 * 60 * 1000)
