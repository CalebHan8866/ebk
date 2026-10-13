/**
 * scrape-salaries.ts
 *
 * Uses Google search results to look up NBA career earnings for every player
 * in the DB (yearFrom >= 1985), parses the dollar figure from the snippet /
 * AI overview text, and writes it to Player.careerEarnings.
 *
 * How it works:
 *   For each player, GET https://www.google.com/search?q={name}+NBA+career+earnings
 *   Parse the raw HTML for dollar amounts in the snippet/knowledge panel.
 *   Convert to raw dollars (e.g. "$15.2 million" → 15200000).
 *   Skip players where no clear figure is found (leave careerEarnings = 0).
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx ts-node --project tsconfig.seed.json scripts/scrape-salaries.ts
 *
 *   Or with a .env file that has DATABASE_URL:
 *   npx dotenv -e .env.production -- npx ts-node --project tsconfig.seed.json scripts/scrape-salaries.ts
 *
 * Env vars:
 *   DATABASE_URL  — postgres connection string (required)
 *   START_INDEX   — skip the first N players (useful for resuming a run, default 0)
 *   DRY_RUN       — set to "1" to log parsed results without writing to DB
 *   DELAY_MS      — ms between requests (default 2000)
 */

import axios from 'axios'
import * as cheerio from 'cheerio'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DRY_RUN  = process.env.DRY_RUN === '1'
const START_IDX = parseInt(process.env.START_INDEX ?? '0', 10) || 0
const DELAY_MS  = parseInt(process.env.DELAY_MS ?? '2000', 10) || 2000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Parse the first credible dollar figure out of free-form text.
 * Handles patterns like:
 *   $581 million | $1.7 billion | $347,482,547 | $15.2M | $6.5B | $12,300,000
 * Returns raw dollars, or null if nothing credible found.
 */
function parseDollars(text: string): number | null {
  // Flatten newlines
  const flat = text.replace(/\n/g, ' ')

  // Run all patterns, collect candidates, pick the most plausible
  const candidates: number[] = []

  // Pattern A: $N[.N] billion / B  (e.g. "$1.7 billion", "$2B")
  const billionRe = /\$(\d+(?:\.\d+)?)\s*(?:billion|B)\b/gi
  let m: RegExpExecArray | null
  while ((m = billionRe.exec(flat)) !== null) {
    const v = Math.round(parseFloat(m[1]) * 1_000_000_000)
    if (v >= 1_000_000 && v <= 3_000_000_000) candidates.push(v)
  }

  // Pattern B: $N[.N] million / M  (e.g. "$15.2 million", "$200M")
  const millionRe = /\$(\d+(?:\.\d+)?)\s*(?:million|M)\b/gi
  while ((m = millionRe.exec(flat)) !== null) {
    const v = Math.round(parseFloat(m[1]) * 1_000_000)
    if (v >= 100_000 && v <= 3_000_000_000) candidates.push(v)
  }

  // Pattern C: raw $NNN,NNN[,NNN] with commas, at least 6 digits
  const rawRe = /\$(\d{1,3}(?:,\d{3}){1,3})/g
  while ((m = rawRe.exec(flat)) !== null) {
    const digits = m[1].replace(/,/g, '')
    if (digits.length >= 6) {
      const v = parseInt(digits, 10)
      // Check for a multiplier immediately after (unlikely but guard anyway)
      const after = flat.slice(m.index + m[0].length).match(/^\s*(million|billion|M|B)\b/i)
      if (after) {
        const word = after[1].toLowerCase()
        const mult = (word === 'billion' || word === 'b') ? 1_000_000_000 : 1_000_000
        candidates.push(Math.round(v * mult))
      } else if (v >= 100_000 && v <= 2_000_000_000) {
        candidates.push(v)
      }
    }
  }

  if (candidates.length === 0) return null

  // Prefer the largest figure found (career total tends to be the biggest number cited)
  return Math.max(...candidates)
}

/**
 * Fetch Google search results for a player and return the page text relevant
 * to earnings (snippets, knowledge panel, AI overview).
 */
