/**
 * scrape-salaries.ts
 *
 * Scrapes Spotrac's NBA career earnings rankings
 * (https://www.spotrac.com/nba/rankings/career/) and writes
 * Player.careerEarnings to the Railway PostgreSQL DB.
 *
 * Strategy:
 *   1. Scrape pages 1–MAX_PAGES of https://www.spotrac.com/nba/rankings/career/.
 *   2. Parse player name + career total from the HTML table rows.
 *   3. Normalize names (strip accents/apostrophes, lowercase) and match against DB.
 *   4. Update Player.careerEarnings for every match found.
 *   5. For DB players not matched on Spotrac, leave careerEarnings=0 so the
 *      fun-facts page uses the era-based estimate fallback.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx ts-node --project tsconfig.seed.json scripts/scrape-salaries.ts
 *
 * Env vars:
 *   DATABASE_URL  — postgres connection string (required; .env only has SQLite placeholder)
 *   DRY_RUN       — set to "1" to print matches without writing to DB
 *   MAX_PAGES     — max pages to fetch (default 50; each page lists ~25 players)
 */

import axios from 'axios'
import * as cheerio from 'cheerio'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DRY_RUN   = process.env.DRY_RUN === '1'
const MAX_PAGES = parseInt(process.env.MAX_PAGES ?? '50', 10) || 50

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.spotrac.com/nba/',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Normalize a player name for fuzzy matching.
 * Strips accents (é→e, ć→c), apostrophes, lowercases, collapses whitespace.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip combining accent marks
    .replace(/[''`]/g, '')             // strip apostrophes (O'Neal → ONeal)
    .replace(/[^a-z ]/g, '')          // remove punctuation, dots, hyphens
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Parse a Spotrac dollar string like "$581,348,328" into raw dollars.
 */
function parseDollars(s: string): number {
  const clean = s.replace(/[$,\s]/g, '')
  const n = parseInt(clean, 10)
  return isNaN(n) ? 0 : n
}

interface EarningsRow {
  name: string
  earnings: number
}

/**
 * Fetch one paginated page of the Spotrac NBA career earnings rankings table.
 * Returns parsed { name, earnings } rows, or [] on 404 / parse failure.
 *
 * Spotrac HTML structure (as of 2024–2025):
 *   <table class="tracker"> or similar table
 *     <tbody>
 *       <tr>
 *         <td class="rank">1</td>
 *         <td class="player"><a href="/nba/...">LeBron James</a></td>
 *         <td class="total">$581,348,328</td>
 *         ...
 *       </tr>
 *     </tbody>
 *
 * If the layout has changed, the fallback selector tries every <a> inside
 * a <td> paired with a <td> that starts with "$".
 */
async function fetchSpotracPage(page: number): Promise<EarningsRow[]> {
  const url = page === 1
    ? 'https://www.spotrac.com/nba/rankings/career/'
    : `https://www.spotrac.com/nba/rankings/career/page/${page}/`

  try {
    const { data, status } = await axios.get<string>(url, {
      headers: HEADERS,
      timeout: 20_000,
      validateStatus: s => s < 500,
    })

    if (status === 404 || status === 403) {
      if (page === 1) console.warn(`  Spotrac returned ${status} — may require login or has changed URL.`)
      return []
    }

    const $ = cheerio.load(data)
    const rows: EarningsRow[] = []
    const seen = new Set<string>()

    // Primary selector: table rows with a player link + dollar cell
    $('table tr').each((_, tr) => {
      const $tr = $(tr)
      const cells = $tr.find('td')
      if (cells.length < 2) return

      // Find player name (first <a> with an href to /nba/...)
      const nameLink = $tr.find('a[href*="/nba/"]').first()
      const name = nameLink.text().trim()
      if (!name || seen.has(name)) return

      // Find earnings cell — first td whose text starts with "$"
      let earningsStr = ''
      cells.each((_, td) => {
        const t = $(td).text().trim()
        if (!earningsStr && t.startsWith('$')) earningsStr = t
      })

      const earnings = parseDollars(earningsStr)
      if (earnings > 0) {
        rows.push({ name, earnings })
        seen.add(name)
      }
    })

    // Fallback: div/span layout (Spotrac sometimes uses JS-rendered tables)
    if (rows.length === 0) {
      $('[class*="player-name"], [class*="player_name"]').each((_, el) => {
        const name = $(el).text().trim()
        if (!name || seen.has(name)) return
        // Look for the nearest element containing a dollar amount
        const container = $(el).closest('tr, [class*="row"]')
        const earningsEl = container.find('[class*="total"], [class*="earnings"], [class*="salary"]').first()
        let earningsStr = earningsEl.text().trim()
        if (!earningsStr) {
          container.find('td, span, div').each((_, c) => {
            const t = $(c).text().trim()
            if (!earningsStr && t.startsWith('$') && t.length > 3) earningsStr = t
          })
        }
        const earnings = parseDollars(earningsStr)
        if (earnings > 0) { rows.push({ name, earnings }); seen.add(name) }
      })
    }

    return rows
  } catch (err: any) {
    console.error(`  Error fetching page ${page}: ${err.message}`)
    return []
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('EBK Salary Scraper — Spotrac Career Earnings\n')
  if (DRY_RUN) console.log('*** DRY RUN — no DB writes ***\n')

  // ── Phase 1: Scrape Spotrac ─────────────────────────────────────────────────
  const earningsMap = new Map<string, number>()   // normalizedName → career $

  let totalScraped = 0
  for (let page = 1; page <= MAX_PAGES; page++) {
    process.stdout.write(`  Page ${page}... `)
    const rows = await fetchSpotracPage(page)

    if (rows.length === 0) {
      console.log('(empty — stopping)')
      break
    }

    for (const { name, earnings } of rows) {
      const norm = normalizeName(name)
      if (!earningsMap.has(norm) || earningsMap.get(norm)! < earnings) {
        earningsMap.set(norm, earnings)
      }
    }

    totalScraped += rows.length
    console.log(`${rows.length} rows  (${earningsMap.size} unique so far)`)
    await sleep(2_000)  // polite delay
  }

  console.log(`\nTotal unique players from Spotrac: ${earningsMap.size}`)

  if (earningsMap.size === 0) {
    console.log('\nWARNING: No data scraped from Spotrac.')
    console.log('Spotrac may have changed their layout or requires authentication.')
    console.log('Inspect https://www.spotrac.com/nba/rankings/career/ manually')
    console.log('and update the selectors in fetchSpotracPage() if needed.\n')
    await prisma.$disconnect()
    return
  }

  // ── Phase 2: Match DB players ───────────────────────────────────────────────
  const dbPlayers = await prisma.player.findMany({
    select: { id: true, firstName: true, lastName: true, careerEarnings: true },
  })
  console.log(`DB players total: ${dbPlayers.length}`)

  let updated   = 0
  let alreadyOk = 0
  let noMatch   = 0

  for (const p of dbPlayers) {
    const norm = normalizeName(`${p.firstName} ${p.lastName}`)
    const earnings = earningsMap.get(norm) ?? 0

    if (earnings <= 0) { noMatch++; continue }

    // Skip if already set to approximately the same value (idempotent)
    if (p.careerEarnings > 0 && Math.abs(p.careerEarnings - earnings) < 10_000) {
      alreadyOk++
      continue
    }

    if (DRY_RUN) {
      console.log(`  [DRY] ${p.firstName} ${p.lastName}: $${(earnings / 1_000_000).toFixed(1)}M`)
    } else {
      await prisma.player.update({ where: { id: p.id }, data: { careerEarnings: earnings } })
    }
    updated++
  }

  console.log('\n=== Results ===')
  console.log(`  Updated:           ${updated}`)
  console.log(`  Already up-to-date: ${alreadyOk}`)
  console.log(`  No Spotrac match:   ${noMatch}  (pre-1985 era or name mismatch — estimate fallback used)`)

  // ── Phase 3: Spot-check ─────────────────────────────────────────────────────
  if (!DRY_RUN && updated > 0) {
    console.log('\nSpot-check (top 10 by earnings):')
    const top = await prisma.player.findMany({
      where: { careerEarnings: { gt: 0 } },
      orderBy: { careerEarnings: 'desc' },
      take: 10,
      select: { firstName: true, lastName: true, careerEarnings: true },
    })
    for (const p of top) {
      console.log(`  ${p.firstName} ${p.lastName}: $${(p.careerEarnings / 1_000_000).toFixed(1)}M`)
    }
  }

  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  prisma.$disconnect().catch(() => {})
  process.exit(1)
})
