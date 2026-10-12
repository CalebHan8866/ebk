/**
 * audit-recent-players.ts
 *
 * Scrapes StatMuse for seasons 2019–2026 (all 30 teams), computes stableId
 * for each player-team entry, and cross-checks against the DB.
 *
 * Outputs:
 *   - Hash collision victims (missing from DB due to ID clash)
 *   - Players present in recent seasons but absent from DB for any reason
 *
 * Does NOT write to DB. Prints a patch list you can add to patch-missing-players.ts.
 *
 * Usage: npx ts-node --project tsconfig.seed.json scripts/audit-recent-players.ts
 */

import axios from 'axios'
import * as cheerio from 'cheerio'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TEAMS: { abbr: string; slug: string }[] = [
  { abbr: 'ATL', slug: 'hawks' },
  { abbr: 'BOS', slug: 'celtics' },
  { abbr: 'BKN', slug: 'nets' },
  { abbr: 'CHA', slug: 'hornets' },
  { abbr: 'CHI', slug: 'bulls' },
  { abbr: 'CLE', slug: 'cavaliers' },
  { abbr: 'DAL', slug: 'mavericks' },
  { abbr: 'DEN', slug: 'nuggets' },
  { abbr: 'DET', slug: 'pistons' },
  { abbr: 'GSW', slug: 'warriors' },
  { abbr: 'HOU', slug: 'rockets' },
  { abbr: 'IND', slug: 'pacers' },
  { abbr: 'LAC', slug: 'clippers' },
  { abbr: 'LAL', slug: 'lakers' },
  { abbr: 'MEM', slug: 'grizzlies' },
  { abbr: 'MIA', slug: 'heat' },
  { abbr: 'MIL', slug: 'bucks' },
  { abbr: 'MIN', slug: 'timberwolves' },
  { abbr: 'NOP', slug: 'pelicans' },
  { abbr: 'NYK', slug: 'knicks' },
  { abbr: 'OKC', slug: 'thunder' },
  { abbr: 'ORL', slug: 'magic' },
  { abbr: 'PHI', slug: '76ers' },
  { abbr: 'PHX', slug: 'suns' },
  { abbr: 'POR', slug: 'trail-blazers' },
  { abbr: 'SAC', slug: 'kings' },
  { abbr: 'SAS', slug: 'spurs' },
  { abbr: 'TOR', slug: 'raptors' },
  { abbr: 'UTA', slug: 'jazz' },
  { abbr: 'WAS', slug: 'wizards' },
]

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function stableId(playerSlug: string, team: string): number {
  const key = `sm::${playerSlug || 'noslug'}::${team}`
  let h = 5381
  for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0
  return (h % 2000000) + 2100000
}

function normalizePosition(raw: string): string {
  const s = raw.toUpperCase()
  if (s.includes('POINT') || s === 'PG') return 'PG'
  if (s.includes('SHOOTING') || s === 'SG') return 'SG'
  if (s.includes('SMALL') || s === 'SF') return 'SF'
  if (s.includes('POWER') || s === 'PF') return 'PF'
  if (s.includes('CENTER') || s === 'C' || s === 'CTR') return 'C'
  if (s === 'G' || s.includes('GUARD')) return 'PG'
  if (s === 'F' || s.includes('FORWARD')) return 'SF'
  return 'SF'
}

function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(' ')
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

interface SeasonRow {
  name: string
  playerSlug: string
  team: string
  year: number
  games: number
  ppg: number
  rpg: number
  apg: number
}

