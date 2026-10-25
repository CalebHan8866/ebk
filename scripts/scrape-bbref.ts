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
  mpg: number    // minutes per game
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
  careerMPG: number
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

      if (MULTI_TEAM.has(team) || !team) return

      const key = `${href}::${team}`
      if (seenThisSeason.has(key)) return
      seenThisSeason.add(key)

      const gStr   = ($row.find('[data-stat="games"]').text().trim()   || $row.find('[data-stat="g"]').text().trim())
      const ppgStr = $row.find('[data-stat="pts_per_g"]').text().trim()
      const rpgStr = $row.find('[data-stat="trb_per_g"]').text().trim()
      const apgStr = $row.find('[data-stat="ast_per_g"]').text().trim()
      const mpgStr = $row.find('[data-stat="mp_per_g"]').text().trim()
      const name   = $row.find('[data-stat="name_display"] a, [data-stat="player"] a').text().trim()
      const pos    = $row.find('[data-stat="pos"]').text().trim()

      const games = parseInt(gStr) || 0
      const ppg   = parseFloat(ppgStr) || 0
      const rpg   = parseFloat(rpgStr) || 0
      const apg   = parseFloat(apgStr) || 0
      const mpg   = parseFloat(mpgStr) || 0

      if (!name || games === 0) return

      results.push({ href, name, pos, team, games, ppg, rpg, apg, mpg, year })
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

  // Handle generational suffixes: "Bruce Brown Jr." → firstName="Bruce", lastName="Brown Jr."
  const SUFFIXES = new Set(['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'])
  if (parts.length >= 3 && SUFFIXES.has(parts[parts.length - 1])) {
    // lastName = "Brown Jr.", firstName = "Bruce"
    return {
      firstName: parts.slice(0, -2).join(' '),
      lastName:  parts.slice(-2).join(' '),
    }
  }

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

