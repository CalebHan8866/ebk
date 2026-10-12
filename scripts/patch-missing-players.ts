/**
 * patch-missing-players.ts
 * Upserts players that are known to be missing from the DB due to hash collisions
 * or incomplete scrapes. IDs start at 9_000_000 to avoid colliding with
 * the seed range (1-71) or scraper range (2_100_000 – 4_099_999).
 *
 * Safe to run repeatedly — uses upsert.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface PatchPlayer {
  id: number
  firstName: string
  lastName: string
  team: string
  position: string
  positions: string
  careerGames: number
  careerPPG: number
  careerRPG: number
  careerAPG: number
  yearFrom: number
  yearTo: number
}

const PATCHES: PatchPlayer[] = [
  // ── John Wall ───────────────────────────────────────────────────────────────
  // Washington Wizards (2010-11 through 2018-19) — hash collision dropped WAS entry
  {
    id: 9_000_001,
    firstName: 'John', lastName: 'Wall',
    team: 'WAS', position: 'PG', positions: 'PG',
    careerGames: 589, careerPPG: 19.0, careerRPG: 4.3, careerAPG: 9.0,
    yearFrom: 2011, yearTo: 2019,
  },

  // ── Luka Dončić (LAL) ───────────────────────────────────────────────────────
  // Traded from DAL to LAL Feb 2025. 2024-25 season: 54 GP for LAL.
  // Only add if not yet populated by update-season scrape.
  {
    id: 9_000_002,
    firstName: 'Luka', lastName: 'Dončić',
    team: 'LAL', position: 'PG', positions: 'PG,SG,SF',
    careerGames: 54, careerPPG: 28.4, careerRPG: 8.9, careerAPG: 7.3,
    yearFrom: 2025, yearTo: 2025,
  },

  // ── Matthew Dellavedova (MIL) ────────────────────────────────────────────────
  // Hash collision: stableId(dellavedova-slug, MIL) == stableId(rayjon-tucker-slug, PHI)
  // PHI scraped after MIL so Tucker survived; Dellavedova's MIL career entry is missing.
  {
    id: 9_000_003,
    firstName: 'Matthew', lastName: 'Dellavedova',
    team: 'MIL', position: 'PG', positions: 'PG',
    careerGames: 199, careerPPG: 5.7, careerRPG: 2.8, careerAPG: 3.3,
    yearFrom: 2015, yearTo: 2019,
  },

  // ── Paul Reed (PHI) ──────────────────────────────────────────────────────────
  // Hash collision: stableId(paul-reed-slug, PHI) == stableId(filipowski-slug, UTA)
  // UTA scraped after PHI so Filipowski survived; Paul Reed's PHI career entry is missing.
  {
    id: 9_000_004,
    firstName: 'Paul', lastName: 'Reed',
    team: 'PHI', position: 'PF', positions: 'PF,C',
    careerGames: 222, careerPPG: 7.5, careerRPG: 5.0, careerAPG: 0.9,
    yearFrom: 2021, yearTo: 2024,
  },
]

async function main() {
  console.log(`\nPatching ${PATCHES.length} missing players...`)

  for (const p of PATCHES) {
    const ebkScore = 50 // will be recalculated on next full rescore
    try {
      await prisma.player.upsert({
        where: { id: p.id },
        create: {
          ...p,
          ebkScore, ebkGpScore: 50, ebkPpgScore: 50, ebkRpgScore: 50, ebkApgScore: 50,
        },
        update: {
          firstName: p.firstName, lastName: p.lastName,
          team: p.team, position: p.position, positions: p.positions,
          careerGames: p.careerGames, careerPPG: p.careerPPG,
          careerRPG: p.careerRPG, careerAPG: p.careerAPG,
          yearFrom: p.yearFrom, yearTo: p.yearTo,
        },
      })
      console.log(`  ✓ ${p.firstName} ${p.lastName} (${p.team})`)
    } catch (e: any) {
      console.error(`  ✗ ${p.firstName} ${p.lastName} (${p.team}): ${e.message}`)
    }
  }

  console.log('Done patching.')
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