async function fetchSeasonPage(teamSlug: string, teamAbbr: string, year: number): Promise<SeasonRow[]> {
  const url = `https://www.statmuse.com/nba/ask/${teamSlug}-players-stats-in-${year}`
  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 20000 })
    const $ = cheerio.load(res.data)
    const table = $('table').first()
    if (!table.length) return []

    const headers = table.find('thead th').map((_, th) => $(th).text().trim().toLowerCase()).get()
    let iName = -1, iGP = -1, iPPG = -1, iRPG = -1, iAPG = -1
    headers.forEach((h, i) => {
      if (iName === -1 && (h === 'name' || h === 'player')) iName = i
      else if (iGP  === -1 && (h === 'gp' || h === 'g')) iGP = i
      else if (iPPG === -1 && (h === 'ppg' || h === 'pts')) iPPG = i
      else if (iRPG === -1 && (h === 'rpg' || h === 'reb')) iRPG = i
      else if (iAPG === -1 && (h === 'apg' || h === 'ast')) iAPG = i
    })
    if (iName === -1 || iGP === -1) return []

    const rows: SeasonRow[] = []
    table.find('tbody tr').each((_, tr) => {
      const cells = $(tr).find('td').map((_, td) => $(td).text().trim()).get()
      const playerSlug = $(tr).find('a[href*="/nba/player/"]').attr('href') ?? ''
      const name = (cells[iName] ?? '').replace(/\s+/g, ' ').trim().replace(/\s+[A-Z]\.\s+.+$/, '').trim()
      const games = parseInt((cells[iGP] ?? '').replace(/,/g, '')) || 0
      if (!name || games === 0) return
      rows.push({
        name,
        playerSlug: playerSlug.replace(/^\/nba\/player\//, ''),
        team: teamAbbr,
        year,
        games,
        ppg: parseFloat(cells[iPPG] ?? '0') || 0,
        rpg: parseFloat(cells[iRPG] ?? '0') || 0,
        apg: parseFloat(cells[iAPG] ?? '0') || 0,
      })
    })
    return rows
  } catch (err: any) {
    if (err?.response?.status === 429) {
      console.warn(`  Rate limited on ${teamAbbr} ${year}, sleeping 15s...`)
      await sleep(15000)
      return fetchSeasonPage(teamSlug, teamAbbr, year)
    }
    return []
  }
}

const posCache = new Map<string, string>()
async function fetchPosition(slug: string): Promise<string> {
  if (!slug) return 'SF'
  if (posCache.has(slug)) return posCache.get(slug)!
  try {
    const res = await axios.get(`https://www.statmuse.com/nba/player/${slug}`, { headers: HEADERS, timeout: 15000 })
    const $ = cheerio.load(res.data)
    const posText = [
      $('[class*="position"]').first().text(),
      $('[data-testid*="position"]').first().text(),
      $('p').filter((_, el) => /\b(point guard|shooting guard|small forward|power forward|center|guard|forward)\b/i.test($(el).text())).first().text(),
    ].find(t => t.trim())
    if (posText) {
      const pos = normalizePosition(posText.trim())
      posCache.set(slug, pos)
      return pos
    }
    const desc = $('meta[name="description"], meta[property="og:description"]').attr('content') ?? ''
    const m = desc.match(/\b(point guard|shooting guard|small forward|power forward|center|guard|forward)\b/i)
    if (m) {
      const pos = normalizePosition(m[1])
      posCache.set(slug, pos)
      return pos
    }
  } catch {}
  posCache.set(slug, 'SF')
  return 'SF'
}

