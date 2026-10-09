import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const allPlayers = await prisma.player.findMany()

  const shuffled = allPlayers.sort(() => Math.random() - 0.5)
  const [p1, p2] = shuffled.slice(0, 2)
  const mode = request.nextUrl.searchParams.get('mode') || 'games_played'

  return NextResponse.json({ player1: p1, player2: p2, mode })
}
