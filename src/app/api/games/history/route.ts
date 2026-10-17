export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/db'

const PAGE_SIZE = 50

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('ebk-token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Cursor-based pagination: ?cursor=<gameRecordId>
    const cursor = request.nextUrl.searchParams.get('cursor') ?? undefined

    const records = await prisma.gameRecord.findMany({
      where: { userId: payload.userId },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1, // fetch one extra to determine if there's a next page
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    const hasMore = records.length > PAGE_SIZE
    const page = hasMore ? records.slice(0, PAGE_SIZE) : records
    const nextCursor = hasMore ? page[page.length - 1].id : null

    return NextResponse.json({ records: page, nextCursor, hasMore })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
