/**
 * scrape-season-data.ts
 *
 * Scrapes Basketball Reference for per-season salary + advanced stats (WS, VORP),
 * merges them, computes surplus value, and writes static JSON to
 * public/data/salary/ for the /salary page to consume.
 *
 * Output:
 *   public/data/salary/YEAR.json   — one file per season-end year (e.g. 1995.json = 1994-95)
 *   public/data/salary/meta.json   — cap history, coverage, formula version, last-updated
 *
 * Usage:
 *   npx ts-node --project tsconfig.seed.json scripts/scrape-season-data.ts
 *
 * Env vars:
 *   START_YEAR  — first season end-year to scrape (default 1991)
 *   END_YEAR    — last  season end-year to scrape  (default current year)
 *   DELAY_MS    — ms between page fetches (default 3500)
 *   FORCE       — set to "1" to re-scrape seasons already cached
 *   YEAR        — set to a single year to only refresh that season
 */

import axios from 'axios'
import * as cheerio from 'cheerio'
import * as fs from 'fs'
import * as path from 'path'

const DELAY_MS   = parseInt(process.env.DELAY_MS   ?? '3500', 10)
const FORCE      = process.env.FORCE   === '1'
const SINGLE_YEAR = process.env.YEAR ? parseInt(process.env.YEAR, 10) : null

const CURRENT_YEAR = new Date().getMonth() >= 9
  ? new Date().getFullYear() + 1   // Oct–Dec: new season has started
  : new Date().getFullYear()

const START_YEAR = SINGLE_YEAR ?? parseInt(process.env.START_YEAR ?? '1991', 10)
const END_YEAR   = SINGLE_YEAR ?? parseInt(process.env.END_YEAR   ?? String(CURRENT_YEAR), 10)

const OUT_DIR = path.join(process.cwd(), 'public', 'data', 'salary')
const RAW_DIR = path.join('/tmp', 'ebk-salary-raw')

// ── Salary cap history (NBA official records + BBRef) ───────────────────────
// Keyed by season-end year. Source: basketball-reference.com/contracts/salary-cap.html
const CAP_HISTORY: Record<number, { cap: number; rookieMin: number; label: string }> = {
  1985: { cap:  3_600_000, rookieMin:   75_000, label: '1984-85' },
  1986: { cap:  4_233_000, rookieMin:   75_000, label: '1985-86' },
  1987: { cap:  4_945_000, rookieMin:   75_000, label: '1986-87' },
  1988: { cap:  6_164_000, rookieMin:   75_000, label: '1987-88' },
  1989: { cap:  7_232_000, rookieMin:  100_000, label: '1988-89' },
  1990: { cap:  9_800_000, rookieMin:  130_000, label: '1989-90' },
  1991: { cap: 11_871_000, rookieMin:  150_000, label: '1990-91' },
  1992: { cap: 12_500_000, rookieMin:  160_000, label: '1991-92' },
  1993: { cap: 14_000_000, rookieMin:  175_000, label: '1992-93' },
  1994: { cap: 15_175_000, rookieMin:  200_000, label: '1993-94' },
  1995: { cap: 15_964_000, rookieMin:  225_000, label: '1994-95' },
  1996: { cap: 23_000_000, rookieMin:  242_000, label: '1995-96' },
  1997: { cap: 24_363_000, rookieMin:  247_000, label: '1996-97' },
  1998: { cap: 26_900_000, rookieMin:  272_000, label: '1997-98' },
  1999: { cap: 30_000_000, rookieMin:  287_500, label: '1998-99' },  // lockout
  2000: { cap: 34_000_000, rookieMin:  315_000, label: '1999-00' },
  2001: { cap: 35_500_000, rookieMin:  385_000, label: '2000-01' },
  2002: { cap: 42_500_000, rookieMin:  349_000, label: '2001-02' },
  2003: { cap: 40_271_000, rookieMin:  366_931, label: '2002-03' },
  2004: { cap: 43_870_000, rookieMin:  385_085, label: '2003-04' },
  2005: { cap: 43_870_000, rookieMin:  398_762, label: '2004-05' },
  2006: { cap: 49_500_000, rookieMin:  412_718, label: '2005-06' },
  2007: { cap: 53_135_000, rookieMin:  427_163, label: '2006-07' },
  2008: { cap: 55_630_000, rookieMin:  442_114, label: '2007-08' },
  2009: { cap: 58_680_000, rookieMin:  457_588, label: '2008-09' },
  2010: { cap: 57_700_000, rookieMin:  473_604, label: '2009-10' },
  2011: { cap: 58_044_000, rookieMin:  473_604, label: '2010-11' },
  2012: { cap: 58_044_000, rookieMin:  457_588, label: '2011-12' },  // lockout
  2013: { cap: 58_044_000, rookieMin:  490_180, label: '2012-13' },
  2014: { cap: 58_679_000, rookieMin:  507_336, label: '2013-14' },
  2015: { cap: 63_065_000, rookieMin:  525_093, label: '2014-15' },
  2016: { cap: 70_000_000, rookieMin:  543_471, label: '2015-16' },
  2017: { cap: 94_143_000, rookieMin:  543_471, label: '2016-17' },
  2018: { cap: 99_093_000, rookieMin:  562_493, label: '2017-18' },
  2019: { cap: 101_869_000, rookieMin: 582_180, label: '2018-19' },
  2020: { cap: 109_140_000, rookieMin: 898_310, label: '2019-20' },  // COVID
  2021: { cap: 109_140_000, rookieMin: 925_258, label: '2020-21' },  // COVID
  2022: { cap: 112_414_000, rookieMin: 925_258, label: '2021-22' },
  2023: { cap: 123_655_000, rookieMin: 953_079, label: '2022-23' },
  2024: { cap: 136_021_000, rookieMin: 1_119_563, label: '2023-24' },
  2025: { cap: 141_000_000, rookieMin: 1_158_094, label: '2024-25' },
  2026: { cap: 155_000_000, rookieMin: 1_196_000, label: '2025-26' },  // projected
}

