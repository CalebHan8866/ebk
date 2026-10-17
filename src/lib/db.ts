import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Append connection_limit to DATABASE_URL if not already set.
// Railway runs single-CPU containers: Prisma's default pool (num_cpus*2+1 ≈ 3)
// causes severe queuing under load. 10 is a safe ceiling for a shared PG instance.
function buildDatabaseUrl(): string {
  const base = process.env.DATABASE_URL ?? ''
  if (base.includes('connection_limit=')) return base
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}connection_limit=10`
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: { db: { url: buildDatabaseUrl() } },
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
