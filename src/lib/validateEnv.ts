/**
 * Validate required environment variables at process startup.
 * Call once before any DB / auth / socket work begins.
 * Crashes the process with a clear message rather than letting it limp along
 * and fail mysteriously at the first DB query or auth check.
 */
export function validateEnv(): void {
  // Always required — without these the server cannot function at all.
  const required: Record<string, string> = {
    DATABASE_URL:
      'Prisma connection string — set to your Railway Postgres URL',
  }

  // Required in production — missing values here cause silent security failures
  // (broken auth tokens, blocked sockets) rather than obvious crashes, so we
  // treat them as fatal rather than warnings.
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET) {
      console.error(
        '[env] FATAL: JWT_SECRET is not set in production. ' +
          'All issued tokens will be signed with a random key that changes on every restart, ' +
          'invalidating every active session. ' +
          'Set JWT_SECRET to a long random string in Railway → Variables.'
      )
      process.exit(1)
    }

    if (!process.env.APP_URL) {
      console.error(
        '[env] FATAL: APP_URL is not set in production. ' +
          'Socket.IO CORS will default to http://localhost:3000, ' +
          'which will silently block all cross-origin socket connections. ' +
          'Set APP_URL to your Railway public URL in Railway → Variables.'
      )
      process.exit(1)
    }
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
}
