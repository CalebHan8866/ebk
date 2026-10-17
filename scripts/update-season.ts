/**
 * update-season.ts
 * Scrapes just the most recent NBA season from StatMuse and upserts players
 * into the existing DB without deleting anything.
 *
 * Usage: npx ts-node scripts/update-season.ts [year]
 *   year defaults to current calendar year (season-end year, e.g. 2026 = 2025-26)
 *
 * Runs in ~2 min. Safe to add to build script: `ts-node scripts/update-season.ts || true`
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

function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(' ')
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

function stableId(playerSlug: string, team: string): number {
  const key = `sm::${playerSlug || 'noslug'}::${team}`
  let h = 5381
  for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0
  return (h % 2000000) + 2100000
}

const positionCache = new Map<string, string>()

async function fetchPlayerPosition(playerSlug: string): Promise<string> {
  if (!playerSlug) return 'SF'
  if (positionCache.has(playerSlug)) return positionCache.get(playerSlug)!
  try {
    const url = `https://www.statmuse.com/nba/player/${playerSlug}`
    const res = await axios.get(url, { headers: HEADERS, timeout: 15000 })
    const $ = cheerio.load(res.data)
    const posText = [
      $('[class*="position"]').first().text(),
      $('[data-testid*="position"]').first().text(),
      $('p').filter((_, el) => /\b(point guard|shooting guard|small forward|power forward|center|guard|forward)\b/i.test($(el).text())).first().text(),
    ].find(t => t.trim())
    if (posText) {
      const pos = normalizePosition(posText.trim())
      positionCache.set(playerSlug, pos)
      return pos
    }
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

interface SeasonRow {
  name: string
  playerSlug: string
  team: string
  games: number
  ppg: number
  rpg: number
  apg: number
}

async function fetchTeamSeason(teamSlug: string, teamAbbr: string, year: number): Promise<SeasonRow[]> {
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
        games,
        ppg: parseFloat(cells[iPPG] ?? '0') || 0,
        rpg: parseFloat(cells[iRPG] ?? '0') || 0,
        apg: parseFloat(cells[iAPG] ?? '0') || 0,
      })
    })
    return rows
  } catch (err: any) {
    if (err?.response?.status === 429) {
      console.warn(`  Rate limited on ${teamAbbr}, sleeping 10s...`)
      await sleep(10000)
    }
    return []
  }
}

async function main() {
  const year = parseInt(process.argv[2] || '') || new Date().getFullYear()
  console.log(`\nEBK Season Update — scraping ${year - 1}-${String(year).slice(2)} season for all 30 teams...\n`)

  const allRows: SeasonRow[] = []

  for (const team of TEAMS) {
    const rows = await fetchTeamSeason(team.slug, team.abbr, year)
    console.log(`  ${team.abbr}: ${rows.length} players`)
    allRows.push(...rows)
    await sleep(1000)
  }

  console.log(`\nTotal rows: ${allRows.length}`)

  // Aggregate per (playerSlug, team)
  const careerMap = new Map<string, {
    name: string; playerSlug: string; team: string
    totalGames: number; ppg: number; rpg: number; apg: number
    yearFrom: number; yearTo: number
  }>()

  for (const row of allRows) {
    const key = `${row.playerSlug || row.name.toLowerCase().replace(/\s+/g, '_')}::${row.team}`
    if (!careerMap.has(key)) {
      careerMap.set(key, { name: row.name, playerSlug: row.playerSlug, team: row.team, totalGames: 0, ppg: 0, rpg: 0, apg: 0, yearFrom: year, yearTo: year })
    }
    const e = careerMap.get(key)!
    const prev = e.totalGames, next = prev + row.games
    e.ppg = (e.ppg * prev + row.ppg * row.games) / next
    e.rpg = (e.rpg * prev + row.rpg * row.games) / next
    e.apg = (e.apg * prev + row.apg * row.games) / next
    e.totalGames = next
    e.name = row.name
  }

  const entries = Array.from(careerMap.values())

  // Fetch positions for new slugs only
  const existingIds = new Set<number>()
  const existing = await prisma.player.findMany({ select: { id: true } })
  existing.forEach(p => existingIds.add(p.id))

  const newEntries = entries.filter(e => !existingIds.has(stableId(e.playerSlug, e.team)))
  console.log(`\n${entries.length} entries (${newEntries.length} new players need position lookup)`)

  const slugsToFetch = Array.from(new Set(newEntries.map(e => e.playerSlug).filter(Boolean)))
  let fetched = 0
  for (const slug of slugsToFetch) {
    await fetchPlayerPosition(slug)
    fetched++
    if (fetched % 20 === 0) console.log(`  Positions: ${fetched}/${slugsToFetch.length}`)
    await sleep(600)
  }

  // All players — fetch all current entries so we can merge stats
  const allExisting = await prisma.player.findMany()
  const existingMap = new Map(allExisting.map(p => [p.id, p]))

  // Compute global stats for percentile (merge new + existing)
  let saved = 0, updated = 0, skipped = 0

  for (const e of entries) {
    const id = stableId(e.playerSlug, e.team)
    const { firstName, lastName } = parseName(e.name)
    const position = positionCache.get(e.playerSlug) ?? (existingMap.get(id)?.position ?? 'SF')
    const positions = position

    const existing = existingMap.get(id)
    if (existing) {
      // Merge: weighted average of new season into existing career stats
      const totalGames = existing.careerGames + e.totalGames
      const careerPPG = parseFloat(((existing.careerPPG * existing.careerGames + e.ppg * e.totalGames) / totalGames).toFixed(1))
      const careerRPG = parseFloat(((existing.careerRPG * existing.careerGames + e.rpg * e.totalGames) / totalGames).toFixed(1))
      const careerAPG = parseFloat(((existing.careerAPG * existing.careerGames + e.apg * e.totalGames) / totalGames).toFixed(1))
      try {
        await prisma.player.update({
          where: { id },
          data: { careerGames: totalGames, careerPPG, careerRPG, careerAPG, yearTo: year, firstName, lastName }
        })
        updated++
      } catch { skipped++ }
    } else {
      // New player-team entry
      try {
        await prisma.player.create({
          data: {
            id,
            firstName, lastName,
            team: e.team,
            position,
            positions,
            careerGames: Math.round(e.totalGames),
            careerPPG: parseFloat(e.ppg.toFixed(1)),
            careerRPG: parseFloat(e.rpg.toFixed(1)),
            careerAPG: parseFloat(e.apg.toFixed(1)),
            yearFrom: year - 1,
            yearTo: year,
            ebkScore: 50, ebkGpScore: 50, ebkPpgScore: 50, ebkRpgScore: 50, ebkApgScore: 50,
          }
        })
        saved++
      } catch { skipped++ }
    }
  }

  console.log(`\nDone! Updated: ${updated}  New: ${saved}  Skipped: ${skipped}`)

  // Recompute EBK percentile scores for all players so new/updated entries are correct
  console.log('\nRecomputing EBK percentile scores across all players...')
  const allPlayers = await prisma.player.findMany()
  const N = allPlayers.length
  if (N > 0) {
    const invertedPct = (arr: number[], val: number): number => {
      const sorted = [...arr].sort((a, b) => a - b)
      const rank = sorted.findIndex(v => v >= val)
      const r = rank === -1 ? N - 1 : rank
      return parseFloat((100 - (r / (N - 1)) * 100).toFixed(1))
    }
    const percentileRank = (arr: number[], val: number): number => {
      const sorted = [...arr].sort((a, b) => a - b)
      const below = sorted.filter(v => v < val).length
      return parseFloat(((below / Math.max(1, N - 1)) * 100).toFixed(1))
    }
    const games = allPlayers.map(p => p.careerGames)
    const ppgs  = allPlayers.map(p => p.careerPPG)
    const rpgs  = allPlayers.map(p => p.careerRPG)
    const apgs  = allPlayers.map(p => p.careerAPG)
    // Use stored careerMPG (set by scrape-bbref.ts); new StatMuse-only players default to 0.
    const mpgs  = allPlayers.map(p => p.careerMPG)
    // Popularity percentile — re-apply the same penalty as scrape-popularity.ts
    // so running update-season.ts doesn't wipe out the popularity-adjusted scores.
    const views = allPlayers.map(p => p.wikiViews)

    let rescored = 0
    for (const p of allPlayers) {
      const gpScore  = invertedPct(games, p.careerGames)
      const ppgScore = invertedPct(ppgs,  p.careerPPG)
      const rpgScore = invertedPct(rpgs,  p.careerRPG)
      const apgScore = invertedPct(apgs,  p.careerAPG)
      const mpgScore = invertedPct(mpgs,  p.careerMPG)
      // Match scrape-bbref.ts weights: GP 20% · PPG 25% · MPG 20% · RPG 18% · APG 17%
      const statScore = gpScore * 0.20 + ppgScore * 0.25 + mpgScore * 0.20 + rpgScore * 0.18 + apgScore * 0.17
      // Re-apply popularity penalty (mirrors scrape-popularity.ts Phase 2)
      const popularityPct = p.wikiViews > 0 ? percentileRank(views, p.wikiViews) : 0
      const ebkScore = parseFloat(Math.max(0, Math.min(100, statScore - popularityPct * 0.20)).toFixed(1))
      try {
        await prisma.player.update({
          where: { id: p.id },
          data: { ebkScore, ebkGpScore: gpScore, ebkPpgScore: ppgScore, ebkRpgScore: rpgScore, ebkApgScore: apgScore, ebkMpgScore: mpgScore }
        })
        rescored++
      } catch { /* skip */ }
    }
    console.log(`Rescored ${rescored} players.`)
  }

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
