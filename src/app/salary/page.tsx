'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'

interface Player {
  id: number
  firstName: string
  lastName: string
  team: string
  position: string
  careerGames: number
  careerPPG: number
  careerRPG: number
  careerAPG: number
  careerMPG: number
  ebkScore: number
  yearFrom: number
  yearTo: number
  careerEarnings: number
}

type SortMode = 'highest' | 'lowest' | 'perGame' | 'perSeason'
type EraFilter = 'all' | '2010s' | '2000s' | '1990s' | '1980s' | 'pre1980'
type TabMode = 'earnings' | 'value'

function estimateCareerEarnings(p: Player): number {
  const midYear = (p.yearFrom + p.yearTo) / 2
  const careerYears = Math.max(1, p.yearTo - p.yearFrom)

  let baseAnnual: number
  if (midYear <= 1972)      baseAnnual = 75_000
  else if (midYear <= 1976) baseAnnual = 140_000
  else if (midYear <= 1980) baseAnnual = 300_000
  else if (midYear <= 1984) baseAnnual = 580_000
  else if (midYear <= 1988) baseAnnual = 1_000_000
  else if (midYear <= 1992) baseAnnual = 1_900_000
  else if (midYear <= 1996) baseAnnual = 3_400_000
  else if (midYear <= 2000) baseAnnual = 5_200_000
  else if (midYear <= 2004) baseAnnual = 6_200_000
  else if (midYear <= 2008) baseAnnual = 7_200_000
  else if (midYear <= 2012) baseAnnual = 8_800_000
  else if (midYear <= 2016) baseAnnual = 11_000_000
  else if (midYear <= 2020) baseAnnual = 15_500_000
  else                      baseAnnual = 21_000_000

  let star = 0.75
  if      (p.careerPPG >= 28) star = 4.3
  else if (p.careerPPG >= 23) star = 3.1
  else if (p.careerPPG >= 18) star = 2.2
  else if (p.careerPPG >= 13) star = 1.55
  else if (p.careerPPG >= 8)  star = 1.05
  else if (p.careerPPG >= 3)  star = 0.85

  return Math.round(baseAnnual * star * careerYears)
}

function getEarnings(p: Player): { value: number; estimated: boolean } {
  if (p.careerEarnings > 0) return { value: p.careerEarnings, estimated: false }
  return { value: estimateCareerEarnings(p), estimated: true }
}

function fmt(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `$${Math.round(n / 1_000)}K`
  return `$${n}`
}

const ERA_OPTIONS: { value: EraFilter; label: string }[] = [
  { value: 'all',    label: 'All Eras' },
  { value: '2010s',  label: '2010+' },
  { value: '2000s',  label: '2000s' },
  { value: '1990s',  label: '1990s' },
  { value: '1980s',  label: '1980s' },
  { value: 'pre1980', label: 'Pre-1980' },
]

function matchesEra(p: Player, era: EraFilter): boolean {
  if (era === 'all') return true
  if (era === '2010s')  return p.yearTo >= 2010
  if (era === '2000s')  return p.yearTo >= 2000 && p.yearTo < 2010
  if (era === '1990s')  return p.yearTo >= 1990 && p.yearTo < 2000
  if (era === '1980s')  return p.yearTo >= 1980 && p.yearTo < 1990
  if (era === 'pre1980') return p.yearTo < 1980
  return true
}

const PAGE_SIZE = 50

