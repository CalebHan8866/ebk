export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { BADGES } from '@/lib/accessories'

const HL_BADGE_IDS = ['hl_10', 'hl_25', 'hl_gauntlet']

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('ebk-token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { milestone: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const { milestone } = body
  if (!milestone || !HL_BADGE_IDS.includes(milestone)) {
    return NextResponse.json({ error: 'Invalid milestone' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { unlockedBadges: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  let unlocked: string[] = []
  try { unlocked = JSON.parse(user.unlockedBadges) } catch {}

  if (unlocked.includes(milestone)) {
    return NextResponse.json({ alreadyUnlocked: true })
  }

  const badge = BADGES.find(b => b.id === milestone)
  if (!badge) return NextResponse.json({ error: 'Badge not found' }, { status: 404 })

  await prisma.user.update({
    where: { id: payload.userId },
    data: { unlockedBadges: JSON.stringify([...unlocked, milestone]) },
  })

  return NextResponse.json({ unlocked: true, badge: { id: badge.id, name: badge.name } })
}
