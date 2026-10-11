import axios from 'axios'
import * as cheerio from 'cheerio'
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// One row per player-team-season
interface PlayerTeamSeason {
  href: string
  name: string
  pos: string
  team: string   // real team abbr, never TOT/2TM/etc.
  games: number
  ppg: number
  rpg: number
  apg: number
  year: number
}

// Aggregated stats for one player on one team across all seasons with that team
interface TeamCareer {
  href: string
  team: string
  name: string
  primaryPos: string
  allPositions: Set<string>
  totalGames: number
  careerPPG: number
  careerRPG: number
  careerAPG: number
  yearFrom: number   // earliest season-end year on this team
  yearTo: number     // latest season-end year on this team
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const MULTI_TEAM = new Set(['TOT', '2TM', '3TM', '4TM', '5TM'])

async function fetchSeasonPage(year: number): Promise<PlayerTeamSeason[]> {
  const url = `https://www.basketball-reference.com/leagues/NBA_${year}_per_game.html`

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000,
    })

    const $ = cheerio.load(response.data)
    const results: PlayerTeamSeason[] = []
    // Track (href, team) pairs already added this season to avoid exact duplicates
    const seenThisSeason = new Set<string>()

    $('#per_game_stats tbody tr').each((_, row) => {
      const $row = $(row)
      if ($row.hasClass('thead') || $row.hasClass('partial_table')) return

      const href = $row.find('[data-stat="name_display"] a, [data-stat="player"] a').attr('href') || ''
      if (!href) return

      const team = (
        $row.find('[data-stat="team_name_abbr"]').text().trim() ||
        $row.find('[data-stat="team_id"]').text().trim()
      )

      // Skip TOT/multi-team aggregate rows — we want real team stints only
      if (MULTI_TEAM.has(team) || !team) return

      const key = `${href}::${team}`
      if (seenThisSeason.has(key)) return
      seenThisSeason.add(key)

      const gStr = (
        $row.find('[data-stat="games"]').text().trim() ||
        $row.find('[data-stat="g"]').text().trim()
      )
      const ppgStr = $row.find('[data-stat="pts_per_g"]').text().trim()
      const rpgStr = $row.find('[data-stat="trb_per_g"]').text().trim()
      const apgStr = $row.find('[data-stat="ast_per_g"]').text().trim()
      const name   = $row.find('[data-stat="name_display"] a, [data-stat="player"] a').text().trim()
      const pos    = $row.find('[data-stat="pos"]').text().trim()

      const games = parseInt(gStr) || 0
      const ppg   = parseFloat(ppgStr) || 0
      const rpg   = parseFloat(rpgStr) || 0
      const apg   = parseFloat(apgStr) || 0

      if (!name || games === 0) return

      results.push({ href, name, pos, team, games, ppg, rpg, apg, year })
    })

    return results
  } catch (err: any) {
    console.error(`  Error fetching ${year}:`, err.message)
    return []
  }
}

function mapPositions(posStr: string): string[] {
  const posMap: Record<string, string[]> = {
    'PG': ['PG'], 'SG': ['SG'], 'SF': ['SF'], 'PF': ['PF'], 'C': ['C'],
    'G': ['PG', 'SG'], 'F': ['SF', 'PF'],
    'G-F': ['SG', 'SF'], 'F-G': ['SF', 'SG'],
    'F-C': ['PF', 'C'], 'C-F': ['C', 'PF'],
    'PF-C': ['PF', 'C'], 'C-PF': ['C', 'PF'],
    'SF-SG': ['SF', 'SG'], 'SG-SF': ['SG', 'SF'],
    'PG-SG': ['PG', 'SG'], 'SG-PG': ['SG', 'PG'],
    'SF-PF': ['SF', 'PF'], 'PF-SF': ['PF', 'SF'],
  }
  return posMap[posStr] || ['SF']
}

function getAllPositions(posSet: Set<string>): string[] {
  const result = new Set<string>()
  Array.from(posSet).forEach(pos => mapPositions(pos).forEach(p => result.add(p)))
  if (result.size === 0) result.add('SF')
  return Array.from(result)
}

function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(' ')
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

// Stable numeric ID from BBRef href + team abbr (djb2, range 100000–2099999)
function stableId(href: string, team: string): number {
  const key = `${href}::${team}`
  let h = 5381
  for (let i = 0; i < key.length; i++) {
    h = ((h * 33) ^ key.charCodeAt(i)) >>> 0
  }
  return (h % 2000000) + 100000
}

// Minimum total games a player must have played for a team to be included.
// Set to 1 to include all players regardless of games played.
const MIN_GAMES_PER_TEAM = 1

