/**
 * Validate required environment variables at process startup.
 * Call once before any DB / auth / socket work begins.
 * Throws a descriptive Error so the process exits clearly instead of
 * crashing later with a confusing "Cannot read property of undefined".
 */
export function validateEnv(): void {
  const required: Record<string, string> = {
    DATABASE_URL:
      'Prisma connection string — set to your Railway Postgres URL',
  }

  // JWT_SECRET is optional but strongly recommended in production
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.error(
      '[env] FATAL: JWT_SECRET is not set in production. ' +
        'All sessions will be invalidated on every restart. ' +
        'Set JWT_SECRET to a long random string in Railway variables.'
    )
    process.exit(1)
  }

  const missing: string[] = []
  for (const [key, description] of Object.entries(required)) {
    if (!process.env[key]) {
      missing.push(`  ${key}: ${description}`)
    }
  }

  if (missing.length > 0) {
    const msg =
      `[env] FATAL: Missing required environment variables:\n${missing.join('\n')}\n` +
      'Set them in Railway → Variables before deploying.'
    console.error(msg)
    process.exit(1)
  }

  // Warn about APP_URL in production (socket CORS will fall back to localhost)
  if (process.env.NODE_ENV === 'production' && !process.env.APP_URL) {
    console.warn(
      '[env] WARNING: APP_URL is not set. ' +
        'Socket.IO CORS will default to http://localhost:3000, ' +
        'which will block cross-origin connections in production. ' +
        'Set APP_URL to your Railway public URL.'
    )
  }
}