export default function SalaryPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('highest')
  const [eraFilter, setEraFilter] = useState<EraFilter>('all')
  const [tab, setTab] = useState<TabMode>('earnings')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    fetch('/api/players')
      .then(r => r.json())
      .then((data: Player[]) => {
        setPlayers(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const enriched = useMemo(() => {
    return players.map(p => {
      const { value, estimated } = getEarnings(p)
      const seasons = Math.max(1, p.yearTo - p.yearFrom)
      return {
        ...p,
        earnings: value,
        estimated,
        perGame: value / Math.max(1, p.careerGames),
        perSeason: value / seasons,
        seasons,
      }
    })
  }, [players])

  const maxEarnings = useMemo(() => {
    return enriched.reduce((m, p) => Math.max(m, p.earnings), 1)
  }, [enriched])

  const stats = useMemo(() => {
    if (enriched.length === 0) return null
    const sorted = [...enriched].sort((a, b) => b.earnings - a.earnings)
    const top = sorted[0]
    const total = enriched.reduce((s, p) => s + p.earnings, 0)
    const avg = total / enriched.length
    return { top, total, avg }
  }, [enriched])

  const filtered = useMemo(() => {
    let list = enriched.filter(p => {
      const name = `${p.firstName} ${p.lastName}`.toLowerCase()
      return name.includes(search.toLowerCase()) && matchesEra(p, eraFilter)
    })

    if (sortMode === 'highest')   list = [...list].sort((a, b) => b.earnings - a.earnings)
    if (sortMode === 'lowest')    list = [...list].sort((a, b) => a.earnings - b.earnings)
    if (sortMode === 'perGame')   list = [...list].sort((a, b) => b.perGame - a.perGame)
    if (sortMode === 'perSeason') list = [...list].sort((a, b) => b.perSeason - a.perSeason)

    return list
  }, [enriched, search, sortMode, eraFilter])

  const visible = filtered.slice(0, visibleCount)

  // Reset pagination when filters change
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [search, sortMode, eraFilter])

  const rankColor = (rank: number) => {
    if (rank === 1) return 'text-yellow-400'
    if (rank === 2) return 'text-gray-300'
    if (rank === 3) return 'text-amber-600'
    return 'text-gray-500'
  }

  return (
    <div className="min-h-screen animate-fade-in pb-24 sm:pb-8">

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div className="relative text-center pt-10 sm:pt-16 pb-8 px-4 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[320px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 80% 80% at 50% -5%, rgba(234,88,12,0.30) 0%, rgba(234,88,12,0.06) 55%, transparent 72%)' }} />
        <div className="relative">
          <p className="text-[11px] font-bold tracking-[0.45em] text-orange-500/70 uppercase mb-3">EBK</p>
          <h1 className="font-display text-4xl sm:text-6xl text-white leading-none mb-3">
            NBA Salary Rankings
          </h1>
          <p className="text-gray-400 text-sm sm:text-base max-w-sm mx-auto">
            Career earnings across the NBA&apos;s history
          </p>
        </div>
      </div>

      {/* ── STATS BAR ──────────────────────────────────────────────── */}
      {!loading && stats && (
        <div className="max-w-3xl mx-auto px-4 mb-6">
          <div className="grid grid-cols-3 gap-3">
            <div className="card-accent p-4 text-center">
              <p className="text-orange-400 font-black text-lg sm:text-2xl leading-none mb-1">
                {fmt(stats.top.earnings)}
              </p>
              <p className="text-gray-500 text-[10px] uppercase tracking-wider">Highest Earner</p>
              <p className="text-gray-300 text-xs mt-1 font-bold truncate">
                {stats.top.firstName} {stats.top.lastName}
              </p>
            </div>
            <div className="card-accent p-4 text-center">
              <p className="text-orange-400 font-black text-lg sm:text-2xl leading-none mb-1">
                {fmt(stats.avg)}
              </p>
              <p className="text-gray-500 text-[10px] uppercase tracking-wider">Avg Career</p>
              <p className="text-gray-300 text-xs mt-1 font-bold">All players</p>
            </div>
            <div className="card-accent p-4 text-center">
              <p className="text-orange-400 font-black text-lg sm:text-2xl leading-none mb-1">
                {fmt(stats.total)}
              </p>
              <p className="text-gray-500 text-[10px] uppercase tracking-wider">Total Paid Out</p>
              <p className="text-gray-300 text-xs mt-1 font-bold">NBA history</p>
            </div>
          </div>
        </div>
      )}

      {/* ── CONTROLS ───────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <input
            type="text"
            placeholder="Search player..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/40 transition-colors"
          />
          {/* Sort */}
          <select
            value={sortMode}
            onChange={e => setSortMode(e.target.value as SortMode)}
            className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-orange-500/40 transition-colors cursor-pointer appearance-none"
          >
            <option value="highest">Highest Earnings</option>
            <option value="lowest">Lowest Earnings</option>
            <option value="perGame">Most Per Game</option>
            <option value="perSeason">Most Per Season</option>
          </select>
          {/* Era */}
          <select
            value={eraFilter}
            onChange={e => setEraFilter(e.target.value as EraFilter)}
            className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-orange-500/40 transition-colors cursor-pointer appearance-none"
          >
            {ERA_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── TAB BAR ────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 mb-5">
        <div className="flex gap-1 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1">
          {(['earnings', 'value'] as TabMode[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                'flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all',
                tab === t
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'text-gray-500 hover:text-gray-300',
              ].join(' ')}
            >
              {t === 'earnings' ? 'Earnings' : 'Value Rankings'}
            </button>
          ))}
        </div>
      </div>

      {/* ── LOADING ────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
        </div>
      )}

      {/* ── VALUE TAB (coming soon) ─────────────────────────────────── */}
      {!loading && tab === 'value' && (
        <div className="max-w-3xl mx-auto px-4">
          <div className="card-accent p-10 text-center rounded-2xl">
            <p className="font-display text-5xl text-orange-500/40 mb-4">Soon</p>
            <p className="text-white font-black text-lg mb-2">Value Rankings Coming Soon</p>
            <p className="text-gray-500 text-sm max-w-sm mx-auto leading-relaxed">
              We&apos;re building a pipeline to calculate true player value using Win Shares and VORP —
              who actually earned their contract vs. who was overpaid.
            </p>
          </div>
        </div>
      )}

      {/* ── EARNINGS LIST ──────────────────────────────────────────── */}
      {!loading && tab === 'earnings' && (
        <div className="max-w-3xl mx-auto px-4">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-600 text-sm">No players found.</div>
          ) : (
            <>
              <div className="space-y-2">
                {visible.map((p, idx) => {
                  const rank = idx + 1
                  const barPct = Math.round((p.earnings / maxEarnings) * 100)
                  return (
                    <div key={p.id} className="card-surface rounded-xl px-4 py-3 hover:border-orange-700/30 transition-all">
                      <div className="flex items-center gap-3">

                        {/* Rank */}
                        <span className={`font-display text-xl w-8 text-right shrink-0 ${rankColor(rank)}`}>
                          {rank}
                        </span>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-white text-sm">
                              {p.firstName} {p.lastName}
                            </span>
                            <span className="text-gray-600 text-xs">
                              {p.yearFrom}–{p.yearTo}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-gray-600 text-[10px] uppercase tracking-wide">{p.position}</span>
                            <span className="text-gray-700 text-[10px]">·</span>
                            <span className="text-gray-600 text-[10px] truncate">{p.team}</span>
                          </div>

                          {/* Earnings bar */}
                          <div className="mt-2 h-1 rounded-full bg-white/[0.05] overflow-hidden">
                            <div
                              className="h-full bg-orange-500 rounded-full"
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                        </div>

                        {/* Earnings + secondary stats */}
                        <div className="text-right shrink-0">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-orange-400 font-black text-base sm:text-lg leading-none">
                              {fmt(p.earnings)}
                            </span>
                            {p.estimated && (
                              <span className="text-gray-600 text-[9px] font-bold">est.</span>
                            )}
                          </div>
                          <div className="flex gap-2 mt-1 justify-end">
                            <span className="text-gray-600 text-[10px]">{fmt(p.perGame)}/gm</span>
                            <span className="text-gray-700 text-[10px]">·</span>
                            <span className="text-gray-600 text-[10px]">{p.seasons}y</span>
                            <span className="text-gray-700 text-[10px]">·</span>
                            <span className="text-gray-600 text-[10px]">{p.careerGames}gp</span>
                          </div>
                        </div>

                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Load more */}
              {visibleCount < filtered.length && (
                <div className="text-center mt-6 pb-4">
                  <button
                    onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                    className="btn-secondary text-sm px-8 py-2.5"
                  >
                    Load More ({filtered.length - visibleCount} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

    </div>
  )
}