// Shortened/unusual seasons
const SHORTENED_SEASONS = new Set([1999, 2012, 2020, 2021])

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate',
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlayerSeason {
  name: string
  team: string          // primary team (or "Multiple" if traded)
  teams: string[]       // all teams that season
  salary: number        // actual salary paid
  games: number
  minutes: number       // total minutes played
  ws: number            // Win Shares
  vorp: number          // Value Over Replacement Player
  // Computed fields (added by buildValueData):
  capPct?: number       // salary / cap
  production?: number   // 0.5*WS + 0.5*(2.7*VORP)
  fairPct?: number      // what they should have been paid (% of cap)
  surplusPct?: number   // fair - actual (+ = bargain, - = overpaid)
  surplusNow?: number   // surplusPct * current cap (today's dollars)
  rank?: number
}

export interface SeasonFile {
  year: number
  label: string           // "2023-24"
  cap: number
  rookieMin: number
  shortened: boolean
  players: PlayerSeason[]
  formulaVersion: string
  generatedAt: string
  coverage: {
    withSalary: number
    withStats: number
    merged: number
    salaryTotal: number   // total payroll that season
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`\.]/g, '')
    .replace(/\s+jr\.?$/i, '')
    .replace(/\s+sr\.?$/i, '')
    .replace(/\s+(ii|iii|iv|v)$/i, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function expandComments(html: string): string {
  return html.replace(/<!--([\s\S]*?)-->/g, (_, inner) => inner)
}

function rawPath(year: number, kind: 'salary' | 'advanced'): string {
  return path.join(RAW_DIR, `${year}_${kind}.html`)
}

async function fetchOrCache(url: string, cachePath: string): Promise<string> {
  if (!FORCE && fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf8')
  }
  const MAX_RETRIES = 4
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data } = await axios.get<string>(url, { headers: HEADERS, timeout: 25_000 })
      fs.mkdirSync(path.dirname(cachePath), { recursive: true })
      fs.writeFileSync(cachePath, data)
      return data
    } catch (err: any) {
      if (err?.response?.status === 429) {
        const backoff = Math.min(120_000, 15_000 * Math.pow(2, attempt))
        console.warn(`  [429] Rate limited — waiting ${backoff / 1000}s before retry ${attempt + 1}/${MAX_RETRIES}`)
        await sleep(backoff)
        if (attempt < MAX_RETRIES) continue
      }
      throw err
    }
  }
  throw new Error(`Failed to fetch ${url} after retries`)
}

// ── Salary scraper ───────────────────────────────────────────────────────────

interface SalaryRow { name: string; team: string; salary: number }

async function scrapeSalaries(year: number): Promise<SalaryRow[]> {
  // BBRef salary pages: /leagues/NBA_YEAR_salaries.html
  const url = `https://www.basketball-reference.com/leagues/NBA_${year}_salaries.html`
  let html: string
  try {
    html = await fetchOrCache(url, rawPath(year, 'salary'))
  } catch (err: any) {
    console.warn(`  Salary page ${year}: ${err?.response?.status ?? err.message}`)
    return []
  }
  const expanded = expandComments(html)
  const $ = cheerio.load(expanded)

  const rows: SalaryRow[] = []
  // Table id is "salaries" or inside a div; rows have data-stat="player" and "salary"
  $('table#salaries tbody tr, table[id*="salaries"] tbody tr').each((_, row) => {
    const $row = $(row)
    if ($row.hasClass('thead') || $row.hasClass('over_header')) return

    const nameEl  = $row.find('[data-stat="player"] a')
    const salaryEl = $row.find('[data-stat="salary"]')
    const teamEl  = $row.find('[data-stat="team_id"] a')

    const name   = nameEl.text().trim()
    const team   = teamEl.text().trim() || 'TOT'
    // Salary stored in csk attribute OR text (strip $ and commas)
    const csk    = salaryEl.attr('csk')
    const raw    = csk ? csk : salaryEl.text().replace(/[$,]/g, '').trim()
    const salary = parseInt(raw, 10)

    if (name && !isNaN(salary) && salary > 0) {
      rows.push({ name, team, salary })
    }
  })
  return rows
}

// ── Advanced stats scraper ───────────────────────────────────────────────────

interface AdvRow { name: string; team: string; games: number; minutes: number; ws: number; vorp: number }

async function scrapeAdvanced(year: number): Promise<AdvRow[]> {
  const url = `https://www.basketball-reference.com/leagues/NBA_${year}_advanced.html`
  let html: string
  try {
    html = await fetchOrCache(url, rawPath(year, 'advanced'))
  } catch (err: any) {
    console.warn(`  Advanced page ${year}: ${err?.response?.status ?? err.message}`)
    return []
  }
  const expanded = expandComments(html)
  const $ = cheerio.load(expanded)

  const rows: AdvRow[] = []
  $('table#advanced tbody tr, table[id*="advanced"] tbody tr').each((_, row) => {
    const $row = $(row)
    if ($row.hasClass('thead') || $row.hasClass('over_header')) return

    const name  = $row.find('[data-stat="player"] a, [data-stat="name_display"] a').text().trim()
    const team  = $row.find('[data-stat="team_id"]').text().trim()
    const g     = parseInt($row.find('[data-stat="g"]').text(), 10) || 0
    const mp    = parseInt($row.find('[data-stat="mp"]').text(), 10) || 0
    const ws    = parseFloat($row.find('[data-stat="ws"]').text()) || 0
    const vorp  = parseFloat($row.find('[data-stat="vorp"]').text()) || 0

    if (name) rows.push({ name, team, games: g, minutes: mp, ws, vorp })
  })
  return rows
}

// ── Merge salary + advanced into PlayerSeason[] ──────────────────────────────

function mergeData(
  salaries: SalaryRow[],
  advanced: AdvRow[],
): PlayerSeason[] {
  const TRADED = new Set(['TOT', '2TM', '3TM', '4TM', '5TM'])

  // Build advanced lookup: normName → best row (prefer TOT row for traded players)
  const advByName = new Map<string, AdvRow[]>()
  for (const row of advanced) {
    const key = normName(row.name)
    if (!advByName.has(key)) advByName.set(key, [])
    advByName.get(key)!.push(row)
  }

  const result: PlayerSeason[] = []
  // Track which names we've processed (salary side) to avoid double-counting
  const seen = new Set<string>()

  for (const sal of salaries) {
    const key = normName(sal.name)
    if (seen.has(key)) continue
    seen.add(key)

    // Find all salary rows for this player (multi-team players appear multiple times)
    const allSalRows = salaries.filter(s => normName(s.name) === key)
    const teams = allSalRows.map(s => s.team).filter(t => !TRADED.has(t))
    const totalSalary = allSalRows.reduce((sum, s) => Math.max(sum, s.salary), 0) // use max (total)

    const advRows = advByName.get(key) ?? []
    // Prefer the TOT/aggregated row for stats; fall back to highest-minutes individual row
    const totRow = advRows.find(r => TRADED.has(r.team))
    const bestAdv = totRow ?? advRows.sort((a, b) => b.minutes - a.minutes)[0]

    result.push({
      name: sal.name,
      team: teams.length === 1 ? teams[0] : (teams.length > 1 ? 'Multiple' : sal.team),
      teams: teams.length > 0 ? teams : [sal.team],
      salary: totalSalary,
      games:   bestAdv?.games   ?? 0,
      minutes: bestAdv?.minutes ?? 0,
      ws:      bestAdv?.ws      ?? 0,
      vorp:    bestAdv?.vorp    ?? 0,
    })
  }
  return result
}

// ── Value formula ────────────────────────────────────────────────────────────

const FORMULA_VERSION = '1.0'
const MIN_MINUTES_FILTER = 500   // default filter threshold for value rankings

function computeValue(players: PlayerSeason[], cap: number, rookieMin: number): PlayerSeason[] {
  // Step 1: express costs as cap percentages
  const capPct    = (s: number) => s / cap
  const minPct    = rookieMin / cap

  // Step 2: production = 0.5*WS + 0.5*(2.7*VORP)  [units: wins]
  const prod = (p: PlayerSeason) => 0.5 * p.ws + 0.5 * (2.7 * p.vorp)

  // Step 3: compute league-wide rate = (sum of cap% above replacement) / sum(production)
  // Only players with positive production in the sum
  let sumCapAboveRepl = 0
  let sumProduction   = 0
  for (const p of players) {
    const pc    = capPct(p.salary)
    const repl  = Math.min(pc, minPct)
    const pr    = Math.max(0, prod(p))
    sumCapAboveRepl += pc - repl
    sumProduction   += pr
  }
  const rate = sumProduction > 0 ? sumCapAboveRepl / sumProduction : 0

  const currentCapForDollars = CAP_HISTORY[new Date().getFullYear()]?.cap
    ?? CAP_HISTORY[2025]?.cap

  return players.map(p => {
    const pc    = capPct(p.salary)
    const repl  = Math.min(pc, minPct)
    const pr    = prod(p)
    const fair  = Math.max(0, repl + rate * Math.max(0, pr))
    const surp  = fair - pc

    return {
      ...p,
      capPct:     Math.round(pc * 10000) / 10000,
      production: Math.round(pr * 100) / 100,
      fairPct:    Math.round(fair * 10000) / 10000,
      surplusPct: Math.round(surp * 10000) / 10000,
      surplusNow: Math.round(surp * currentCapForDollars),
    }
  })
}

// ── Write season JSON ─────────────────────────────────────────────────────────

function writeSeasonFile(year: number, players: PlayerSeason[]) {
  const cap = CAP_HISTORY[year]
  if (!cap) { console.warn(`  No cap data for ${year} — skipping write`); return }

  // Rank by surplusPct descending (only players with salary > 0)
  const ranked = [...players]
    .sort((a, b) => (b.surplusPct ?? 0) - (a.surplusPct ?? 0))
  ranked.forEach((p, i) => { p.rank = i + 1 })

  const file: SeasonFile = {
    year,
    label: cap.label,
    cap:       cap.cap,
    rookieMin: cap.rookieMin,
    shortened: SHORTENED_SEASONS.has(year),
    players:   ranked,
    formulaVersion: FORMULA_VERSION,
    generatedAt: new Date().toISOString(),
    coverage: {
      withSalary: players.filter(p => p.salary > 0).length,
      withStats:  players.filter(p => p.minutes > 0).length,
      merged:     players.length,
      salaryTotal: players.reduce((s, p) => s + p.salary, 0),
    },
  }

  const outPath = path.join(OUT_DIR, `${year}.json`)
  fs.writeFileSync(outPath, JSON.stringify(file))
  return file
}

// ── Meta file ────────────────────────────────────────────────────────────────

function writeMeta(years: number[]) {
  const meta = {
    formulaVersion: FORMULA_VERSION,
    seasons: years.map(y => ({
      year: y,
      label: CAP_HISTORY[y]?.label ?? `${y - 1}-${String(y).slice(-2)}`,
      cap:   CAP_HISTORY[y]?.cap ?? 0,
      shortened: SHORTENED_SEASONS.has(y),
    })),
    updatedAt: new Date().toISOString(),
    note: 'Value formula: surplus_pct = fair_pct - cap_pct; fair_pct = min(cap_pct,min_pct) + rate * max(0,production); production = 0.5*WS + 0.5*(2.7*VORP). See scripts/scrape-season-data.ts.',
  }
  fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2))
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('EBK Per-Season Salary + Value Scraper')
  console.log(`Seasons: ${START_YEAR}–${END_YEAR}  |  Delay: ${DELAY_MS}ms  |  Force: ${FORCE}\n`)
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.mkdirSync(RAW_DIR, { recursive: true })

  const completedYears: number[] = []

  for (let year = START_YEAR; year <= END_YEAR; year++) {
    if (!CAP_HISTORY[year]) {
      console.log(`[${year}] No cap data — skipping`)
      continue
    }
    const outPath = path.join(OUT_DIR, `${year}.json`)
    if (!FORCE && fs.existsSync(outPath)) {
      console.log(`[${year}] Already exists — skipping (use FORCE=1 to re-scrape)`)
      completedYears.push(year)
      continue
    }

    const label = CAP_HISTORY[year].label
    console.log(`\n[${year}] ${label}`)

    // Fetch salary page
    process.stdout.write(`  Salaries... `)
    const salaries = await scrapeSalaries(year)
    console.log(`${salaries.length} rows`)
    await sleep(DELAY_MS)

    // Fetch advanced stats
    process.stdout.write(`  Advanced...  `)
    const advanced = await scrapeAdvanced(year)
    console.log(`${advanced.length} rows`)
    await sleep(DELAY_MS)

    if (salaries.length === 0 && advanced.length === 0) {
      console.warn(`  Both empty — skipping ${year}`)
      continue
    }

    // Merge
    const merged = mergeData(salaries, advanced)
    console.log(`  Merged: ${merged.length} players`)

    // Compute value
    const cap = CAP_HISTORY[year]
    const withValue = computeValue(merged, cap.cap, cap.rookieMin)

    // Sanity check: surplus should sum to ~0
    const surplusSum = withValue.reduce((s, p) => s + (p.surplusPct ?? 0), 0)
    console.log(`  Surplus sum: ${surplusSum.toFixed(3)} (should be ≈0)`)

    // Write
    writeSeasonFile(year, withValue)
    console.log(`  Written → public/data/salary/${year}.json`)
    completedYears.push(year)
  }

  writeMeta(completedYears)
  console.log(`\nMeta written → public/data/salary/meta.json`)
  console.log(`Done. ${completedYears.length} seasons complete.`)

  // Print top/bottom 5 value players for the most recent completed season
  const lastYear = completedYears[completedYears.length - 1]
  if (lastYear) {
    const data: SeasonFile = JSON.parse(
      fs.readFileSync(path.join(OUT_DIR, `${lastYear}.json`), 'utf8')
    )
    const eligible = data.players.filter(p => p.minutes >= MIN_MINUTES_FILTER)
    console.log(`\n--- Top 10 value (${data.label}, min ${MIN_MINUTES_FILTER} min) ---`)
    eligible.slice(0, 10).forEach((p, i) =>
      console.log(`  ${i + 1}. ${p.name} ${p.team} | $${(p.salary / 1e6).toFixed(1)}M | surplus ${p.surplusNow && p.surplusNow > 0 ? '+' : ''}$${p.surplusNow ? (p.surplusNow / 1e6).toFixed(1) : '?'}M`)
    )
    console.log(`--- Bottom 10 value (${data.label}) ---`)
    eligible.slice(-10).reverse().forEach((p, i) =>
      console.log(`  ${i + 1}. ${p.name} ${p.team} | $${(p.salary / 1e6).toFixed(1)}M | surplus $${p.surplusNow ? (p.surplusNow / 1e6).toFixed(1) : '?'}M`)
    )
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
