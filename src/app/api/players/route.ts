import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// In-memory cache — players rarely change (only on deploy)
let cache: { data: unknown; etag: string; at: number } | null = null
let refreshing = false
const CACHE_TTL = 5 * 60 * 1000  // 5 minutes — hard expiry (serve stale, block on fresh)
const SWR_TTL  = 4 * 60 * 1000  // 4 minutes — soft threshold (serve stale, background refresh)

function computeETag(data: unknown): string {
  const hash = createHash('sha1').update(JSON.stringify(data)).digest('hex').slice(0, 16)
  return `"${hash}"`
}

async function fetchAndCache(): Promise<void> {
  console.log('[players] cache miss, querying DB...')
  const dbStart = Date.now()
  const players = await prisma.player.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      team: true,
      position: true,
      positions: true,
      careerGames: true,
      careerPPG: true,
      careerRPG: true,
      careerAPG: true,
      careerMPG: true,
      ebkScore: true,
      yearFrom: true,
      yearTo: true,
      careerEarnings: true,
    },
  })
  cache = { data: players, etag: computeETag(players), at: Date.now() }
  console.log(`[players] served ${players.length} players in ${Date.now() - dbStart}ms`)
}

function triggerBackgroundRefresh(): void {
  if (refreshing) return
  refreshing = true
  fetchAndCache().catch((err) => {
    console.error('[players] Background cache refresh failed:', err)
  }).finally(() => {
    refreshing = false
  })
}

export async function GET(req: NextRequest) {
  try {
    const now = Date.now()
    const age = cache ? now - cache.at : Infinity

    if (age >= CACHE_TTL) {
      // Cache is fully expired — block on a fresh fetch before responding
      await fetchAndCache()
    } else if (age >= SWR_TTL) {
      // Cache is stale but still usable — serve immediately, refresh in background
      triggerBackgroundRefresh()
    }

    const ifNoneMatch = req.headers.get('if-none-match')
    if (ifNoneMatch && ifNoneMatch === cache!.etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
          'ETag': cache!.etag,
        },
      })
    }

    return NextResponse.json(cache!.data, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
        'ETag': cache!.etag,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
