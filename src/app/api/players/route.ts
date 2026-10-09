import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET() {
  const players = await prisma.player.findMany()
  return NextResponse.json(players)
}
