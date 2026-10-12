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
}

const CURRENT_YEAR = 2024

const EVENTS = [
  // — Deep history —
  { year: 1347, desc: 'the Black Plague (1347)',                          emoji: '💀' },
  { year: 1492, desc: "Columbus's voyage to America (1492)",              emoji: '⛵' },
  { year: 1522, desc: "Magellan's circumnavigation of the globe (1522)",  emoji: '🌐' },
  { year: 1607, desc: 'Jamestown — the first English colony — being founded (1607)', emoji: '🏴' },
  { year: 1620, desc: 'the Pilgrims landing at Plymouth Rock (1620)',     emoji: '🦃' },
  { year: 1687, desc: "Newton publishing his laws of motion (1687)",      emoji: '🍎' },
  // — Revolution era —
  { year: 1773, desc: 'the Boston Tea Party (1773)',                      emoji: '🍵' },
  { year: 1776, desc: 'U.S. independence (1776)',                         emoji: '🗽' },
  { year: 1789, desc: 'the French Revolution (1789)',                     emoji: '🥖' },
  // — 1800s US & Canada —
  { year: 1848, desc: 'the California Gold Rush (1848)',                  emoji: '⛏️' },
  { year: 1861, desc: 'the U.S. Civil War starting (1861)',               emoji: '⚔️' },
  { year: 1865, desc: 'the Civil War ending & Lincoln being shot (1865)', emoji: '🎩' },
  { year: 1867, desc: 'Canadian Confederation (1867)',                    emoji: '🍁' },
  { year: 1885, desc: 'the Canadian Pacific Railway completing (1885)',   emoji: '🚂' },
  { year: 1886, desc: 'the Statue of Liberty being unveiled (1886)',      emoji: '🗽' },
  { year: 1891, desc: 'basketball being invented in Canada by Dr. Naismith (1891)', emoji: '🏀' },
  // — Early 1900s —
  { year: 1903, desc: 'the Wright Brothers\' first flight (1903)',        emoji: '✈️' },
  { year: 1912, desc: 'the Titanic sinking (1912)',                       emoji: '🚢' },
  { year: 1917, desc: 'Canada\'s victory at Vimy Ridge (1917)',           emoji: '🍁' },
  { year: 1920, desc: 'U.S. Prohibition beginning (1920)',                emoji: '🍺' },
  { year: 1929, desc: 'the Great Depression starting (1929)',             emoji: '📉' },
  // — WWII era —
  { year: 1941, desc: 'the attack on Pearl Harbor (1941)',                emoji: '💣' },
  { year: 1945, desc: 'WWII ending (1945)',                               emoji: '🌍' },
  // — Post-war US & Canada —
  { year: 1953, desc: 'Everest being first climbed (1953)',               emoji: '🏔️' },
  { year: 1955, desc: 'Rosa Parks refusing to give up her seat (1955)',   emoji: '✊' },
  { year: 1963, desc: 'the JFK assassination (1963)',                     emoji: '🕊️' },
  { year: 1964, desc: 'the Civil Rights Act being signed (1964)',         emoji: '✊' },
  { year: 1969, desc: 'the Moon landing (1969)',                          emoji: '🌕' },
  { year: 1972, desc: 'the Summit Series — Canada vs. USSR (1972)',       emoji: '🏒' },
  { year: 1972, desc: 'the Watergate scandal (1972)',                     emoji: '🎙️' },
  { year: 1980, desc: "Terry Fox's Marathon of Hope (1980)",              emoji: '🍁' },
  { year: 1982, desc: "Canada's Constitution Act being signed (1982)",    emoji: '🍁' },
  // — Late 1980s–1990s —
  { year: 1988, desc: "Gretzky being traded to the LA Kings (1988)",      emoji: '🏒' },
  { year: 1989, desc: 'the Berlin Wall falling (1989)',                   emoji: '🧱' },
  { year: 1991, desc: 'the Soviet Union collapsing (1991)',               emoji: '🛑' },
  { year: 1993, desc: 'the Toronto Blue Jays winning back-to-back World Series (1993)', emoji: '🇨🇦' },
  { year: 1995, desc: 'the O.J. Simpson verdict (1995)',                  emoji: '🧤' },
  { year: 1997, desc: 'the first Harry Potter book (1997)',               emoji: '🧙' },
  // — 2000s —
  { year: 2001, desc: '9/11 (2001)',                                      emoji: '🗼' },
  { year: 2004, desc: 'Facebook launching (2004)',                        emoji: '💻' },
  { year: 2005, desc: 'Hurricane Katrina (2005)',                         emoji: '🌀' },
  { year: 2007, desc: 'the first iPhone launching (2007)',                emoji: '📱' },
  { year: 2008, desc: 'the Great Recession (2008)',                       emoji: '🏦' },
  { year: 2008, desc: "Obama's historic election (2008)",                 emoji: '🗳️' },
  // — 2010s —
  { year: 2011, desc: 'bin Laden being killed (2011)',                    emoji: '🎯' },
  { year: 2012, desc: 'the Mayan apocalypse not happening (2012)',        emoji: '🌎' },
  { year: 2016, desc: 'the Chicago Cubs ending their 108-year drought (2016)', emoji: '⚾' },
  { year: 2018, desc: 'the Golden State Warriors dynasty peaking (2018)', emoji: '🏆' },
  { year: 2019, desc: 'the Toronto Raptors winning the NBA title (2019)', emoji: '🍁' },
  // — 2020s —
  { year: 2020, desc: 'COVID-19 (2020)',                                  emoji: '🦠' },
  { year: 2022, desc: 'the James Webb telescope launching (2022)',        emoji: '🔭' },
]

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

