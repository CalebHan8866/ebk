'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { estimateCareerEarnings, fmt } from '@/lib/utils'

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

function getEarnings(p: Player): { value: number; estimated: boolean } {
  if (p.careerEarnings > 0) return { value: p.careerEarnings, estimated: false }
  return { value: estimateCareerEarnings(p), estimated: true }
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

/** Returns Tailwind classes for the rank number color + shimmer treatment */
function rankStyle(rank: number): string {
  if (rank === 1) return 'text-yellow-400'
  if (rank === 2) return 'text-slate-300'
  if (rank === 3) return 'text-amber-600'
  return 'text-white/30'
}

/** Returns an inline style for top-3 glow on the earnings bar */
function barGlow(rank: number): React.CSSProperties {
  if (rank === 1) return { boxShadow: '0 0 6px 1px rgba(250,204,21,0.55)' }
  if (rank === 2) return { boxShadow: '0 0 6px 1px rgba(203,213,225,0.45)' }
  if (rank === 3) return { boxShadow: '0 0 6px 1px rgba(217,119,6,0.45)' }
  return {}
}

/** Gold/silver/bronze shimmer background for rank number wrapper */
function rankWrapperStyle(rank: number): React.CSSProperties {
  if (rank === 1) return {
    background: 'linear-gradient(135deg, rgba(234,179,8,0.18) 0%, rgba(250,204,21,0.08) 100%)',
    border: '1px solid rgba(234,179,8,0.35)',
    borderRadius: '8px',
  }
  if (rank === 2) return {
    background: 'linear-gradient(135deg, rgba(148,163,184,0.15) 0%, rgba(203,213,225,0.06) 100%)',
    border: '1px solid rgba(148,163,184,0.3)',
    borderRadius: '8px',
  }
  if (rank === 3) return {
    background: 'linear-gradient(135deg, rgba(180,83,9,0.18) 0%, rgba(217,119,6,0.08) 100%)',
    border: '1px solid rgba(180,83,9,0.35)',
    borderRadius: '8px',
  }
  return {}
}

interface ValuePlayer {
  name: string
  team: string
  salary: number
  surplusNow: number
  surplusPct: number
  production: number
  rank: number
}

interface SeasonMeta { year: number; label: string; cap: number }

export default function SalaryPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('highest')
  const [eraFilter, setEraFilter] = useState<EraFilter>('all')
  const [tab, setTab] = useState<TabMode>('earnings')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // Value tab state
  const [seasons, setSeasons] = useState<SeasonMeta[]>([])
  const [valueYear, setValueYear] = useState<number>(0)
  const [valuePlayers, setValuePlayers] = useState<ValuePlayer[]>([])
  const [valueLoading, setValueLoading] = useState(false)
  const [valueSortMode, setValueSortMode] = useState<'best' | 'worst'>('best')
  const [valueSearch, setValueSearch] = useState('')

  useEffect(() => {
    fetch('/api/players')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: unknown) => {
        setPlayers(Array.isArray(data) ? (data as Player[]) : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Load season list from meta.json
  useEffect(() => {
    fetch('/data/salary/meta.json')
      .then(r => r.ok ? r.json() : null)
      .then((meta: { seasons?: SeasonMeta[] } | null) => {
        if (!meta?.seasons?.length) return
        const available = [...meta.seasons].reverse() // newest first
        setSeasons(available)
        setValueYear(available[0].year)
      })
      .catch(() => {})
  }, [])

  // Load value data for selected season
  useEffect(() => {
    if (!valueYear) return
    setValueLoading(true)
    fetch(`/data/salary/${valueYear}.json`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { players?: ValuePlayer[] } | null) => {
        setValuePlayers(data?.players ?? [])
        setValueLoading(false)
      })
      .catch(() => setValueLoading(false))
  }, [valueYear])

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

  return (
    <div className="min-h-screen animate-fade-in pb-24 sm:pb-8">

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div className="relative text-center pt-10 sm:pt-16 pb-8 px-4 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[320px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 80% 80% at 50% -5%, rgba(234,88,12,0.30) 0%, rgba(234,88,12,0.06) 55%, transparent 72%)' }} />
        <Link
          href="/lobby"
          className="absolute top-4 left-4 inline-flex items-center gap-1.5 text-white/60 hover:text-white/80 transition-colors text-sm group"
        >
          <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Lobby
        </Link>
        <div className="relative">
          <p className="text-[11px] font-bold tracking-[0.45em] text-orange-500/70 uppercase mb-3">EBK</p>
          <h1 className="font-display text-4xl sm:text-6xl text-white leading-none mb-3">
            NBA <span className="text-orange-500">Salary</span> Rankings
          </h1>
          <p className="text-white/60 text-sm sm:text-base max-w-sm mx-auto">
            Career earnings across the NBA&apos;s history
          </p>
        </div>
      </div>

      {/* ── STATS BAR ──────────────────────────────────────────────── */}
      {loading && (
        <div className="max-w-3xl mx-auto px-4 mb-6">
          <div className="grid grid-cols-3 gap-2 sm:gap-3 animate-pulse">
            {[0, 1, 2].map(i => (
              <div key={i} className="card-accent p-3 sm:p-4 text-center space-y-2">
                <div className="h-6 bg-white/[0.06] rounded w-3/4 mx-auto" />
                <div className="h-2.5 bg-white/[0.04] rounded w-1/2 mx-auto" />
                <div className="h-2.5 bg-white/[0.04] rounded w-2/3 mx-auto" />
              </div>
            ))}
          </div>
        </div>
      )}
      {!loading && stats && (
        <div className="max-w-3xl mx-auto px-4 mb-6">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="card-accent p-3 sm:p-4 text-center">
              <p className="text-orange-400 font-black text-base sm:text-2xl leading-none mb-1">
                {fmt(stats.top.earnings)}
              </p>
              <p className="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider">Highest Earner</p>
              <p className="text-white/70 text-[10px] sm:text-xs mt-1 font-bold truncate">
                {stats.top.firstName[0]}. {stats.top.lastName}
              </p>
            </div>
            <div className="card-accent p-3 sm:p-4 text-center">
              <p className="text-orange-400 font-black text-base sm:text-2xl leading-none mb-1">
                {fmt(stats.avg)}
              </p>
              <p className="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider">Avg Career</p>
              <p className="text-white/70 text-[10px] sm:text-xs mt-1 font-bold">All players</p>
            </div>
            <div className="card-accent p-3 sm:p-4 text-center">
              <p className="text-orange-400 font-black text-base sm:text-2xl leading-none mb-1">
                {fmt(stats.total)}
              </p>
              <p className="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider">Total Paid Out</p>
              <p className="text-white/70 text-[10px] sm:text-xs mt-1 font-bold">NBA history</p>
            </div>
          </div>
        </div>
      )}

      {/* ── CONTROLS (earnings tab only) ───────────────────────────── */}
      <div className={`max-w-3xl mx-auto px-4 mb-4 ${tab === 'value' ? 'hidden' : ''}`}>
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <input
            type="text"
            placeholder="Search player..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-orange-500/40 focus-visible:ring-2 focus-visible:ring-orange-500/60 transition-colors"
          />
          {/* Sort */}
          <select
            value={sortMode}
            onChange={e => setSortMode(e.target.value as SortMode)}
            className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white/70 focus:outline-none focus:border-orange-500/40 focus-visible:ring-2 focus-visible:ring-orange-500/60 transition-colors cursor-pointer appearance-none sm:w-44"
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
            className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white/70 focus:outline-none focus:border-orange-500/40 focus-visible:ring-2 focus-visible:ring-orange-500/60 transition-colors cursor-pointer appearance-none sm:w-36"
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
                  : 'text-white/40 hover:text-white/70',
              ].join(' ')}
            >
              {t === 'earnings' ? 'Earnings' : 'Value Rankings'}
            </button>
          ))}
        </div>
      </div>

      {/* ── LOADING SKELETONS ──────────────────────────────────────── */}
      {loading && (
        <div className="max-w-3xl mx-auto px-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card-surface rounded-xl px-4 py-3">
              <div className="flex items-center gap-3 animate-pulse">
                {/* Rank skeleton */}
                <div className="w-8 h-7 bg-white/5 rounded shrink-0" />
                {/* Info skeleton */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="h-3.5 bg-white/5 rounded w-2/5" />
                  <div className="h-2.5 bg-white/5 rounded w-1/4" />
                  <div className="mt-2 h-[3px] bg-white/5 rounded-full w-full" />
                </div>
                {/* Earnings skeleton */}
                <div className="shrink-0 text-right space-y-1.5">
                  <div className="h-5 bg-white/5 rounded w-16" />
                  <div className="h-2.5 bg-white/5 rounded w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── VALUE TAB ──────────────────────────────────────────────── */}
      {!loading && tab === 'value' && (
        <div className="max-w-3xl mx-auto px-4">
          {/* Season selector + sort */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <input
              type="text"
              placeholder="Search player..."
              value={valueSearch}
              onChange={e => setValueSearch(e.target.value)}
              className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-orange-500/40 focus-visible:ring-2 focus-visible:ring-orange-500/60 transition-colors"
            />
            <div className="relative sm:w-44">
              <select
                value={valueSortMode}
                onChange={e => setValueSortMode(e.target.value as 'best' | 'worst')}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-4 pr-9 py-2.5 text-sm text-white/70 focus:outline-none focus:border-orange-500/40 focus-visible:ring-2 focus-visible:ring-orange-500/60 transition-colors cursor-pointer appearance-none"
              >
                <option value="best">Best Value</option>
                <option value="worst">Most Overpaid</option>
              </select>
              <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <div className="relative sm:w-36">
              <select
                value={valueYear}
                onChange={e => setValueYear(Number(e.target.value))}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-4 pr-9 py-2.5 text-sm text-white/80 font-medium focus:outline-none focus:border-orange-500/40 focus-visible:ring-2 focus-visible:ring-orange-500/60 transition-colors cursor-pointer appearance-none"
              >
                {seasons.map(s => (
                  <option key={s.year} value={s.year}>{s.label}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {valueLoading && (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="skeleton h-16 rounded-xl" />
              ))}
            </div>
          )}

          {!valueLoading && valueYear !== 0 && valuePlayers.length === 0 && (
            <div className="empty-state py-16">
              <div className="empty-state-icon">📊</div>
              <p className="empty-state-title">No value data for this season</p>
              <p className="empty-state-body">Season data may not be available yet</p>
            </div>
          )}

          {!valueLoading && valuePlayers.length > 0 && (() => {
            const sorted = valueSortMode === 'best'
              ? [...valuePlayers].sort((a, b) => b.surplusNow - a.surplusNow)
              : [...valuePlayers].sort((a, b) => a.surplusNow - b.surplusNow)
            const searched = valueSearch
              ? sorted.filter(p => p.name.toLowerCase().includes(valueSearch.toLowerCase()))
              : sorted
            const maxSurplus = Math.max(...valuePlayers.map(p => Math.abs(p.surplusNow)), 1)
            return (
              <div className="space-y-1.5">
                {searched.slice(0, 100).map((p, i) => {
                  const isPositive = p.surplusNow >= 0
                  const barPct = Math.min(100, Math.abs(p.surplusNow) / maxSurplus * 100)
                  const surplusLabel = isPositive
                    ? `+${fmt(p.surplusNow)}`
                    : `-${fmt(Math.abs(p.surplusNow))}`
                  return (
                    <div key={`${p.name}-${i}`}
                      className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 flex items-center gap-3"
                    >
                      {/* surplus bar */}
                      <div
                        className="absolute left-0 top-0 bottom-0 transition-all duration-500"
                        style={{
                          width: `${barPct}%`,
                          background: isPositive
                            ? 'rgba(34,197,94,0.13)'
                            : 'rgba(239,68,68,0.13)',
                        }}
                      />
                      <span className="relative w-6 text-[11px] font-bold text-white/50 text-right shrink-0">{i + 1}</span>
                      <div className="relative flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{p.name}</p>
                        <p className="text-[11px] text-white/40">{p.team} · {fmt(p.salary)}</p>
                      </div>
                      <div className="relative text-right shrink-0">
                        <p className={`text-sm font-black ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                          {surplusLabel}
                        </p>
                        <p className="text-[10px] text-white/40">surplus</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}

      {/* ── EARNINGS LIST ──────────────────────────────────────────── */}
      {!loading && tab === 'earnings' && (
        <div className="max-w-3xl mx-auto px-4">
          {filtered.length === 0 ? (
            <div className="empty-state py-16">
              <div className="empty-state-icon">🔍</div>
              <p className="empty-state-title">No players found</p>
              <p className="empty-state-body">
                Try a different name, era, or sort — or clear the search to see everyone
              </p>
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="btn-secondary text-xs py-2 px-5 mt-5"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {visible.map((p, idx) => {
                  const rank = idx + 1
                  const barPct = Math.round((p.earnings / maxEarnings) * 100)
                  const isTop3 = rank <= 3
                  return (
                    <div
                      key={p.id}
                      className="card-surface rounded-xl px-4 py-3 hover:border-orange-700/30 transition-all"
                    >
                      {/* ── Mobile layout: stacked; Desktop: single row ── */}
                      <div className="flex items-center gap-3">

                        {/* Rank number */}
                        <div
                          className="shrink-0 w-10 h-10 flex items-center justify-center"
                          style={rankWrapperStyle(rank)}
                        >
                          <span className={`font-display text-2xl leading-none ${rankStyle(rank)}`}>
                            {rank}
                          </span>
                        </div>

                        {/* Info block */}
                        <div className="flex-1 min-w-0">
                          {/* Name + years row */}
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-black text-white text-sm truncate">
                              {p.firstName} {p.lastName}
                            </span>
                            <span className="text-white/30 text-xs shrink-0">
                              {p.yearFrom}–{p.yearTo}
                            </span>
                          </div>

                          {/* Position + team row */}
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-white/30 text-[11px] uppercase tracking-wide">{p.position}</span>
                            <span className="text-white/20 text-[11px]">·</span>
                            <span className="text-white/30 text-[11px] truncate">{p.team}</span>
                          </div>

                          {/* Earnings bar — 3px track, orange fill, top-3 glow */}
                          <div className="mt-2 h-[3px] rounded-full bg-white/[0.06] overflow-visible relative">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${barPct}%`,
                                background: isTop3
                                  ? 'linear-gradient(90deg, #f97316, #fb923c)'
                                  : '#ea580c',
                                ...barGlow(rank),
                              }}
                            />
                          </div>

                          {/* Secondary stats — visible inline on mobile too */}
                          <div className="flex gap-2 mt-1.5">
                            <span className="text-white/30 text-[11px]">{fmt(p.perGame)}/gm</span>
                            <span className="text-white/20 text-[11px]">·</span>
                            <span className="text-white/30 text-[11px]">{fmt(p.perSeason)}/yr</span>
                            <span className="text-white/20 text-[11px]">·</span>
                            <span className="text-white/30 text-[11px]">{p.seasons}y · {p.careerGames}gp</span>
                          </div>
                        </div>

                        {/* Earnings + est. badge */}
                        <div className="text-right shrink-0">
                          <span className="text-orange-400 font-black text-base sm:text-lg leading-none">
                            {fmt(p.earnings)}
                          </span>
                          {p.estimated && (
                            <span
                              className="block mt-1 text-[9px] font-bold tracking-wide text-orange-400/80 px-1.5 py-0.5 rounded-full"
                              style={{
                                border: '1px solid rgba(234,88,12,0.45)',
                                background: 'rgba(234,88,12,0.08)',
                              }}
                            >
                              est.
                            </span>
                          )}
                        </div>

                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Load more */}
              {visibleCount < filtered.length && (
                <div className="flex justify-center mt-6 pb-4">
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
