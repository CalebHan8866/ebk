import axios from 'axios'
import * as cheerio from 'cheerio'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface SeasonRow {
  name: string
  playerSlug: string  // /nba/player/{slug}
  team: string        // BBRef-style abbr
  year: number        // season-end year (1990 = 1989-90 season)
  games: number
  ppg: number
  rpg: number
  apg: number
}

// Aggregated career stats per (playerSlug, team)
interface TeamCareer {
  name: string
  playerSlug: string
  team: string
  totalGames: number
  careerPPG: number
  careerRPG: number
  careerAPG: number
  yearFrom: number
  yearTo: number
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

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

const HEADERS_HTTP = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

// URL: /nba/ask/{team-slug}-players-stats-in-{year}
// year = season-end year (e.g. 1990 = 1989-90 season)
async function fetchSeasonPage(teamSlug: string, teamAbbr: string, year: number): Promise<SeasonRow[]> {
  const url = `https://www.statmuse.com/nba/ask/${teamSlug}-players-stats-in-${year}`
  try {
    const res = await axios.get(url, { headers: HEADERS_HTTP, timeout: 20000 })
    const $ = cheerio.load(res.data)
    const table = $('table').first()
    if (!table.length) return []

    const headers = table.find('thead th').map((_, th) => $(th).text().trim().toLowerCase()).get()

    // Column indices — season queries: '', '', NAME, SEASON, TM, GP, MPG, PPG, RPG, APG, ...
    // Per-game averages (ppg/rpg/apg) appear before totals (pts/reb/ast), so first-match wins.
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

      const name  = cells[iName]?.replace(/\s+/g, ' ').trim() ?? ''
      const games = parseInt((cells[iGP] ?? '').replace(/,/g, '')) || 0
      const ppg   = parseFloat(cells[iPPG] ?? '0') || 0
      const rpg   = parseFloat(cells[iRPG] ?? '0') || 0
      const apg   = parseFloat(cells[iAPG] ?? '0') || 0

      if (!name || games === 0) return

      // StatMuse doubles the name: "John Havlicek J. Havlicek" → take the first (full) part
      // Pattern: "First Last F. Rest" or "First Last III R. Last III"
      const cleanName = name.replace(/\s+[A-Z]\.\s+.+$/, '').trim()

      rows.push({
        name: cleanName || name,
        playerSlug: playerSlug.replace(/^\/nba\/player\//, ''),
        team: teamAbbr,
        year,
        games,
        ppg,
        rpg,
        apg,
      })
    })

    return rows
  } catch (err: any) {
    if (err?.response?.status === 404) return []
    // Rate limited
    if (err?.response?.status === 429) {
      console.warn(`  Rate limited on ${teamSlug} ${year}, sleeping 10s...`)
      await sleep(10000)
      return []
    }
    // Other errors — log briefly and continue
    if (!err?.response?.status) {
      console.error(`  Error ${teamSlug}/${year}: ${err.message}`)
    }
    return []
  }
}

// Fetch position from player page (cached)
const positionCache = new Map<string, string>()

async function fetchPlayerPosition(playerSlug: string): Promise<string> {
  if (!playerSlug) return 'SF'
  if (positionCache.has(playerSlug)) return positionCache.get(playerSlug)!

  try {
    const url = `https://www.statmuse.com/nba/player/${playerSlug}`
    const res = await axios.get(url, { headers: HEADERS_HTTP, timeout: 15000 })
    const $ = cheerio.load(res.data)

    // Look for position in common selectors
    const posText = [
      $('[class*="position"]').first().text(),
      $('[data-testid*="position"]').first().text(),
      // StatMuse bio info often in small text near player name
      $('p').filter((_, el) => {
        const t = $(el).text()
        return /\b(point guard|shooting guard|small forward|power forward|center|guard|forward)\b/i.test(t)
      }).first().text(),
    ].find(t => t.trim())

    if (posText) {
      const pos = normalizePosition(posText.trim())
      positionCache.set(playerSlug, pos)
      return pos
    }

    // Try meta description
    const desc = $('meta[name="description"], meta[property="og:description"]').attr('content') ?? ''
    const m = desc.match(/\b(point guard|shooting guard|small forward|power forward|center|guard|forward)\b/i)
    if (m) {
      const pos = normalizePosition(m[1])
      positionCache.set(playerSlug, pos)
      return pos
    }
  } catch {}

  positionCache.set(playerSlug, 'SF')
  return 'SF'
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
  const parts = s.split(/[/,\-]/).map(p => p.trim())
  if (parts.length > 1) return normalizePosition(parts[0])
  return 'SF'
}