function fmt(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `$${Math.round(n / 1_000)}K`
  return `$${n}`
}

function fmtFull(n: number): string {
  return `$${n.toLocaleString()}`
}

interface Fact {
  emoji: string
  headline: string
  body: string
  gradient: string
  accent: string
}

function generateFacts(p: Player): Fact[] {
  const earnings = estimateCareerEarnings(p)
  const name = `${p.firstName} ${p.lastName}`
  const facts: Fact[] = []

  // ── Fact 1: Historical event savings comparison ─────────────────────────────
  // Collect all events where saving $X/year since then would match earnings,
  // with $X in a relatable range. Use player ID to pick one → every player
  // gets a different event even at similar earnings levels.
  const candidates = EVENTS.filter(e => {
    const yrs = CURRENT_YEAR - e.year
    const perYr = earnings / yrs
    return perYr >= 30_000 && perYr <= 100_000
  })
  const pool = candidates.length > 0 ? candidates : (earnings > 100_000_000 ? EVENTS.slice(0, 5) : EVENTS.slice(-5))
  const ev = pool[p.id % pool.length]

  const evYears = CURRENT_YEAR - ev.year
  const perYearNeeded = Math.round(earnings / evYears)

  facts.push({
    emoji: ev.emoji,
    headline: `Since ${ev.desc}`,
    body: `If you made ${fmt(perYearNeeded)} every single year since ${ev.desc}, you still wouldn't have matched ${name}'s estimated career earnings of ${fmt(earnings)}.`,
    gradient: 'from-orange-950 to-[#111]',
    accent: 'text-orange-400',
  })

  // ── Fact 2: Lifetime worker comparison ──────────────────────────────────────
  const avgLifetime = 2_200_000   // $55K/yr × 40 yrs
  const lifetimes = earnings / avgLifetime
  if (lifetimes >= 2) {
    facts.push({
      emoji: '👷',
      headline: `${lifetimes.toFixed(1)} lifetimes of work`,
      body: `The average American earns about $2.2M over a full 40-year career. ${name}'s NBA money equals ${lifetimes.toFixed(1)} of those lifetimes — without ever clocking into an office.`,
      gradient: 'from-blue-950 to-[#111]',
      accent: 'text-blue-400',
    })
  } else {
    const yearsAtAvg = Math.round(earnings / 55_000)
    facts.push({
      emoji: '💼',
      headline: `${yearsAtAvg} years of work`,
      body: `At an average U.S. salary of $55K/year, it would take ${yearsAtAvg} years to earn what ${name} made in the NBA — roughly ${(yearsAtAvg / 40).toFixed(1)} full careers.`,
      gradient: 'from-blue-950 to-[#111]',
      accent: 'text-blue-400',
    })
  }

  // ── Fact 3: Fun real-world equivalent ───────────────────────────────────────
  const ferrari = 320_000
  const ferraris = Math.floor(earnings / ferrari)
  const bigMac = 6
  const bigMacs = Math.round(earnings / bigMac)
  const nbaTicket = 250
  const tickets = Math.round(earnings / nbaTicket)

  if (ferraris >= 10) {
    facts.push({
      emoji: '🏎️',
      headline: `${ferraris.toLocaleString()} Ferraris`,
      body: `${name}'s career earnings could buy ${ferraris.toLocaleString()} Ferrari 488s at ~$320K each. That's enough to fill ${Math.ceil(ferraris / 6)} dealerships — bumper to bumper.`,
      gradient: 'from-red-950 to-[#111]',
      accent: 'text-red-400',
    })
  } else if (bigMacs > 500_000) {
    facts.push({
      emoji: '🍔',
      headline: `${bigMacs.toLocaleString()} Big Macs`,
      body: `At today's $6 average price, ${name}'s career earnings could buy ${bigMacs.toLocaleString()} Big Macs. That's enough to feed a small city — every single day — for years.`,
      gradient: 'from-yellow-950 to-[#111]',
      accent: 'text-yellow-400',
    })
  } else {
    facts.push({
      emoji: '🏀',
      headline: `${tickets.toLocaleString()} courtside seats`,
      body: `At $250 per ticket, ${name}'s NBA paycheck could buy ${tickets.toLocaleString()} courtside seats. You'd still be watching games for the next ${Math.ceil(tickets / 82)} seasons straight.`,
      gradient: 'from-green-950 to-[#111]',
      accent: 'text-green-400',
    })
  }

  // ── Fact 4: Era context ──────────────────────────────────────────────────────
  const careerYears = Math.max(1, p.yearTo - p.yearFrom)
  const perGame = Math.round(earnings / Math.max(1, p.careerGames))
  const perMinute = p.careerGames > 0 && p.careerMPG > 0
    ? Math.round(earnings / (p.careerGames * p.careerMPG))
    : null

  if (perGame > 10_000) {
    facts.push({
      emoji: '💸',
      headline: `${fmt(perGame)} per game`,
      body: `Across ${p.careerGames.toLocaleString()} career games, ${name} averaged roughly ${fmtFull(perGame)} per game played — ${perMinute ? `about ${fmtFull(perMinute)} per minute on the court.` : `that's ${fmt(perGame / 48)} per minute if you assume 48-minute games.`}`,
      gradient: 'from-purple-950 to-[#111]',
      accent: 'text-purple-400',
    })
  } else {
    facts.push({
      emoji: '📅',
      headline: `${careerYears}-year career`,
      body: `${name} played ${careerYears} seasons in the NBA, earning an estimated ${fmt(earnings / careerYears)}/year on average. That's ${fmt(earnings / careerYears / 12)}/month — for playing basketball.`,
      gradient: 'from-purple-950 to-[#111]',
      accent: 'text-purple-400',
    })
  }

  return facts
}

