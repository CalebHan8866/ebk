/**
 * scrape-popularity.ts
 *
 * Fetches Wikipedia pageview totals for every player in the DB and stores
 * them in Player.wikiViews. After all views are collected it re-computes
 * ebkScore for each player, blending in a popularity penalty:
 *
 *   popularityPct  = direct percentile rank of wikiViews (0–100, higher = more famous)
 *   newEbkScore    = clamp(0, oldEbkScore - popularityPct * 0.20, 100)
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx ts-node --project tsconfig.seed.json scripts/scrape-popularity.ts
 *
 * Env vars:
 *   DATABASE_URL  — postgres connection string (required)
 *   START_INDEX   — skip first N players for resuming a partial run (default 0)
 *   DRY_RUN       — set to "1" to log without writing to DB
 */

import axios from 'axios'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const START_IDX = parseInt(process.env.START_INDEX ?? '0', 10) || 0
const DRY_RUN   = process.env.DRY_RUN === '1'
const DELAY_MS  = 2000  // 2 s between requests — polite to Wikimedia

const HEADERS = {
  'User-Agent': 'EBK-NBAGame/1.0 (basketball trivia game; contact: noreply@ebk.app)',
  'Accept': 'application/json',
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Check that a Wikipedia article title plausibly belongs to this player.
 *  Both last name AND first name (or at least 4 chars of it) must appear in
 *  the title (case-insensitive). This prevents "Dwight Anderson" → "Dwight Howard"
 *  and "Greg Anderson" → "Greg Oden" false matches. */
function titleMatchesPlayer(title: string, firstName: string, lastName: string): boolean {
  const t = title.toLowerCase()
  const last = lastName.toLowerCase()
  const first = firstName.toLowerCase()
  if (!t.includes(last)) return false
  // Check first name or its first 4 characters appear in the title
  if (t.includes(first)) return true
  if (first.length >= 4 && t.includes(first.slice(0, 4))) return true
  return false
}

/** Search Wikipedia for the best article title for a player.
 *  Fetches up to 5 results and returns the first one whose title
 *  actually contains the player's name. */
async function searchWikipediaTitle(firstName: string, lastName: string): Promise<string | null> {
  const query = encodeURIComponent(`${firstName} ${lastName} basketball NBA`)
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&format=json&srlimit=5`

  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 10_000 })
    const results: Array<{ title: string }> = data?.query?.search ?? []
    for (const result of results) {
      if (titleMatchesPlayer(result.title, firstName, lastName)) return result.title
    }
    return null
  } catch {
    return null
  }
}

/** Fetch total Wikipedia pageviews for a given article over ~3 years (monthly).
 *  The window rolls forward dynamically so re-runs always cover recent seasons. */
async function fetchWikiPageviews(title: string): Promise<number> {
  // URL-encode title (spaces → underscores per Wikimedia convention)
  const encodedTitle = encodeURIComponent(title.replace(/ /g, '_'))
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), 1) // first day of current month
  const start = new Date(end.getFullYear() - 3, end.getMonth(), 1) // 3 years ago
  const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}0100`
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/${encodedTitle}/monthly/${fmt(start)}/${fmt(end)}`

  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 10_000 })
    const items: Array<{ views: number }> = data?.items ?? []
    return items.reduce((sum, item) => sum + (item.views ?? 0), 0)
  } catch (err: any) {
    // 404 = article not found in pageview data — that's fine, just return 0
    if (err?.response?.status !== 404) {
      // silently swallow other errors too — we just won't have views for this player
    }
    return 0
  }
}

/** Compute direct percentile rank (0–100) for a value in an array.
 *  Higher value → higher percentile. */
function percentileRank(arr: number[], val: number): number {
  const N = arr.length
  if (N <= 1) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  // Number of values strictly below val
  const below = sorted.filter(v => v < val).length
  return parseFloat(((below / (N - 1)) * 100).toFixed(1))
}

async function main() {
  console.log('EBK Popularity Scraper — Wikipedia Pageviews')
  if (DRY_RUN) console.log('*** DRY RUN — no DB writes ***')
  console.log()

  // ── Phase 1: Fetch wikiViews for each player ──────────────────────────────
  // Load all players. To resume a partial run we skip the first START_IDX that
  // already have wikiViews > 0 or that we've already attempted.
  const allPlayers = await prisma.player.findMany({
    select: { id: true, firstName: true, lastName: true, wikiViews: true, ebkScore: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  console.log(`Total players in DB: ${allPlayers.length}`)

  // Deduplicate by name so we only hit Wikipedia once per unique full name
  // (many players have multiple DB entries — one per team — with the same name)
  const nameToViews = new Map<string, number>()

  // Collect unique names we need to look up (skip ones already fetched)
  const uniqueNames: Array<{ firstName: string; lastName: string; key: string }> = []
  const seenNames   = new Set<string>()

  for (const p of allPlayers) {
    const key = `${p.firstName.trim()} ${p.lastName.trim()}`
    if (!seenNames.has(key)) {
      seenNames.add(key)
      uniqueNames.push({ firstName: p.firstName.trim(), lastName: p.lastName.trim(), key })
    }
  }

  console.log(`Unique player names to look up: ${uniqueNames.length}`)
  console.log(`Starting at index: ${START_IDX}`)
  console.log(`Estimated time: ~${Math.round((uniqueNames.length - START_IDX) * DELAY_MS / 60000)} minutes\n`)

  // Pre-populate from DB for names we can skip (wikiViews already set > 0 on
  // ANY player record with that name means we already fetched it)
  for (const p of allPlayers) {
    if (p.wikiViews > 0) {
      const key = `${p.firstName.trim()} ${p.lastName.trim()}`
      if (!nameToViews.has(key)) nameToViews.set(key, p.wikiViews)
    }
  }

  let fetched  = 0
  let skipped  = 0
  let notFound = 0

  for (let i = START_IDX; i < uniqueNames.length; i++) {
    const { firstName, lastName, key } = uniqueNames[i]

    // Already in cache from DB
    if (nameToViews.has(key)) {
      process.stdout.write(`[${i + 1}/${uniqueNames.length}] ${key} — cached (${nameToViews.get(key)!.toLocaleString()} views)\n`)
      skipped++
      continue
    }

    process.stdout.write(`[${i + 1}/${uniqueNames.length}] ${key}... `)

    const title = await searchWikipediaTitle(firstName, lastName)
    if (!title) {
      console.log('no Wikipedia article found')
      nameToViews.set(key, 0)
      notFound++
      await sleep(DELAY_MS)
      continue
    }

    const views = await fetchWikiPageviews(title)
    nameToViews.set(key, views)
    console.log(`"${title}" — ${views.toLocaleString()} views`)
    fetched++

    if (!DRY_RUN) {
      // Write wikiViews to all DB players with this name
      const ids = allPlayers
        .filter(p => `${p.firstName.trim()} ${p.lastName.trim()}` === key)
        .map(p => p.id)

      if (ids.length > 0) {
        await prisma.player.updateMany({
          where: { id: { in: ids } },
          data:  { wikiViews: views },
        })
      }
    }

    await sleep(DELAY_MS)
  }

  console.log(`\nPhase 1 complete. Fetched: ${fetched}  Cached/skipped: ${skipped}  Not found: ${notFound}`)

  // ── Phase 2: Compute popularity percentile and update ebkScore ────────────
  console.log('\nPhase 2: Computing popularity percentiles and updating ebkScore...')

  // Re-load all players with fresh wikiViews
  const players = await prisma.player.findMany({
    select: { id: true, firstName: true, lastName: true, wikiViews: true, ebkScore: true },
  })

  // Merge in any in-memory results for players not yet written (DRY_RUN or same run)
  const viewsForPlayer = players.map(p => {
    const key = `${p.firstName.trim()} ${p.lastName.trim()}`
    // If wikiViews is 0 in DB but we just fetched it this run, use in-memory value
    const views = p.wikiViews > 0 ? p.wikiViews : (nameToViews.get(key) ?? 0)
    return { ...p, resolvedViews: views }
  })

  const allViews = viewsForPlayer.map(p => p.resolvedViews)

  // Compute new ebkScores
  const updates: Array<{ id: number; newEbkScore: number; popularityPct: number; oldEbkScore: number }> = []

  for (const p of viewsForPlayer) {
    const popularityPct = percentileRank(allViews, p.resolvedViews)
    const newEbkScore   = parseFloat(Math.max(0, Math.min(100, p.ebkScore - popularityPct * 0.20)).toFixed(1))
    updates.push({ id: p.id, newEbkScore, popularityPct, oldEbkScore: p.ebkScore })
  }

  // Sort by largest reduction for logging
  const biggestChanges = [...updates].sort((a, b) => (b.oldEbkScore - b.newEbkScore) - (a.oldEbkScore - a.newEbkScore))

  console.log('\nTop 10 biggest ebkScore reductions (most famous players):')
  biggestChanges.slice(0, 10).forEach(u => {
    const p = players.find(x => x.id === u.id)!
    console.log(`  ${p.firstName} ${p.lastName}: ${u.oldEbkScore} → ${u.newEbkScore}  (popPct=${u.popularityPct})`)
  })

  // Check Scalabrine specifically
  const scalabrine = updates.find(u => {
    const p = players.find(x => x.id === u.id)!
    return p.lastName.toLowerCase() === 'scalabrine'
  })
  if (scalabrine) {
    const sp = players.find(x => x.id === scalabrine.id)!
    const views = viewsForPlayer.find(x => x.id === scalabrine.id)!.resolvedViews
    console.log(`\nScalabrine check: wikiViews=${views.toLocaleString()} oldEbk=${scalabrine.oldEbkScore} popPct=${scalabrine.popularityPct} → newEbk=${scalabrine.newEbkScore}`)
  }

  if (!DRY_RUN) {
    console.log('\nWriting updated ebkScores to DB...')
    let written = 0
    for (const u of updates) {
      if (Math.abs(u.newEbkScore - u.oldEbkScore) >= 0.05) {
        await prisma.player.update({
          where: { id: u.id },
          data:  { ebkScore: u.newEbkScore },
        })
        written++
      }
    }
    console.log(`Updated ${written} player ebkScores.`)
  } else {
    console.log('(DRY RUN — no ebkScore updates written)')
  }

  console.log('\nDone.')
  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  prisma.$disconnect()
  process.exit(1)
})