// Include all player-team stints regardless of games played.
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

  // Aggregate per (href, team)
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
        careerMPG: 0,
        yearFrom: ps.year,
        yearTo: ps.year,
      })
    }

    const entry    = careerMap.get(key)!
    const prevGames = entry.totalGames
    const newGames  = prevGames + ps.games

    // Weighted average across all seasons with this team
    entry.careerPPG = (entry.careerPPG * prevGames + ps.ppg * ps.games) / newGames
    entry.careerRPG = (entry.careerRPG * prevGames + ps.rpg * ps.games) / newGames
    entry.careerAPG = (entry.careerAPG * prevGames + ps.apg * ps.games) / newGames
    entry.careerMPG = (entry.careerMPG * prevGames + ps.mpg * ps.games) / newGames
    entry.totalGames = newGames
    entry.allPositions.add(ps.pos)
    entry.yearFrom = Math.min(entry.yearFrom, ps.year)
    entry.yearTo   = Math.max(entry.yearTo,   ps.year)
    entry.name     = ps.name
  }

  const all = Array.from(careerMap.values()).filter(p => p.totalGames >= MIN_GAMES_PER_TEAM)
  console.log(`Unique player-team entries (≥${MIN_GAMES_PER_TEAM} game): ${all.length}`)

  // ── Propagate true career totals to all team rows ────────────────────────
  // Each entry currently holds per-team stats (games/ppg/etc. for that specific
  // team stint only).  Fun-facts and salary pages display "career" numbers, so
  // every row for a player (e.g. Butler CHI, Butler MIN, Butler PHI, Butler MIA)
  // needs to show his full career totals, not just one stint's worth.
  // The EBK scoring below will use these true totals — a star playing 1 000+
  // career games scores the same regardless of which team row is displayed.
  {
    interface CareerTotal {
      totalGames: number; ppgGames: number; rpgGames: number; apgGames: number; mpgGames: number
      ppgSum: number; rpgSum: number; apgSum: number; mpgSum: number
      yearFrom: number; yearTo: number
    }
    const byHref = new Map<string, CareerTotal>()

    for (const p of all) {
      const ct = byHref.get(p.href)
      if (ct) {
        ct.totalGames += p.totalGames
        ct.ppgSum     += p.careerPPG * p.totalGames
        ct.rpgSum     += p.careerRPG * p.totalGames
        ct.apgSum     += p.careerAPG * p.totalGames
        ct.mpgSum     += p.careerMPG * p.totalGames
        ct.ppgGames   += p.totalGames
        ct.rpgGames   += p.totalGames
        ct.apgGames   += p.totalGames
        ct.mpgGames   += p.totalGames
        ct.yearFrom    = Math.min(ct.yearFrom, p.yearFrom)
        ct.yearTo      = Math.max(ct.yearTo,   p.yearTo)
      } else {
        byHref.set(p.href, {
          totalGames: p.totalGames,
          ppgSum: p.careerPPG * p.totalGames, rpgSum: p.careerRPG * p.totalGames,
          apgSum: p.careerAPG * p.totalGames, mpgSum: p.careerMPG * p.totalGames,
          ppgGames: p.totalGames, rpgGames: p.totalGames,
          apgGames: p.totalGames, mpgGames: p.totalGames,
          yearFrom: p.yearFrom, yearTo: p.yearTo,
        })
      }
    }

    // Write career totals back to every team row for this player
    for (const p of all) {
      const ct = byHref.get(p.href)!
      p.totalGames  = ct.totalGames
      p.careerPPG   = ct.ppgGames  > 0 ? ct.ppgSum  / ct.ppgGames  : 0
      p.careerRPG   = ct.rpgGames  > 0 ? ct.rpgSum  / ct.rpgGames  : 0
      p.careerAPG   = ct.apgGames  > 0 ? ct.apgSum  / ct.apgGames  : 0
      p.careerMPG   = ct.mpgGames  > 0 ? ct.mpgSum  / ct.mpgGames  : 0
      p.yearFrom     = ct.yearFrom
      p.yearTo       = ct.yearTo
    }
    console.log(`Career totals propagated across ${byHref.size} unique players.`)
  }

  // Compute EBK scores (inverted percentile — lower stats = higher score)
  // MPG is included to break ties among 1-game players:
  //   someone who played 3 min scores higher than someone who played 38 min.
  // Weights: GP 20% · PPG 25% · MPG 20% · RPG 18% · APG 17%
  //
  // Popularity blending: if wikiViews are populated in the DB (via scrape-popularity.ts),
  // a popularityScore (direct percentile of wikiViews, 0–100) is blended in:
  //   finalEbkScore = max(0, statsEbkScore - popularityScore * 0.20)
  // This penalises culturally famous players who would otherwise score as "niche picks".
  // wikiViews for each player is looked up from the DB at scrape time.
  function computePercentileScores(entries: TeamCareer[], wikiViewsMap: Map<string, number>) {
    const N = entries.length

    function invertedPct(arr: number[], val: number): number {
      const sorted = [...arr].sort((a, b) => a - b)
      const rank = sorted.findIndex(v => v >= val)
      const r = rank === -1 ? N - 1 : rank
      return parseFloat(((N - 1 - r) / (N - 1) * 100).toFixed(1))
    }

    function directPct(arr: number[], val: number): number {
      const below = arr.filter(v => v < val).length
      return parseFloat(((below / Math.max(N - 1, 1)) * 100).toFixed(1))
    }

    const games = entries.map(p => p.totalGames)
    const ppgs  = entries.map(p => p.careerPPG)
    const rpgs  = entries.map(p => p.careerRPG)
    const apgs  = entries.map(p => p.careerAPG)
    const mpgs  = entries.map(p => p.careerMPG)

    // Collect all wikiViews values (0 for players not yet fetched) for percentile calc
    const views = entries.map(p => wikiViewsMap.get(p.name) ?? 0)

    return entries.map((p, i) => {
      const gpScore  = invertedPct(games, p.totalGames)
      const ppgScore = invertedPct(ppgs,  p.careerPPG)
      const rpgScore = invertedPct(rpgs,  p.careerRPG)
      const apgScore = invertedPct(apgs,  p.careerAPG)
      const mpgScore = invertedPct(mpgs,  p.careerMPG)
      const statsEbk = gpScore * 0.20 + ppgScore * 0.25 + mpgScore * 0.20 + rpgScore * 0.18 + apgScore * 0.17

      // Popularity blending (only applied when wikiViews data exists)
      const wikiViews       = views[i]
      const popularityScore = wikiViews > 0 ? directPct(views.filter(v => v > 0), wikiViews) : 0
      const ebkScore        = parseFloat(
        Math.max(0, statsEbk - popularityScore * 0.20).toFixed(1)
      )

      return { ...p, gpScore, ppgScore, rpgScore, apgScore, mpgScore, ebkScore, wikiViews }
    })
  }

  // Load existing wikiViews from DB keyed by player name (best-effort)
  const wikiViewsMap = new Map<string, number>()
  try {
    const existingPlayers = await prisma.player.findMany({
      select: { firstName: true, lastName: true, wikiViews: true },
      where:  { wikiViews: { gt: 0 } },
    })
    for (const p of existingPlayers) {
      const key = `${p.firstName} ${p.lastName}`
      if (!wikiViewsMap.has(key)) wikiViewsMap.set(key, p.wikiViews)
    }
    console.log(`Loaded wikiViews for ${wikiViewsMap.size} players from DB.`)
  } catch {
    console.log('Could not load wikiViews from DB — popularity blending disabled.')
  }

  const scored = computePercentileScores(all, wikiViewsMap)

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
          careerMPG: parseFloat(p.careerMPG.toFixed(1)),
          yearFrom: p.yearFrom - 1,
          yearTo:   p.yearTo,
          ebkScore:    p.ebkScore,
          ebkGpScore:  p.gpScore,
          ebkPpgScore: p.ppgScore,
          ebkRpgScore: p.rpgScore,
          ebkApgScore: p.apgScore,
          ebkMpgScore: p.mpgScore,
          wikiViews:   p.wikiViews,
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
  top10.forEach(p => console.log(
    `  ${p.name} (${p.team}): EBK ${p.ebkScore} — ${p.totalGames}GP ${p.careerMPG.toFixed(1)}MPG ${p.careerPPG.toFixed(1)}PPG`
  ))

  console.log('\nBottom 10 EBK (stars to avoid):')
  bottom10.forEach(p => console.log(
    `  ${p.name} (${p.team}): EBK ${p.ebkScore} — ${p.totalGames}GP ${p.careerMPG.toFixed(1)}MPG ${p.careerPPG.toFixed(1)}PPG`
  ))

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