async function main() {
  console.log('EBK Player Scraper — Basketball Reference')
  console.log('Scraping NBA seasons 1950–2025 (team-split mode)...\n')

  const allSeasons: PlayerTeamSeason[] = []

  for (let year = 1950; year <= 2025; year++) {
    process.stdout.write(`Fetching ${year - 1}-${year}... `)
    const seasons = await fetchSeasonPage(year)
    allSeasons.push(...seasons)
    console.log(`${seasons.length} player-team rows`)
    if (year < 2024) await sleep(2500)
  }

  console.log(`\nTotal player-team-seasons: ${allSeasons.length}`)

  // Aggregate per (href, team) — each entry = one player on one team
  const careerMap = new Map<string, TeamCareer>()

  for (const ps of allSeasons) {
    const key = `${ps.href}::${ps.team}`

    if (!careerMap.has(key)) {
      careerMap.set(key, {
        href: ps.href,
        team: ps.team,
        name: ps.name,
        primaryPos: ps.pos,
        allPositions: new Set([ps.pos]),
        totalGames: 0,
        careerPPG: 0,
        careerRPG: 0,
        careerAPG: 0,
        yearFrom: ps.year,
        yearTo: ps.year,
      })
    }

    const entry = careerMap.get(key)!
    const prevGames = entry.totalGames
    const newGames  = prevGames + ps.games

    // Weighted average across all seasons with this team
    entry.careerPPG = (entry.careerPPG * prevGames + ps.ppg * ps.games) / newGames
    entry.careerRPG = (entry.careerRPG * prevGames + ps.rpg * ps.games) / newGames
    entry.careerAPG = (entry.careerAPG * prevGames + ps.apg * ps.games) / newGames
    entry.totalGames = newGames
    entry.allPositions.add(ps.pos)
    entry.yearFrom = Math.min(entry.yearFrom, ps.year)
    entry.yearTo   = Math.max(entry.yearTo,   ps.year)
    entry.name     = ps.name  // keep most recent spelling
  }

  const all = Array.from(careerMap.values()).filter(p => p.totalGames >= MIN_GAMES_PER_TEAM)
  console.log(`Unique player-team entries (≥${MIN_GAMES_PER_TEAM} games): ${all.length}`)

  // Compute EBK scores (inverted percentile — lower stats = higher score)
  function computePercentileScores(entries: TeamCareer[]) {
    const N = entries.length

    function invertedPct(arr: number[], val: number): number {
      const sorted = [...arr].sort((a, b) => a - b)
      const rank = sorted.findIndex(v => v >= val)
      return ((N - 1 - rank) / (N - 1)) * 100
    }

    const games = entries.map(p => p.totalGames)
    const ppgs  = entries.map(p => p.careerPPG)
    const rpgs  = entries.map(p => p.careerRPG)
    const apgs  = entries.map(p => p.careerAPG)

    return entries.map(p => {
      const gpScore  = parseFloat(invertedPct(games, p.totalGames).toFixed(1))
      const ppgScore = parseFloat(invertedPct(ppgs,  p.careerPPG).toFixed(1))
      const rpgScore = parseFloat(invertedPct(rpgs,  p.careerRPG).toFixed(1))
      const apgScore = parseFloat(invertedPct(apgs,  p.careerAPG).toFixed(1))
      const ebkScore = parseFloat((gpScore * 0.25 + ppgScore * 0.35 + rpgScore * 0.20 + apgScore * 0.20).toFixed(1))
      return { ...p, gpScore, ppgScore, rpgScore, apgScore, ebkScore }
    })
  }

  const scored = computePercentileScores(all)

  // Wipe and re-insert
  console.log('\nClearing existing player data...')
  await prisma.player.deleteMany({})
  console.log('Saving...')

  let saved = 0
  let skipped = 0
  const seenIds = new Map<number, string>()

  for (const p of scored) {
    const { firstName, lastName } = parseName(p.name)
    const allPositions = getAllPositions(p.allPositions)
    const primaryPos   = allPositions[0]
    const id = stableId(p.href, p.team)

    if (seenIds.has(id)) {
      console.warn(`Hash collision: ${p.href}::${p.team} vs ${seenIds.get(id)} → skipping`)
      skipped++
      continue
    }
    seenIds.set(id, `${p.href}::${p.team}`)

    try {
      await prisma.player.create({
        data: {
          id,
          firstName,
          lastName,
          team: p.team,
          position: primaryPos,
          positions: allPositions.join(','),
          careerGames: Math.round(p.totalGames),
          careerPPG: parseFloat(p.careerPPG.toFixed(1)),
          careerRPG: parseFloat(p.careerRPG.toFixed(1)),
          careerAPG: parseFloat(p.careerAPG.toFixed(1)),
          yearFrom: p.yearFrom - 1,   // season start year
          yearTo:   p.yearTo,          // season end year
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
      if (skipped <= 5) console.error(`Error saving ${p.name} (${p.team}):`, e.message)
    }
  }

  console.log(`\nDone! Saved ${saved} player-team entries. Skipped: ${skipped}`)

  const top10    = [...scored].sort((a, b) => b.ebkScore - a.ebkScore).slice(0, 10)
  const bottom10 = [...scored].sort((a, b) => a.ebkScore - b.ebkScore).slice(0, 10)

  console.log('\nTop 10 EBK (niche gems):')
  top10.forEach(p => console.log(`  ${p.name} (${p.team}): EBK ${p.ebkScore} — ${p.totalGames}GP ${p.careerPPG.toFixed(1)}PPG ${p.yearFrom}-${p.yearTo}`))

  console.log('\nBottom 10 EBK (stars to avoid):')
  bottom10.forEach(p => console.log(`  ${p.name} (${p.team}): EBK ${p.ebkScore} — ${p.totalGames}GP ${p.careerPPG.toFixed(1)}PPG`))

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
