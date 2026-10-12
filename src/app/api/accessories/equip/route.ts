import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('ebk-token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { type: 'badge' | 'emote'; id: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { type, id } = body
  if (!type || !id || (type !== 'badge' && type !== 'emote')) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { unlockedBadges: true, unlockedEmotes: true, equippedBadges: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (type === 'badge') {
    let unlocked: string[] = []
    try { unlocked = JSON.parse(user.unlockedBadges) } catch { unlocked = [] }
    if (!unlocked.includes(id)) {
      return NextResponse.json({ error: 'Badge not unlocked' }, { status: 403 })
    }

    let equipped: string[] = []
    try { equipped = JSON.parse(user.equippedBadges || '[]') } catch { equipped = [] }

    if (equipped.includes(id)) {
      // Toggle off
      equipped = equipped.filter(b => b !== id)
    } else if (equipped.length < 3) {
      // Add if under max
      equipped = [...equipped, id]
    } else {
      // Already at 3 — replace the oldest (first)
      equipped = [...equipped.slice(1), id]
    }

    await prisma.user.update({
      where: { id: payload.userId },
      data: {
        equippedBadges: JSON.stringify(equipped),
        equippedBadge: equipped[0] ?? '',  // keep single-badge field in sync for navbar
      },
    })
  } else {
    let unlocked: string[] = []
    try { unlocked = JSON.parse(user.unlockedEmotes) } catch { unlocked = [] }
    if (!unlocked.includes(id)) {
      return NextResponse.json({ error: 'Emote not unlocked' }, { status: 403 })
    }
    await prisma.user.update({ where: { id: payload.userId }, data: { equippedEmote: id } })
  }

  return NextResponse.json({ success: true })
}