function mapPositions(primary: string): string[] {
  const map: Record<string, string[]> = {
    PG: ['PG'], SG: ['SG'], SF: ['SF'], PF: ['PF'], C: ['C'],
  }
  return map[primary] ?? ['SF']
}

function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(' ')
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

// Stable numeric ID scoped to StatMuse data (offset from BBRef range)
function stableId(playerSlug: string, team: string): number {
  const key = `sm::${playerSlug || 'noslug'}::${team}`
  let h = 5381
  for (let i = 0; i < key.length; i++) {
    h = ((h * 33) ^ key.charCodeAt(i)) >>> 0
  }
  // Use 2100000–4099999 range (separate from BBRef's 100000–2099999)
  return (h % 2000000) + 2100000
}

function computePercentileScores(entries: (TeamCareer & { position: string })[]) {
  const N = entries.length
  if (N === 0) return []

  function invertedPct(arr: number[], val: number): number {
    const sorted = [...arr].sort((a, b) => a - b)
    const rank = sorted.findIndex(v => v >= val)
    const r = rank === -1 ? N - 1 : rank
    return parseFloat(((N - 1 - r) / (N - 1) * 100).toFixed(1))
  }

  const games = entries.map(p => p.totalGames)
  const ppgs  = entries.map(p => p.careerPPG)
  const rpgs  = entries.map(p => p.careerRPG)
  const apgs  = entries.map(p => p.careerAPG)

  return entries.map(p => {
    const gpScore  = invertedPct(games, p.totalGames)
    const ppgScore = invertedPct(ppgs,  p.careerPPG)
    const rpgScore = invertedPct(rpgs,  p.careerRPG)
    const apgScore = invertedPct(apgs,  p.careerAPG)
    const ebkScore = parseFloat((gpScore * 0.25 + ppgScore * 0.35 + rpgScore * 0.20 + apgScore * 0.20).toFixed(1))
    return { ...p, gpScore, ppgScore, rpgScore, apgScore, ebkScore }
  })
}

async function scrapeTeam(team: { abbr: string; slug: string }): Promise<SeasonRow[]> {
  const allRows: SeasonRow[] = []
  const START_YEAR = 1980  // StatMuse franchise data starts ~1977 for most teams
  const END_YEAR   = 2025

  for (let year = START_YEAR; year <= END_YEAR; year++) {
    const rows = await fetchSeasonPage(team.slug, team.abbr, year)
    allRows.push(...rows)
    await sleep(1200)
  }

  return allRows
}

