/**
 * scrape-salaries.ts
 *
 * Two-phase Basketball Reference scraper:
 *   Phase 1: Fetch the 26 alphabet index pages (/players/a/ … /players/z/)
 *            to build a normalizedName → href map for all ~5,000 BBRef players.
 *   Phase 2: For each DB player matched to a href, fetch their individual BBRef
 *            page, extract the salary table hidden in HTML comments, sum career
 *            total, and write to Player.careerEarnings.
 *
 * Pre-1985 players are skipped (no meaningful salary data exists).
 * Players with no BBRef match keep careerEarnings=0 → fun-facts uses formula.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx ts-node --project tsconfig.seed.json scripts/scrape-salaries.ts
 *
 * Env vars:
 *   DATABASE_URL  — postgres connection string (required)
 *   DRY_RUN       — set to "1" to log without writing to DB
 *   DELAY_MS      — ms between player-page fetches (default 2200)
 *   START_INDEX   — skip first N matched players (resume a partial run)
 *   REFETCH       — set to "1" to re-scrape players that already have a value (fixes wrong data)
 */

import axios from 'axios'
import * as cheerio from 'cheerio'
import { PrismaClient } from '@prisma/client'

let prisma = new PrismaClient()

/** Reconnect if Railway has closed the idle connection */
async function ensureConnected() {
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    await prisma.$disconnect().catch(() => {})
    prisma = new PrismaClient()
    await prisma.$connect()
  }
}

const DRY_RUN    = process.env.DRY_RUN    === '1'
const DELAY_MS   = parseInt(process.env.DELAY_MS   ?? '2200', 10) || 2200
const START_IDX  = parseInt(process.env.START_INDEX ?? '0',   10) || 0
const REFETCH    = process.env.REFETCH    === '1'   // re-scrape even if value already set

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip accents
    .replace(/[''`\.]/g, '')            // strip apostrophes/dots
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Expand HTML comments so hidden BBRef tables become parseable */
function expandComments(html: string): string {
  return html.replace(/<!--([\s\S]*?)-->/g, (_, inner) => inner)
}

// ── Phase 1: Build name→href map from alphabet index pages ─────────────────

async function fetchAlphabetIndex(letter: string): Promise<Map<string, string>> {
  const url = `https://www.basketball-reference.com/players/${letter}/`
  const nameToHref = new Map<string, string>()
  try {
    const { data } = await axios.get<string>(url, { headers: HEADERS, timeout: 20_000 })
    const $ = cheerio.load(data)
    // Each player is an <a> inside #div_players table
    $('table#players a, #div_players a').each((_, el) => {
      const href = $(el).attr('href') || ''
      const name = $(el).text().trim()
      if (href.startsWith('/players/') && name) {
        nameToHref.set(normalizeName(name), href)
      }
    })
    // Fallback: any player link in the page
    if (nameToHref.size === 0) {
      $(`a[href^="/players/${letter}/"]`).each((_, el) => {
        const href = $(el).attr('href') || ''
        const name = $(el).attr('title') || $(el).text().trim()
        if (name) nameToHref.set(normalizeName(name), href)
      })
    }
  } catch (err: any) {
    console.error(`  Error fetching /players/${letter}/: ${err.message}`)
  }
  return nameToHref
}

// ── Phase 2: Extract career salary total from individual player page ────────

async function fetchCareerEarnings(href: string): Promise<number> {
  const url = `https://www.basketball-reference.com${href}`
  const MAX_RETRIES = 4
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data } = await axios.get<string>(url, { headers: HEADERS, timeout: 20_000 })
      const expanded = expandComments(data)
      // Use cheerio to find salary cells — more robust than regex since
      // BBRef sometimes puts csk= before data-stat= (varying attribute order).
      // Skip any summary/totals row where the year cell is empty or says "Career".
      const $ = cheerio.load(expanded)
      let total = 0
      $('td[data-stat="salary"]').each((_, el) => {
        const row = $(el).closest('tr')
        // Skip header rows and career-total rows
        const yearCell = row.find('th[data-stat="year_id"], td[data-stat="year_id"]')
        const yearText = yearCell.text().trim()
        if (!yearText || yearText.toLowerCase() === 'career') return
        const csk = $(el).attr('csk')
        if (csk) total += parseInt(csk, 10)
        else {
          // Fallback: parse the text content (strip $ and commas)
          const raw = $(el).text().replace(/[$,\s]/g, '')
          const n = parseInt(raw, 10)
          if (!isNaN(n) && n > 0) total += n
        }
      })
      return total
    } catch (err: any) {
      if (err?.response?.status === 429) {
        // Rate-limited — wait with exponential backoff before retrying
        const backoff = Math.min(60_000, 8_000 * Math.pow(2, attempt))
        process.stdout.write(` [429, retry ${attempt + 1}/${MAX_RETRIES} in ${backoff / 1000}s]`)
        if (attempt < MAX_RETRIES) {
          await sleep(backoff)
          continue
        }
      }
      if (err?.response?.status !== 404) console.error(`  Error ${href}: ${err.message}`)
      return 0
    }
  }
  return 0
}

