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

// Only pre-1950 events are used for comparisons (post-1950 kept for reference but filtered out)
const EVENTS = [
  // — Ancient world —
  { year: -3000, desc: 'the Egyptian pyramids being built (3000 BC)',              emoji: '🏺' },
  { year: -2300, desc: 'Stonehenge being constructed (2300 BC)',                   emoji: '🪨' },
  { year: -776,  desc: 'the first Olympic Games in ancient Greece (776 BC)',       emoji: '🏅' },
  { year: -509,  desc: 'the Roman Republic being founded (509 BC)',                emoji: '🏛️' },
  { year: -490,  desc: 'the Battle of Marathon (490 BC)',                          emoji: '🏃' },
  { year: -323,  desc: "Alexander the Great's death and empire collapsing (323 BC)", emoji: '⚔️' },
  { year: -221,  desc: 'China first being unified under Qin Shi Huang (221 BC)',   emoji: '🐉' },
  { year: -44,   desc: "Julius Caesar's assassination (44 BC)",                   emoji: '🗡️' },
  { year: -27,   desc: 'the Roman Empire being founded (27 BC)',                   emoji: '🏛️' },
  // — Early AD —
  { year: 1,     desc: "the birth of Christ (1 AD)",                              emoji: '✝️' },
  { year: 476,   desc: 'the fall of the Western Roman Empire (476 AD)',            emoji: '🏛️' },
  { year: 610,   desc: "Muhammad's first revelation and Islam being founded (610 AD)", emoji: '☪️' },
  { year: 793,   desc: 'the Viking raids beginning (793 AD)',                      emoji: '⚓' },
  { year: 1096,  desc: 'the First Crusade beginning (1096)',                       emoji: '✝️' },
  { year: 1206,  desc: 'Genghis Khan founding the Mongol Empire (1206)',           emoji: '🏇' },
  { year: 1066,  desc: 'the Norman conquest of England (1066)',                    emoji: '🏰' },
  { year: 1215,  desc: 'the Magna Carta being signed (1215)',                      emoji: '📜' },
  { year: 1347,  desc: 'the Black Plague (1347)',                                  emoji: '💀' },
  { year: 1440,  desc: "Gutenberg's printing press revolutionizing the world (1440)", emoji: '📖' },
  { year: 1453,  desc: 'the fall of Constantinople ending the Byzantine Empire (1453)', emoji: '🏰' },
  { year: 1492,  desc: "Columbus's voyage to America (1492)",                      emoji: '⛵' },
  { year: 1498,  desc: 'Vasco da Gama reaching India by sea (1498)',               emoji: '🌊' },
  { year: 1517,  desc: "Martin Luther's 95 Theses sparking the Reformation (1517)", emoji: '⛪' },
  { year: 1521,  desc: 'the Aztec Empire falling to Cortés (1521)',                emoji: '🌽' },
  { year: 1522,  desc: "Magellan's crew completing the first circumnavigation (1522)", emoji: '🌐' },
  { year: 1564,  desc: 'Shakespeare being born (1564)',                            emoji: '🎭' },
  { year: 1588,  desc: 'the Spanish Armada being defeated (1588)',                 emoji: '⚓' },
  { year: 1607,  desc: 'Jamestown — the first permanent English colony — being founded (1607)', emoji: '🏴' },
  { year: 1620,  desc: 'the Pilgrims landing at Plymouth Rock (1620)',             emoji: '🦃' },
  { year: 1648,  desc: 'the Peace of Westphalia ending the Thirty Years War (1648)', emoji: '🕊️' },
  { year: 1666,  desc: 'the Great Fire of London (1666)',                          emoji: '🔥' },
  { year: 1687,  desc: "Newton publishing his laws of motion (1687)",              emoji: '🍎' },
  // — 1700s —
  { year: 1707,  desc: 'Great Britain being formed by the Acts of Union (1707)',   emoji: '🇬🇧' },
  { year: 1773,  desc: 'the Boston Tea Party (1773)',                              emoji: '🍵' },
  { year: 1776,  desc: 'U.S. independence (1776)',                                 emoji: '🗽' },
  { year: 1783,  desc: 'the Treaty of Paris officially ending the American Revolution (1783)', emoji: '📜' },
  { year: 1788,  desc: 'Australia being claimed by Britain (1788)',                emoji: '🦘' },
  { year: 1789,  desc: 'the French Revolution (1789)',                             emoji: '🥖' },
  // — 1800s —
  { year: 1804,  desc: 'Haiti becoming the first Black republic in history (1804)', emoji: '🇭🇹' },
  { year: 1815,  desc: "Napoleon's defeat at Waterloo (1815)",                     emoji: '🐴' },
  { year: 1821,  desc: "Mexico declaring independence from Spain (1821)",          emoji: '🇲🇽' },
  { year: 1822,  desc: "Brazil declaring independence (1822)",                     emoji: '🇧🇷' },
  { year: 1833,  desc: 'slavery being abolished across the British Empire (1833)', emoji: '⛓️' },
  { year: 1848,  desc: 'the California Gold Rush (1848)',                          emoji: '⛏️' },
  { year: 1853,  desc: "Japan being forced open to trade by Perry's expedition (1853)", emoji: '🗾' },
  { year: 1861,  desc: 'the U.S. Civil War starting (1861)',                       emoji: '⚔️' },
  { year: 1865,  desc: 'the Civil War ending & Lincoln being assassinated (1865)', emoji: '🎩' },
  { year: 1867,  desc: 'Canadian Confederation (1867)',                            emoji: '🍁' },
  { year: 1868,  desc: 'the Meiji Restoration modernizing Japan (1868)',           emoji: '🗾' },
  { year: 1869,  desc: 'the Suez Canal opening (1869)',                            emoji: '🚢' },
  { year: 1871,  desc: 'Germany being unified as a nation (1871)',                 emoji: '🇩🇪' },
  { year: 1876,  desc: 'the telephone being invented by Alexander Graham Bell (1876)', emoji: '📞' },
  { year: 1885,  desc: 'the Canadian Pacific Railway completing (1885)',           emoji: '🚂' },
  { year: 1886,  desc: 'the Statue of Liberty being unveiled (1886)',              emoji: '🗽' },
  { year: 1891,  desc: 'basketball being invented in Canada by Dr. Naismith (1891)', emoji: '🏀' },
  { year: 1899,  desc: 'the Boer War beginning in South Africa (1899)',            emoji: '🌍' },
  // — Early 1900s —
  { year: 1901,  desc: 'Australia becoming a federated nation (1901)',             emoji: '🦘' },
  { year: 1903,  desc: "the Wright Brothers' first flight (1903)",                 emoji: '✈️' },
  { year: 1910,  desc: 'the Union of South Africa being formed (1910)',            emoji: '🌍' },
  { year: 1912,  desc: 'the Titanic sinking (1912)',                               emoji: '🚢' },
  { year: 1914,  desc: 'WWI beginning (1914)',                                     emoji: '🪖' },
  { year: 1917,  desc: "Canada's victory at Vimy Ridge (1917)",                   emoji: '🍁' },
  { year: 1917,  desc: 'the Russian Revolution (1917)',                            emoji: '🚩' },
  { year: 1918,  desc: 'WWI ending (1918)',                                        emoji: '🕊️' },
  { year: 1919,  desc: 'the Treaty of Versailles being signed (1919)',             emoji: '📜' },
  { year: 1920,  desc: 'U.S. Prohibition beginning (1920)',                        emoji: '🍺' },
  { year: 1923,  desc: 'the Turkish Republic being founded by Atatürk (1923)',     emoji: '🇹🇷' },
  { year: 1929,  desc: 'the Great Depression starting (1929)',                     emoji: '📉' },
  { year: 1930,  desc: "Gandhi's Salt March defying British rule (1930)",          emoji: '🧂' },
  { year: 1933,  desc: 'Hitler rising to power in Germany (1933)',                 emoji: '⚠️' },
  { year: 1936,  desc: 'the Spanish Civil War beginning (1936)',                   emoji: '🇪🇸' },
  { year: 1939,  desc: 'WWII beginning (1939)',                                    emoji: '🪖' },
  { year: 1941,  desc: 'the attack on Pearl Harbor (1941)',                        emoji: '💣' },
  { year: 1945,  desc: 'WWII ending (1945)',                                       emoji: '🌍' },
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

function yearsAgo(year: number): number {
  return year < 0 ? CURRENT_YEAR + Math.abs(year) + 1 : CURRENT_YEAR - year
}

function eligibleEvents(earnings: number) {
  return EVENTS.filter(e => {
    if (e.year >= 1950) return false          // must be a truly historical event
    const perYr = earnings / yearsAgo(e.year)
    return perYr >= 100_000 && perYr <= 1_000_000
  })
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

  // ── Fact 1: Historical event comparison ($100K–$1M/yr range) ──────────────
  // Pick from events where the implied yearly income is $100K–$1M.
  // Player ID is used as a tiebreaker so adjacent players get different events.
  const candidates = eligibleEvents(earnings)
  const ev = candidates[p.id % candidates.length]
  const perYearNeeded = Math.round(earnings / yearsAgo(ev.year))

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

  // ── Fact 3: Fun real-world equivalent (rotated by player ID) ────────────────
  // min = minimum earnings needed to show a non-zero/meaningful number
  const comparisons = [
    { min: 1_600_000,   fn: () => { const n = Math.floor(earnings / 320_000);    return { emoji: '🏎️', headline: `${n.toLocaleString()} luxury sports cars`,   body: `At ~$320K a pop, ${name}'s career earnings could buy ${n.toLocaleString()} luxury sports cars — enough to fill ${Math.ceil(n / 6)} dealerships bumper to bumper.`, gradient: 'from-red-950 to-[#111]', accent: 'text-red-400' } } },
    { min: 4_500_000,   fn: () => { const n = Math.floor(earnings / 1_500_000);  return { emoji: '🏠', headline: `${n.toLocaleString()} houses`,                body: `At the average North American home price of ~$1.5M, ${name} could have bought ${n.toLocaleString()} houses outright — no mortgage, no haggling.`, gradient: 'from-emerald-950 to-[#111]', accent: 'text-emerald-400' } } },
    { min: 90_000_000,  fn: () => { const n = Math.floor(earnings / 90_000_000); return { emoji: '🚀', headline: `${n} trip${n !== 1 ? 's' : ''} to space`,      body: `A seat on a private space mission runs ~$90M. ${name}'s career earnings could have funded ${n} round trip${n !== 1 ? 's' : ''} to orbit — just for fun.`, gradient: 'from-indigo-950 to-[#111]', accent: 'text-indigo-400' } } },
    { min: 600_000,     fn: () => { const n = Math.round(earnings / 6);          return { emoji: '🍔', headline: `${n.toLocaleString()} burgers`,               body: `At $6 each, ${name}'s NBA paycheck buys ${n.toLocaleString()} fast-food burgers — roughly one for every person in ${earnings > 500_000_000 ? 'Canada' : 'a mid-sized city'}.`, gradient: 'from-yellow-950 to-[#111]', accent: 'text-yellow-400' } } },
    { min: 750_000,     fn: () => { const n = Math.floor(earnings / 250_000);    return { emoji: '🎰', headline: `${n.toLocaleString()} Vegas weekends`,         body: `A baller Vegas weekend runs ~$250K once you factor in the suite, bottles, and gambling. ${name} could've done that ${n.toLocaleString()} times over.`, gradient: 'from-violet-950 to-[#111]', accent: 'text-violet-400' } } },
    { min: 18_000_000,  fn: () => { const n = Math.floor(earnings / 18_000_000); return { emoji: '⚽', headline: `${n} top soccer salaries`,                    body: `The average top European soccer league salary is ~$18M/year. ${name}'s NBA career total could fund ${n} of those players for a full season.`, gradient: 'from-green-950 to-[#111]', accent: 'text-green-400' } } },
    { min: 400_000,     fn: () => { const n = Math.floor(earnings / 400);        return { emoji: '🎟️', headline: `${n.toLocaleString()} NBA tickets`,           body: `At ~$400 average per game, ${name}'s career earnings could buy ${n.toLocaleString()} NBA tickets — enough to attend every game for ${Math.ceil(n / 82)} seasons straight.`, gradient: 'from-orange-950 to-[#111]', accent: 'text-orange-400' } } },
    { min: 1_000_000,   fn: () => { const n = Math.floor(earnings / 100_000);    return { emoji: '🎓', headline: `${n.toLocaleString()} college tuitions`,       body: `A four-year degree at a top U.S. university runs ~$100K. ${name} could have personally paid full tuition for ${n.toLocaleString()} students.`, gradient: 'from-sky-950 to-[#111]', accent: 'text-sky-400' } } },
    { min: 500_000,     fn: () => { const n = Math.floor(earnings / 500);        return { emoji: '👟', headline: `${n.toLocaleString()} premium sneakers`,       body: `A new premium sneaker retails around $500. ${name} could've stacked ${n.toLocaleString()} pairs — a sneaker wall taller than most buildings.`, gradient: 'from-rose-950 to-[#111]', accent: 'text-rose-400' } } },
    { min: 1,           fn: () => { const n = Math.floor(earnings / 800_000_000); const pct = ((earnings / 800_000_000) * 100).toFixed(1); return n >= 1 ? { emoji: '🌉', headline: `${n} Golden Gate Bridges`, body: `The Golden Gate Bridge cost ~$800M in today's dollars. ${name}'s career earnings could have funded ${n} of them from scratch.`, gradient: 'from-orange-950 to-[#111]', accent: 'text-orange-400' } : { emoji: '🌉', headline: `${pct}% of the Golden Gate Bridge`, body: `The Golden Gate Bridge cost ~$800M in today's dollars. ${name}'s career earnings would cover ${pct}% of construction.`, gradient: 'from-orange-950 to-[#111]', accent: 'text-orange-400' } } },
    { min: 350_000,     fn: () => { const n = Math.floor(earnings / 35_000);     return { emoji: '🚗', headline: `${n.toLocaleString()} new cars`,               body: `The average new car in North America costs ~$35K. ${name}'s NBA money could buy ${n.toLocaleString()} of them — one for every resident of a small town.`, gradient: 'from-slate-950 to-[#111]', accent: 'text-slate-400' } } },
    { min: 1_200_000,   fn: () => { const n = Math.floor(earnings / 1_200);      return { emoji: '✈️', headline: `${n.toLocaleString()} business-class flights`, body: `A business-class round trip from New York to London runs ~$1,200. ${name} could've flown that route ${n.toLocaleString()} times — crossing the Atlantic ${Math.round(n / 365)} times a day for a year.`, gradient: 'from-cyan-950 to-[#111]', accent: 'text-cyan-400' } } },
    { min: 1_000_000,   fn: () => { const n = Math.round(earnings / 10);         return { emoji: '☕', headline: `${n.toLocaleString()} coffees`,                body: `At $10 a coffee, ${name}'s career earnings could fuel ${n.toLocaleString()} coffee runs. That's enough caffeine to keep an entire city wired for years.`, gradient: 'from-amber-950 to-[#111]', accent: 'text-amber-400' } } },
  ]

  // Only include comparisons where earnings meet the minimum threshold
  const validComparisons = comparisons.filter(c => earnings >= c.min)
  const chosen = validComparisons[(p.id * 3) % validComparisons.length].fn()
  facts.push({
    emoji: chosen.emoji,
    headline: chosen.headline,
    body: chosen.body,
    gradient: chosen.gradient,
    accent: chosen.accent,
  })

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
        // Keep only players whose earnings produce a $100K–$1M/yr comparison
        const eligible = (data as Player[]).filter(p =>
          eligibleEvents(estimateCareerEarnings(p)).length > 0
        )
        // Shuffle so niche players surface alongside stars
        for (let i = eligible.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[eligible[i], eligible[j]] = [eligible[j], eligible[i]]
        }
        setPlayers(eligible)
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
                        <div className="flex items-center gap-2 mb-3">
                          <button
                            onClick={prevFact}
                            className="bg-white/10 hover:bg-white/20 text-white font-black px-4 py-2.5 rounded-xl transition-colors text-base"
                          >
                            ←
                          </button>
                          <button
                            onClick={nextFact}
                            className="flex-1 bg-white text-black font-black py-2.5 rounded-xl transition-colors text-base tracking-wide hover:bg-gray-100 active:bg-gray-200"
                          >
                            Next perspective →
                          </button>
                        </div>
                        <div className="flex items-center justify-center gap-2">
                          {facts.map((_, i) => (
                            <button
                              key={i}
                              onClick={e => { e.stopPropagation(); setFactIndex(i) }}
                              className={`rounded-full transition-all ${i === factIndex ? 'w-4 h-2 bg-white' : 'w-2 h-2 bg-white/30 hover:bg-white/50'}`}
                            />
                          ))}
                        </div>
                        <div className="text-center mt-2">
                          <span className="text-white/30 text-[11px]">tap card to flip back</span>
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