async function main() {
  const START_YEAR = 2019
  const END_YEAR = 2026

  console.log(`\nEBK Player Audit — scanning seasons ${START_YEAR}–${END_YEAR} for all 30 teams\n`)

  // Collect all season rows
  const allRows: SeasonRow[] = []
  for (const team of TEAMS) {
    process.stdout.write(`[${team.abbr}] `)
    for (let year = START_YEAR; year <= END_YEAR; year++) {
      const rows = await fetchSeasonPage(team.slug, team.abbr, year)
      allRows.push(...rows)
      await sleep(800)
    }
    console.log()
    await sleep(1500)
  }

  console.log(`\nTotal season rows: ${allRows.length}`)

  // Aggregate per (playerSlug, team)
  const careerMap = new Map<string, {
    name: string; playerSlug: string; team: string
    totalGames: number; ppg: number; rpg: number; apg: number
    yearFrom: number; yearTo: number
  }>()

  for (const row of allRows) {
    const key = `${row.playerSlug || row.name.toLowerCase().replace(/\s+/g, '_')}::${row.team}`
    if (!careerMap.has(key)) {
      careerMap.set(key, { name: row.name, playerSlug: row.playerSlug, team: row.team, totalGames: 0, ppg: 0, rpg: 0, apg: 0, yearFrom: row.year, yearTo: row.year })
    }
    const e = careerMap.get(key)!
    const prev = e.totalGames, next = prev + row.games
    e.ppg = (e.ppg * prev + row.ppg * row.games) / next
    e.rpg = (e.rpg * prev + row.rpg * row.games) / next
    e.apg = (e.apg * prev + row.apg * row.games) / next
    e.totalGames = next
    e.name = row.name
    e.yearFrom = Math.min(e.yearFrom, row.year)
    e.yearTo = Math.max(e.yearTo, row.year)
  }

  const entries = Array.from(careerMap.values())
  console.log(`Unique player-team entries: ${entries.length}`)

  // Detect hash collisions among scraped entries
  const idToEntries = new Map<number, typeof entries>()
  for (const e of entries) {
    const id = stableId(e.playerSlug, e.team)
    if (!idToEntries.has(id)) idToEntries.set(id, [])
    idToEntries.get(id)!.push(e)
  }

  const collisionGroups = Array.from(idToEntries.entries()).filter(([, v]) => v.length > 1)
  if (collisionGroups.length > 0) {
    console.log(`\n⚠️  Hash collisions detected among scraped data (${collisionGroups.length} groups):`)
    for (const [id, group] of collisionGroups) {
      console.log(`  ID ${id}: ${group.map(e => `${e.name} (${e.team})`).join(' vs ')}`)
    }
  }

  // Load DB
  const allExisting = await prisma.player.findMany({ select: { id: true, firstName: true, lastName: true, team: true } })
  const dbById = new Map(allExisting.map(p => [p.id, p]))

  console.log(`\nDB has ${allExisting.length} players total`)

  // Find missing: scraped players whose ID doesn't exist in DB
  const missing: Array<{ id: number; name: string; team: string; playerSlug: string; e: any }> = []
  for (const e of entries) {
    const id = stableId(e.playerSlug, e.team)
    if (!dbById.has(id)) {
      missing.push({ id, name: e.name, team: e.team, playerSlug: e.playerSlug, e })
    }
  }

  if (missing.length === 0) {
    console.log('\n✅ All recent-season players are present in the DB!')
  } else {
    console.log(`\n❌ Missing from DB: ${missing.length} players from recent seasons`)

    // Fetch positions for missing players
    const slugsToFetch = Array.from(new Set(missing.map(m => m.playerSlug).filter(Boolean)))
    let fetched = 0
    for (const slug of slugsToFetch) {
      await fetchPosition(slug)
      fetched++
      if (fetched % 10 === 0) console.log(`  Positions: ${fetched}/${slugsToFetch.length}`)
      await sleep(600)
    }

    console.log('\n--- MISSING PLAYERS (add to patch-missing-players.ts) ---\n')
    // Sort by games desc (most impactful first)
    missing.sort((a, b) => b.e.totalGames - a.e.totalGames)

    // ID starts after existing patches
    let patchId = 9_000_003

    const patchEntries: string[] = []
    for (const m of missing) {
      const { firstName, lastName } = parseName(m.name)
      const pos = posCache.get(m.playerSlug) ?? 'SF'
      const e = m.e
      const entry = `  // ${m.name} (${m.team}) — ${Math.round(e.totalGames)} GP, hash collision victim (ID ${m.id} taken)
  {
    id: ${patchId},
    firstName: '${firstName.replace(/'/g, "\\'")}', lastName: '${lastName.replace(/'/g, "\\'")}',
    team: '${m.team}', position: '${pos}', positions: '${pos}',
    careerGames: ${Math.round(e.totalGames)},
    careerPPG: ${parseFloat(e.ppg.toFixed(1))},
    careerRPG: ${parseFloat(e.rpg.toFixed(1))},
    careerAPG: ${parseFloat(e.apg.toFixed(1))},
    yearFrom: ${e.yearFrom}, yearTo: ${e.yearTo},
  },`
      patchEntries.push(entry)
      console.log(entry)
      patchId++
    }

    // Also check for ID conflicts: same id taken by wrong player
    console.log('\n--- ID CONFLICTS (scraped player hashes to an existing DB entry with different name) ---\n')
    let conflicts = 0
    for (const e of entries) {
      const id = stableId(e.playerSlug, e.team)
      const dbPlayer = dbById.get(id)
      if (!dbPlayer) continue
      const { firstName, lastName } = parseName(e.name)
      const dbName = `${dbPlayer.firstName} ${dbPlayer.lastName}`
      const scrapedName = `${firstName} ${lastName}`
      if (dbName.toLowerCase() !== scrapedName.toLowerCase() || dbPlayer.team !== e.team) {
        console.log(`  ID ${id}: DB has "${dbName}" (${dbPlayer.team}) but StatMuse says "${scrapedName}" (${e.team})`)
        conflicts++
      }
    }
    if (conflicts === 0) console.log('  None — all matched IDs have correct player names.')
  }

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
