import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// In-memory cache — players rarely change (only on deploy)
let cache: { data: unknown; etag: string; at: number } | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function computeETag(data: unknown): string {
  const hash = createHash('sha1').update(JSON.stringify(data)).digest('hex').slice(0, 16)
  return `"${hash}"`
}

export async function GET(req: NextRequest) {
  try {
    const now = Date.now()
    if (!cache || now - cache.at >= CACHE_TTL) {
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
      cache = { data: players, etag: computeETag(players), at: now }
    }

    const ifNoneMatch = req.headers.get('if-none-match')
    if (ifNoneMatch && ifNoneMatch === cache.etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
          'ETag': cache.etag,
        },
      })
    }

    return NextResponse.json(cache.data, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
        'ETag': cache.etag,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
