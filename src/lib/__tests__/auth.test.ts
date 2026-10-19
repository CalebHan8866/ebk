/**
 * Smoke tests for src/lib/auth.ts
 *
 * verifyToken() performs a DB lookup to validate tokenVersion, so we mock
 * the Prisma client from ./db to keep these tests fast and self-contained.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock the Prisma singleton before importing auth ──────────────────────────
vi.mock('../db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}))

import { createToken, verifyToken, decodeToken } from '../auth'
import { prisma } from '../db'

const mockFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>

// ── Helpers ──────────────────────────────────────────────────────────────────

const VALID_PAYLOAD = { userId: 'user-1', username: 'caleb', tokenVersion: 1 }

async function mintToken(overrides: Partial<typeof VALID_PAYLOAD> = {}) {
  return createToken({ ...VALID_PAYLOAD, ...overrides })
}

// ── verifyToken ───────────────────────────────────────────────────────────────

describe('verifyToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts a freshly-minted valid token and returns claims', async () => {
    mockFindUnique.mockResolvedValue({ tokenVersion: 1 })

    const token = await mintToken()
    const result = await verifyToken(token)

    expect(result).not.toBeNull()
    expect(result?.userId).toBe('user-1')
    expect(result?.username).toBe('caleb')
    expect(result?.tokenVersion).toBe(1)
  })

  it('rejects a completely invalid token string', async () => {
    const result = await verifyToken('this.is.not.a.jwt')
    expect(result).toBeNull()
  })

  it('rejects an empty string token', async () => {
    const result = await verifyToken('')
    expect(result).toBeNull()
  })

  it('rejects when tokenVersion in DB does not match token claims', async () => {
    // DB has version 2 (e.g. password was changed), but token carries version 1
    mockFindUnique.mockResolvedValue({ tokenVersion: 2 })

    const token = await mintToken({ tokenVersion: 1 })
    const result = await verifyToken(token)

    expect(result).toBeNull()
  })

  it('rejects when user no longer exists in DB', async () => {
    mockFindUnique.mockResolvedValue(null)

    const token = await mintToken()
    const result = await verifyToken(token)

    expect(result).toBeNull()
  })

  it('returns claims matching the minted payload on success', async () => {
    const payload = { userId: 'abc-123', username: 'testuser', tokenVersion: 7 }
    mockFindUnique.mockResolvedValue({ tokenVersion: 7 })

    const token = await createToken(payload)
    const result = await verifyToken(token)

    expect(result).toMatchObject(payload)
  })
})

// ── decodeToken (no DB round-trip) ────────────────────────────────────────────

describe('decodeToken', () => {
  it('returns claims for a valid token without touching the DB', async () => {
    const token = await mintToken()
    const result = await decodeToken(token)

    expect(result).not.toBeNull()
    expect(result?.userId).toBe('user-1')
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it('returns null for a tampered token', async () => {
    const token = await mintToken()
    // Flip the last character of the signature to corrupt it
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')
    const result = await decodeToken(tampered)

    expect(result).toBeNull()
  })

  it('returns null for an empty string', async () => {
    const result = await decodeToken('')
    expect(result).toBeNull()
  })
})
