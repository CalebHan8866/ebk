import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// In-memory cache — players rarely change (only on deploy)
let cache: { data: unknown; at: number } | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function GET() {
  try {
    const now = Date.now()
    if (cache && now - cache.at < CACHE_TTL) {
      return NextResponse.json(cache.data)
    }
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
    cache = { data: players, at: now }
    return NextResponse.json(players)
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
