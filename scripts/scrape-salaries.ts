/**
 * scrape-salaries.ts
 *
 * Scrapes Basketball Reference salary pages (1991–2025), sums career earnings
 * per player, and writes them to the Player.careerEarnings column.
 *
 * Matching strategy:
 *   1. Build  href -> totalEarnings  from BBRef salary pages.
 *   2. Also build  normalizedName -> href  from the same pages.
 *   3. For every player in the DB, look up their normalizedName to find their
 *      href, then assign totalEarnings.
 *   4. Pre-salary-era players (before 1991) keep careerEarnings = 0; the
 *      fun-facts page falls back to the formula for those.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx ts-node --project tsconfig.seed.json scripts/scrape-salaries.ts
 *
 * Or if you have a .env with the production URL:
 *   npx dotenv -e .env.production -- npx ts-node --project tsconfig.seed.json scripts/scrape-salaries.ts
 */

import axios from 'axios'
import * as cheerio from 'cheerio'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip accents
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

interface SalaryRow {
  href: string
  name: string
  salary: number
}

async function fetchSalaryPage(year: number): Promise<SalaryRow[]> {
  const url = `https://www.basketball-reference.com/leagues/NBA_${year}_salaries.html`
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000,
    })
    const $ = cheerio.load(data)
    const results: SalaryRow[] = []
    const seen = new Set<string>()

    $('#div_salaries tbody tr, #salaries tbody tr').each((_, row) => {
      const $row = $(row)
      if ($row.hasClass('thead') || $row.hasClass('partial_table')) return

      const $link = $row.find('[data-stat="player"] a')
      const href = $link.attr('href') || ''
      const name = $link.text().trim()
      const salaryStr = $row.find('[data-stat="salary"]').text().trim()

      if (!href || !name) return

      // Each player may appear multiple times if traded mid-season; use first entry
      if (seen.has(href)) return
      seen.add(href)

      // Strip "$" and commas → parse integer
      const salary = parseInt(salaryStr.replace(/[$,]/g, ''), 10) || 0
      if (salary > 0) results.push({ href, name, salary })
    })

    return results
  } catch (err: any) {
    console.error(`  Error fetching ${year}: ${err.message}`)
    return []
  }
}

async function main() {
  console.log('EBK Salary Scraper — Basketball Reference (1991–2025)\n')

  // ── Step 1: Scrape all salary pages ────────────────────────────────────────
  const hrefEarnings = new Map<string, number>()   // href -> total career $
  const nameToHref   = new Map<string, string>()   // normalizedName -> href

  for (let year = 1991; year <= 2025; year++) {
    process.stdout.write(`  ${year - 1}–${year}... `)
    const rows = await fetchSalaryPage(year)
    let count = 0
    for (const { href, name, salary } of rows) {
      hrefEarnings.set(href, (hrefEarnings.get(href) ?? 0) + salary)
      const norm = normalizeName(name)
      if (!nameToHref.has(norm)) nameToHref.set(norm, href)
      count++
    }
    console.log(`${count} rows`)
    await sleep(2200)   // respect BBRef rate-limit (~30 req/min)
  }

  console.log(`\nTotal unique player hrefs with salary data: ${hrefEarnings.size}`)

  // ── Step 2: Match DB players and update ────────────────────────────────────
  const players = await prisma.player.findMany({
    select: { id: true, firstName: true, lastName: true, yearFrom: true, yearTo: true, careerEarnings: true },
  })
  console.log(`DB players: ${players.length}`)

  let updated = 0
  let skipped = 0
  let alreadyHad = 0

  for (const p of players) {
    const fullName = normalizeName(`${p.firstName} ${p.lastName}`)
    const href = nameToHref.get(fullName)

    if (!href) {
      skipped++
      continue
    }

    const earnings = hrefEarnings.get(href) ?? 0
    if (earnings <= 0) { skipped++; continue }

    // Don't overwrite if already populated from a previous run (unless worse)
    if (p.careerEarnings > 0 && Math.abs(p.careerEarnings - earnings) < 1000) {
      alreadyHad++
      continue
    }

    await prisma.player.update({
      where: { id: p.id },
      data:  { careerEarnings: earnings },
    })
    updated++
  }

  console.log(`\nResults:`)
  console.log(`  Updated:        ${updated}`)
  console.log(`  Already set:    ${alreadyHad}`)
  console.log(`  No match found: ${skipped} (pre-1991 era or name mismatch — formula fallback used)`)

  // ── Step 3: Sanity check a few well-known players ──────────────────────────
  const checks = ['LeBron', 'Kevin', 'Stephen', 'Kobe', 'Shaquille']
  for (const first of checks) {
    const p = await prisma.player.findFirst({
      where: { firstName: first, careerEarnings: { gt: 0 } },
      orderBy: { careerEarnings: 'desc' },
    })
    if (p) {
      const dollars = (p.careerEarnings / 1_000_000).toFixed(1)
      console.log(`  ${p.firstName} ${p.lastName}: $${dollars}M career`)
    }
  }

  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