async function searchEarnings(firstName: string, lastName: string): Promise<string> {
  const query = encodeURIComponent(`${firstName} ${lastName} NBA career earnings`)
  const url   = `https://www.google.com/search?q=${query}&hl=en&gl=us&num=5`

  const { data } = await axios.get<string>(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 15_000,
  })

  const $ = cheerio.load(data)

  // Remove scripts and styles so we only get visible text
  $('script, style, noscript').remove()

  // Collect text from the most useful result areas:
  //   - .kp-wholepage  → knowledge panel / AI overview
  //   - #search        → organic results & snippets
  //   - body           → fallback
  const sources = ['.kp-wholepage', '#rso', '#search', 'body']
  for (const sel of sources) {
    const el = $(sel)
    if (el.length) {
      return el.text().slice(0, 8000)   // cap at 8k chars
    }
  }
  return $('body').text().slice(0, 8000)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('EBK Salary Scraper — Google search edition')
  if (DRY_RUN) console.log('*** DRY RUN — no DB writes ***')
  console.log()

  // Fetch all relevant players (1985 onwards)
  const allPlayers = await prisma.player.findMany({
    where: { yearFrom: { gte: 1985 } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      yearFrom: true,
      yearTo: true,
      careerEarnings: true,
    },
    orderBy: [{ yearFrom: 'desc' }, { lastName: 'asc' }],
  })

  // Split: unscraped first (priority), already-done last
  const needsScrape = allPlayers.filter(p => p.careerEarnings === 0)
  const alreadyDone = allPlayers.filter(p => p.careerEarnings > 0)
  const players     = [...needsScrape, ...alreadyDone]

  console.log(`Players in DB (yearFrom >= 1985): ${allPlayers.length}`)
  console.log(`  Already populated: ${alreadyDone.length}`)
  console.log(`  Needs scraping:    ${needsScrape.length}`)
  if (START_IDX > 0) console.log(`  Resuming from index: ${START_IDX}`)
  console.log()

  let updated  = 0
  let skipped  = 0
  let errors   = 0

  for (let i = START_IDX; i < players.length; i++) {
    const p = players[i]

    // Skip players already populated (re-run with a fresh DB to repopulate)
    if (p.careerEarnings > 0) {
      skipped++
      continue
    }

    const label = `${p.firstName} ${p.lastName} (${p.yearFrom}–${p.yearTo})`
    process.stdout.write(`[${i + 1}/${players.length}] ${label} ... `)

    let earnings: number | null = null
    let retries = 0

    while (retries < 3) {
      try {
        const text = await searchEarnings(p.firstName, p.lastName)
        earnings = parseDollars(text)
        break
      } catch (err: any) {
        retries++
        const isRateLimit = err?.response?.status === 429 || err?.response?.status === 503
        if (isRateLimit && retries < 3) {
          const wait = 30_000 * retries
          console.log(`\n    Rate limited — waiting ${wait / 1000}s (attempt ${retries}/3)`)
          await sleep(wait)
        } else if (retries >= 3) {
          console.log(`\n    Error after 3 retries: ${err.message}`)
          errors++
          break
        } else {
          console.log(`\n    Error: ${err.message}`)
          errors++
          break
        }
      }
    }

    if (!earnings || earnings <= 0) {
      console.log('no result')
      skipped++
    } else {
      const millions = (earnings / 1_000_000).toFixed(1)
      console.log(`$${millions}M`)

      if (!DRY_RUN) {
        await prisma.player.update({
          where: { id: p.id },
          data:  { careerEarnings: earnings },
        })
      }
      updated++
    }

    // Polite delay between requests
    await sleep(DELAY_MS)
  }

  console.log()
  console.log('=== Results ===')
  console.log(`  Updated:          ${updated}`)
  console.log(`  Skipped/no result: ${skipped}`)
  console.log(`  Errors:           ${errors}`)

  if (!DRY_RUN && updated > 0) {
    console.log()
    console.log('Spot-check (top earners):')
    const top = await prisma.player.findMany({
      where: { careerEarnings: { gt: 0 }, yearFrom: { gte: 1985 } },
      orderBy: { careerEarnings: 'desc' },
      take: 10,
      select: { firstName: true, lastName: true, careerEarnings: true, yearFrom: true },
    })
    for (const p of top) {
      const m = (p.careerEarnings / 1_000_000).toFixed(1)
      console.log(`  ${p.firstName} ${p.lastName} (${p.yearFrom}): $${m}M`)
    }
  }

  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  prisma.$disconnect().catch(() => {})
  process.exit(1)
})