export default function FunFactsPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cardIndex, setCardIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [factIndex, setFactIndex] = useState(0)

  useEffect(() => {
    fetch('/api/players')
      .then(r => r.json())
      .then((data: Player[]) => {
        // Shuffle so niche/unexpected players surface alongside stars
        const arr = data as Player[]
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[arr[i], arr[j]] = [arr[j], arr[i]]
        }
        setPlayers(arr)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (!search) return players
    const q = search.toLowerCase()
    return players.filter(p =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
      p.team.toLowerCase().includes(q)
    )
  }, [players, search])

  function handleSearch(v: string) {
    setSearch(v)
    setCardIndex(0)
    setIsFlipped(false)
    setFactIndex(0)
  }

  function nextPlayer() {
    setCardIndex(i => (i + 1) % Math.max(1, filtered.length))
    setIsFlipped(false)
    setFactIndex(0)
  }

  function prevPlayer() {
    setCardIndex(i => (i - 1 + Math.max(1, filtered.length)) % Math.max(1, filtered.length))
    setIsFlipped(false)
    setFactIndex(0)
  }

  function flipCard() {
    setIsFlipped(f => !f)
    if (isFlipped) setFactIndex(0)
  }

  function nextFact(e: React.MouseEvent) {
    e.stopPropagation()
    setFactIndex(i => (i + 1) % facts.length)
  }

  function prevFact(e: React.MouseEvent) {
    e.stopPropagation()
    setFactIndex(i => (i - 1 + facts.length) % facts.length)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  const current = filtered[cardIndex]
  const facts = current ? generateFacts(current) : []
  const currentFact = facts[factIndex]
  const earnings = current ? estimateCareerEarnings(current) : 0

  return (
    <div className="min-h-screen bg-[#0A0A0A] py-10 px-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="font-display text-4xl text-orange-500 leading-none">Fun Facts</h1>
            <p className="text-gray-600 text-xs mt-1">{filtered.length} players · earnings in perspective</p>
          </div>
          <Link href="/lobby" className="text-gray-500 hover:text-white text-sm transition-colors">← Lobby</Link>
        </div>

        {/* Search */}
        <input
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search player or team..."
          className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500 mb-5"
        />

        {filtered.length === 0 ? (
          <div className="bg-[#111] border border-white/5 rounded-2xl p-12 text-center">
            <p className="text-gray-500">No players found for &ldquo;{search}&rdquo;</p>
          </div>
        ) : (
          <>
            {/* Player nav */}
            <div className="flex items-center justify-between mb-3 px-1">
              <button
                onClick={prevPlayer}
                className="w-10 h-10 rounded-xl bg-[#111] border border-white/5 text-gray-400 hover:text-white flex items-center justify-center transition-colors text-lg"
              >
                ←
              </button>
              <span className="text-gray-600 text-xs font-bold tabular-nums">
                {cardIndex + 1} / {filtered.length}
              </span>
              <button
                onClick={nextPlayer}
                className="w-10 h-10 rounded-xl bg-[#111] border border-white/5 text-gray-400 hover:text-white flex items-center justify-center transition-colors text-lg"
              >
                →
              </button>
            </div>

            {/* Flip card */}
            <div
              className="relative cursor-pointer select-none"
              style={{ perspective: '1200px', height: '480px' }}
              onClick={flipCard}
            >
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  transformStyle: 'preserve-3d',
                  transition: 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
              >
                {/* ── FRONT ─────────────────────────────────────────────────── */}
                <div
                  style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                  className="absolute inset-0 bg-[#111] border border-white/5 rounded-3xl p-6 flex flex-col overflow-hidden"
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between mb-5">
                    <div className="bg-[#0A0A0A] rounded-xl px-3 py-2.5 text-center">
                      <div className="text-orange-400 font-black text-2xl leading-none">{current.ebkScore.toFixed(1)}</div>
                      <div className="text-gray-700 text-[9px] mt-0.5 uppercase tracking-wide">EBK</div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-400 text-sm font-bold">{current.position}</div>
                      <div className="text-gray-600 text-xs mt-0.5">{current.team}</div>
                    </div>
                  </div>

                  {/* Player name */}
                  <div className="flex-1 flex flex-col justify-center">
                    <div className="text-white font-black leading-none mb-1" style={{ fontSize: 'clamp(2rem, 10vw, 3rem)' }}>
                      {current.firstName}
                    </div>
                    <div className="text-orange-400 font-black leading-none mb-3" style={{ fontSize: 'clamp(2rem, 10vw, 3rem)' }}>
                      {current.lastName}
                    </div>
                    <div className="text-gray-500 text-sm mb-5">{current.yearFrom}–{current.yearTo}</div>

                    {/* Career earnings block */}
                    <div className="bg-gradient-to-r from-orange-950/60 to-[#0A0A0A] border border-orange-800/30 rounded-2xl px-4 py-3 mb-4">
                      <div className="text-gray-500 text-[10px] uppercase tracking-widest mb-0.5">Est. Career Earnings</div>
                      <div className="text-orange-400 font-black text-3xl">{fmt(earnings)}</div>
                    </div>

                    {/* Quick stats */}
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { l: 'GP',  v: current.careerGames.toLocaleString() },
                        { l: 'PPG', v: current.careerPPG.toFixed(1) },
                        { l: 'RPG', v: current.careerRPG.toFixed(1) },
                        { l: 'APG', v: current.careerAPG.toFixed(1) },
                      ].map(s => (
                        <div key={s.l} className="bg-[#0A0A0A] rounded-lg px-2 py-2 text-center">
                          <div className="text-white font-black text-sm leading-none">{s.v}</div>
                          <div className="text-gray-600 text-[10px] mt-0.5">{s.l}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Flip hint */}
                  <div className="mt-4 text-center">
                    <span className="text-gray-700 text-xs tracking-wide animate-pulse">tap to put it in perspective →</span>
                  </div>
                </div>

                {/* ── BACK ──────────────────────────────────────────────────── */}
                <div
                  style={{
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                  }}
                  className={`absolute inset-0 bg-gradient-to-br ${currentFact?.gradient ?? 'from-[#111] to-[#0A0A0A]'} border border-white/5 rounded-3xl p-6 flex flex-col overflow-hidden`}
                >
                  {currentFact && (
                    <>
                      {/* Player name + earnings mini header */}
                      <div className="flex items-start justify-between mb-5">
                        <div>
                          <div className="text-gray-300 font-black text-sm">{current.firstName} {current.lastName}</div>
                          <div className={`text-xs font-bold mt-0.5 ${currentFact.accent}`}>{fmt(earnings)}</div>
                        </div>
                        <div className="text-4xl">{currentFact.emoji}</div>
                      </div>

                      {/* Main fact */}
                      <div className="flex-1 flex flex-col justify-center">
                        <div className={`font-black text-2xl leading-tight mb-4 ${currentFact.accent}`}>
                          {currentFact.headline}
                        </div>
                        <p className="text-gray-100 text-base leading-relaxed">
                          {currentFact.body}
                        </p>
                      </div>

                      {/* Fact nav dots + prev/next */}
                      <div className="mt-5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-3">
                          <button
                            onClick={prevFact}
                            className="text-gray-500 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                          >
                            ‹ prev
                          </button>
                          <div className="flex items-center gap-2">
                            {facts.map((_, i) => (
                              <button
                                key={i}
                                onClick={e => { e.stopPropagation(); setFactIndex(i) }}
                                className={`rounded-full transition-all ${i === factIndex ? 'w-4 h-2 bg-white' : 'w-2 h-2 bg-gray-700 hover:bg-gray-500'}`}
                              />
                            ))}
                          </div>
                          <button
                            onClick={nextFact}
                            className="text-gray-500 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                          >
                            next ›
                          </button>
                        </div>
                        <div className="text-center">
                          <span className="text-gray-700 text-[11px]">tap card to flip back</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom nav buttons */}
            <div className="flex items-center gap-3 mt-5">
              <button
                onClick={prevPlayer}
                className="flex-1 bg-[#111] border border-white/5 text-gray-400 hover:text-white font-black py-3 rounded-2xl transition-colors text-sm"
              >
                ← Prev
              </button>
              <button
                onClick={nextPlayer}
                className="flex-1 bg-[#111] border border-white/5 text-gray-400 hover:text-white font-black py-3 rounded-2xl transition-colors text-sm"
              >
                Next →
              </button>
            </div>

            {/* Disclaimer */}
            <p className="text-center text-gray-700 text-[11px] mt-4 leading-relaxed px-2">
              Earnings are estimates based on era and performance — not official salary data.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
