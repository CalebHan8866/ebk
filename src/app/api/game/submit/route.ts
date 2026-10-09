import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'

type Player = {
  id: number
  careerGames: number
  careerPPG: number
  careerRPG: number
  careerAPG: number
  firstName: string
  lastName: string
  team: string
  position: string
}

function getStatValue(player: Player, mode: string): number {
  switch (mode) {
    case 'games_played': return player.careerGames
    case 'ppg': return player.careerPPG
    case 'rpg': return player.careerRPG
    case 'apg': return player.careerAPG
    default: return player.careerGames
  }
}

export async function POST(request: NextRequest) {
  const { player1Id, player2Id, chosenId, mode } = await request.json()

  const [player1, player2] = await Promise.all([
    prisma.player.findUnique({ where: { id: player1Id } }),
    prisma.player.findUnique({ where: { id: player2Id } }),
  ])

  if (!player1 || !player2) {
    return NextResponse.json({ error: 'Players not found' }, { status: 404 })
  }

  const stat1 = getStatValue(player1, mode)
  const stat2 = getStatValue(player2, mode)

  let result: 'win' | 'loss' | 'draw'
  let correctId: number

  if (stat1 === stat2) {
    result = 'draw'
    correctId = player1.id
  } else {
    correctId = stat1 < stat2 ? player1.id : player2.id
    result = chosenId === correctId ? 'win' : 'loss'
  }

  const cookieStore = await cookies()
  const token = cookieStore.get('ebk-token')?.value

  if (token) {
    const payload = await verifyToken(token)
    if (payload) {
      await prisma.gameResult.create({
        data: {
          userId: payload.userId,
          mode,
          result,
          player1Id,
          player2Id,
          chosenId,
        }
      })

      await prisma.user.update({
        where: { id: payload.userId },
        data: {
          wins: result === 'win' ? { increment: 1 } : undefined,
          losses: result === 'loss' ? { increment: 1 } : undefined,
          draws: result === 'draw' ? { increment: 1 } : undefined,
        }
      })
    }
  }

  return NextResponse.json({
    result,
    correctId,
    player1: { ...player1, stat: stat1 },
    player2: { ...player2, stat: stat2 },
    mode,
  })
}