const HREF_CACHE_FILE = '/tmp/bbref-href-cache.json'

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('EBK Salary Scraper — Basketball Reference (alphabet index → player pages)')
  if (DRY_RUN) console.log('*** DRY RUN — no DB writes ***')
  console.log()

  // ── Phase 1: Build name→href map (use cache if available) ────────────────
  const globalNameToHref = new Map<string, string>()

  const fs = await import('fs')
  if (fs.existsSync(HREF_CACHE_FILE)) {
    console.log(`Phase 1: Loading cached href map from ${HREF_CACHE_FILE}...`)
    const cached: Record<string, string> = JSON.parse(fs.readFileSync(HREF_CACHE_FILE, 'utf8'))
    Object.entries(cached).forEach(([name, href]) => globalNameToHref.set(name, href))
    console.log(`  Loaded ${globalNameToHref.size} entries from cache.\n`)
  } else {
    console.log('Phase 1: Building name→href map from alphabet index pages...')
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
      process.stdout.write(`  /players/${letter}/... `)
      const map = await fetchAlphabetIndex(letter)
      map.forEach((href, name) => {
        if (!globalNameToHref.has(name)) globalNameToHref.set(name, href)
      })
      console.log(`${map.size} players  (${globalNameToHref.size} total)`)
      await sleep(4000)
    }
    // Only save cache if we got a meaningful number of players (guard against 429 wipeouts)
    if (globalNameToHref.size > 1000) {
      const cacheObj: Record<string, string> = {}
      globalNameToHref.forEach((href, name) => { cacheObj[name] = href })
      fs.writeFileSync(HREF_CACHE_FILE, JSON.stringify(cacheObj))
      console.log(`  Cache saved to ${HREF_CACHE_FILE}`)
    } else {
      console.error(`  Phase 1 only found ${globalNameToHref.size} players — likely rate-limited. NOT saving cache. Wait and retry.`)
      process.exit(1)
    }
  }

  console.log(`Total unique BBRef players: ${globalNameToHref.size}`)

  // ── Phase 2: Match DB players ─────────────────────────────────────────────
  console.log('\nPhase 2: Matching DB players to BBRef hrefs...')
  const dbPlayers = await prisma.player.findMany({
    where:  { yearFrom: { gte: 1985 } },
    select: { id: true, firstName: true, lastName: true, yearFrom: true, yearTo: true, careerEarnings: true },
    orderBy: [{ yearFrom: 'desc' }, { lastName: 'asc' }],
  })
  console.log(`DB players (yearFrom ≥ 1985): ${dbPlayers.length}`)

  // Deduplicate by href — multiple DB entries (same player, different teams)
  // should all get the same career total, but we only need to fetch once.
  const hrefToPlayers = new Map<string, typeof dbPlayers>()
  let noMatch = 0

  for (const p of dbPlayers) {
    const norm = normalizeName(`${p.firstName} ${p.lastName}`)
    const href = globalNameToHref.get(norm)
    if (!href) { noMatch++; continue }
    if (!hrefToPlayers.has(href)) hrefToPlayers.set(href, [])
    hrefToPlayers.get(href)!.push(p)
  }

  const uniqueHrefs = Array.from(hrefToPlayers.keys())
  console.log(`Matched: ${uniqueHrefs.length} unique players  |  No match: ${noMatch}`)
  console.log(`Estimated time: ~${Math.round(uniqueHrefs.length * DELAY_MS / 60000)} minutes\n`)

  // ── Phase 3: Fetch player pages and update DB ─────────────────────────────
  console.log('Phase 3: Fetching salary data and updating DB...')
  let updated  = 0
  let skipped  = 0
  let errors   = 0

  for (let i = START_IDX; i < uniqueHrefs.length; i++) {
    // Reconnect every 50 players — Railway drops idle connections after ~5 min
    if (i % 50 === 0) await ensureConnected()

    const href    = uniqueHrefs[i]
    const players = hrefToPlayers.get(href)!
    const label   = `${players[0].firstName} ${players[0].lastName}`

    process.stdout.write(`[${i + 1}/${uniqueHrefs.length}] ${label}... `)

    // Skip if all already populated (unless REFETCH=1 to fix wrong values)
    if (!REFETCH && players.every(p => p.careerEarnings > 0)) {
      console.log(`already set ($${(players[0].careerEarnings / 1e6).toFixed(1)}M)`)
      skipped += players.length
      continue
    }

    const earnings = await fetchCareerEarnings(href)

    if (earnings <= 0) {
      console.log('no salary data')
      errors++
    } else {
      const millions = (earnings / 1e6).toFixed(1)
      console.log(`$${millions}M`)

      if (!DRY_RUN) {
        // Update ALL DB entries for this player (they share the same career total)
        for (const p of players) {
          if (Math.abs(p.careerEarnings - earnings) > 10_000) {
            // Retry once on connection drop (P1017)
            for (let attempt = 0; attempt < 2; attempt++) {
              try {
                await prisma.player.updateMany({ where: { id: p.id }, data: { careerEarnings: earnings } })
                break
              } catch (e: any) {
                if (e?.code === 'P1017' && attempt === 0) {
                  await ensureConnected()
                } else { throw e }
              }
            }
          }
        }
      }
      updated += players.length
    }

    await sleep(DELAY_MS)
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n=== Results ===')
  console.log(`  Updated DB entries: ${updated}`)
  console.log(`  Already populated:  ${skipped}`)
  console.log(`  No salary data:     ${errors}`)
  console.log(`  No BBRef match:     ${noMatch}`)

  if (!DRY_RUN && updated > 0) {
    console.log('\nTop 10 career earners in DB:')
    const top = await prisma.player.findMany({
      where:   { careerEarnings: { gt: 0 } },
      orderBy: { careerEarnings: 'desc' },
      take:    10,
      select:  { firstName: true, lastName: true, careerEarnings: true },
    })
    for (const p of top) {
      console.log(`  ${p.firstName} ${p.lastName}: $${(p.careerEarnings / 1e6).toFixed(1)}M`)
    }
  }

  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  prisma.$disconnect()
  process.exit(1)
})