async function main() {
  console.log('EBK Player Scraper — StatMuse (season-by-season)')
  console.log(`Scraping 30 teams × seasons 1980–2025 (~1,380 requests)...\n`)

  const allSeasonRows: SeasonRow[] = []

  for (const team of TEAMS) {
    process.stdout.write(`[${team.abbr}] `)
    const rows = await scrapeTeam(team)
    console.log(`${rows.length} player-season rows`)
    allSeasonRows.push(...rows)
    await sleep(3000)  // extra pause between teams
  }

  console.log(`\nTotal raw season rows: ${allSeasonRows.length}`)

  // Aggregate per (playerSlug, team) — weighted average across seasons
  const careerMap = new Map<string, TeamCareer>()

  for (const row of allSeasonRows) {
    const key = `${row.playerSlug || row.name.toLowerCase().replace(/\s+/g, '_')}::${row.team}`

    if (!careerMap.has(key)) {
      careerMap.set(key, {
        name: row.name,
        playerSlug: row.playerSlug,
        team: row.team,
        totalGames: 0,
        careerPPG: 0,
        careerRPG: 0,
        careerAPG: 0,
        yearFrom: row.year,
        yearTo: row.year,
      })
    }

    const entry = careerMap.get(key)!
    const prev = entry.totalGames
    const next = prev + row.games

    entry.careerPPG = (entry.careerPPG * prev + row.ppg * row.games) / next
    entry.careerRPG = (entry.careerRPG * prev + row.rpg * row.games) / next
    entry.careerAPG = (entry.careerAPG * prev + row.apg * row.games) / next
    entry.totalGames = next
    entry.name = row.name  // keep latest spelling
    entry.yearFrom = Math.min(entry.yearFrom, row.year)
    entry.yearTo   = Math.max(entry.yearTo,   row.year)
  }

  const unique = Array.from(careerMap.values())
  console.log(`Unique player-team entries: ${unique.length}`)

  // Fetch positions for all players (batched with rate limiting)
  console.log('\nFetching player positions (this will take a while)...')
  const positions = new Map<string, string>()
  let fetched = 0

  // Collect unique slugs first
  const slugSet = new Set<string>()
  for (const p of unique) {
    if (p.playerSlug) slugSet.add(p.playerSlug)
  }

  const slugList = Array.from(slugSet)
  console.log(`  ${slugList.length} unique player slugs to resolve`)

  for (const slug of slugList) {
    const pos = await fetchPlayerPosition(slug)
    positions.set(slug, pos)
    fetched++
    if (fetched % 100 === 0) console.log(`  ${fetched}/${slugList.length} positions resolved`)
    await sleep(600)
  }
  console.log(`  Done resolving positions.`)

  // Build scored entries
  const withPositions = unique.map(p => ({
    ...p,
    position: positions.get(p.playerSlug) ?? 'SF',
  }))

  const scored = computePercentileScores(withPositions)

  // Save to DB
  console.log('\nClearing existing player data...')
  await prisma.player.deleteMany({})
  console.log('Saving...')

  let saved = 0
  let skipped = 0
  const seenIds = new Map<number, string>()

  for (const p of scored) {
    const { firstName, lastName } = parseName(p.name)
    const id = stableId(p.playerSlug, p.team)

    if (seenIds.has(id)) {
      console.warn(`  Hash collision: ${p.name} (${p.team}) vs ${seenIds.get(id)} — skipping`)
      skipped++
      continue
    }
    seenIds.set(id, `${p.playerSlug}::${p.team}`)

    try {
      await prisma.player.create({
        data: {
          id,
          firstName,
          lastName,
          team: p.team,
          position: p.position,
          positions: mapPositions(p.position).join(','),
          careerGames: Math.round(p.totalGames),
          careerPPG: parseFloat(p.careerPPG.toFixed(1)),
          careerRPG: parseFloat(p.careerRPG.toFixed(1)),
          careerAPG: parseFloat(p.careerAPG.toFixed(1)),
          yearFrom: p.yearFrom - 1,
          yearTo:   p.yearTo,
          ebkScore:    p.ebkScore,
          ebkGpScore:  p.gpScore,
          ebkPpgScore: p.ppgScore,
          ebkRpgScore: p.rpgScore,
          ebkApgScore: p.apgScore,
        }
      })
      saved++
      if (saved % 500 === 0) console.log(`  Saved ${saved}/${scored.length}...`)
    } catch (e: any) {
      skipped++
      if (skipped <= 5) console.error(`  Error saving ${p.name} (${p.team}): ${e.message}`)
    }
  }

  console.log(`\nDone! Saved ${saved} player-team entries. Skipped: ${skipped}`)

  const top10    = [...scored].sort((a, b) => b.ebkScore - a.ebkScore).slice(0, 10)
  const bottom10 = [...scored].sort((a, b) => a.ebkScore - b.ebkScore).slice(0, 10)

  console.log('\nTop 10 EBK (niche gems):')
  top10.forEach(p => console.log(`  ${p.name} (${p.team}): EBK ${p.ebkScore} — ${p.totalGames}GP ${p.careerPPG.toFixed(1)}PPG`))

  console.log('\nBottom 10 EBK (stars to avoid):')
  bottom10.forEach(p => console.log(`  ${p.name} (${p.team}): EBK ${p.ebkScore} — ${p.totalGames}GP ${p.careerPPG.toFixed(1)}PPG`))

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
