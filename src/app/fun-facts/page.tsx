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
  careerEarnings: number   // real scraped value; 0 = use formula estimate
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
  // Use real scraped earnings when available; fall back to era-based estimate
  const earnings = p.careerEarnings > 0 ? p.careerEarnings : estimateCareerEarnings(p)
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
    // ── Homes & everyday ─────────────────────────────────────────────────────
    { min: 4_500_000,   fn: () => { const n = Math.floor(earnings / 1_500_000);  return { emoji: '🏠', headline: `${n.toLocaleString()} houses`,                   body: `At the average North American home price of ~$1.5M, ${name} could have bought ${n.toLocaleString()} houses outright — no mortgage, no haggling.`, gradient: 'from-emerald-950 to-[#111]', accent: 'text-emerald-400' } } },
    { min: 600_000,     fn: () => { const n = Math.round(earnings / 6);           return { emoji: '🍔', headline: `${n.toLocaleString()} burgers`,                  body: `At $6 each, ${name}'s NBA paycheck buys ${n.toLocaleString()} fast-food burgers — roughly one for every person in ${earnings > 500_000_000 ? 'Canada' : 'a mid-sized city'}.`, gradient: 'from-yellow-950 to-[#111]', accent: 'text-yellow-400' } } },
    { min: 1_000,       fn: () => { const n = Math.floor(earnings / 1_000);       return { emoji: '📱', headline: `${n.toLocaleString()} iPhones`,                  body: `At ~$1,000 for the latest iPhone, ${name}'s career earnings could buy ${n.toLocaleString()} of them — one for every person in ${earnings > 300_000_000 ? 'a large city' : 'a small town'}.`, gradient: 'from-gray-900 to-[#111]', accent: 'text-gray-300' } } },
    { min: 200,         fn: () => { const n = Math.floor(earnings / 204);         return { emoji: '📺', headline: `${n.toLocaleString()} years of Netflix`,          body: `At ~$17/month, ${name}'s career earnings could pay for ${n.toLocaleString()} years of Netflix — enough to binge-watch non-stop until the year ${2024 + n}.`, gradient: 'from-red-950 to-[#111]', accent: 'text-red-400' } } },
    { min: 400_000,     fn: () => { const n = Math.floor(earnings / 400);         return { emoji: '🎟️', headline: `${n.toLocaleString()} NBA tickets`,             body: `At ~$400 average per game, ${name}'s career earnings could buy ${n.toLocaleString()} NBA tickets — enough to attend every game for ${Math.ceil(n / 82)} seasons straight.`, gradient: 'from-orange-950 to-[#111]', accent: 'text-orange-400' } } },
    { min: 1_000_000,   fn: () => { const n = Math.floor(earnings / 100_000);     return { emoji: '🎓', headline: `${n.toLocaleString()} college tuitions`,         body: `A four-year degree at a top U.S. university runs ~$100K. ${name} could have personally paid full tuition for ${n.toLocaleString()} students.`, gradient: 'from-sky-950 to-[#111]', accent: 'text-sky-400' } } },
    { min: 500_000,     fn: () => { const n = Math.floor(earnings / 500);         return { emoji: '👟', headline: `${n.toLocaleString()} premium sneakers`,         body: `A new premium sneaker retails around $500. ${name} could've stacked ${n.toLocaleString()} pairs — a sneaker wall taller than most buildings.`, gradient: 'from-rose-950 to-[#111]', accent: 'text-rose-400' } } },
    { min: 350_000,     fn: () => { const n = Math.floor(earnings / 35_000);      return { emoji: '🚗', headline: `${n.toLocaleString()} new cars`,                 body: `The average new car in North America costs ~$35K. ${name}'s NBA money could buy ${n.toLocaleString()} of them — one for every resident of a small town.`, gradient: 'from-slate-950 to-[#111]', accent: 'text-slate-400' } } },
    { min: 1_200_000,   fn: () => { const n = Math.floor(earnings / 1_200);       return { emoji: '✈️', headline: `${n.toLocaleString()} business-class flights`,  body: `A business-class round trip from New York to London runs ~$1,200. ${name} could've flown that route ${n.toLocaleString()} times — crossing the Atlantic ${Math.round(n / 365)} times a day for a year.`, gradient: 'from-cyan-950 to-[#111]', accent: 'text-cyan-400' } } },
    { min: 1_000_000,   fn: () => { const n = Math.round(earnings / 10);          return { emoji: '☕', headline: `${n.toLocaleString()} coffees`,                  body: `At $10 a coffee, ${name}'s career earnings could fuel ${n.toLocaleString()} coffee runs. That's enough caffeine to keep an entire city wired for years.`, gradient: 'from-amber-950 to-[#111]', accent: 'text-amber-400' } } },
    // ── Food & drink ─────────────────────────────────────────────────────────
    { min: 200_000,     fn: () => { const n = Math.floor(earnings / 20);          return { emoji: '🍕', headline: `${n.toLocaleString()} pizzas`,                   body: `At $20 a pizza, ${name}'s NBA career could buy ${n.toLocaleString()} pies — enough to give a slice to every single person in ${earnings > 200_000_000 ? 'New York City' : 'a small city'}.`, gradient: 'from-orange-950 to-[#111]', accent: 'text-orange-400' } } },
    { min: 100_000,     fn: () => { const n = Math.floor(earnings / 2);           return { emoji: '🍫', headline: `${n.toLocaleString()} chocolate bars`,           body: `At $2 a bar, ${name}'s career earnings could buy ${n.toLocaleString()} chocolate bars — that's ${Math.round(n / 365).toLocaleString()} bars a day for an entire year.`, gradient: 'from-amber-950 to-[#111]', accent: 'text-amber-400' } } },
    { min: 300_000,     fn: () => { const n = Math.floor(earnings / 3);           return { emoji: '🌮', headline: `${n.toLocaleString()} street tacos`,             body: `At $3 each, ${name}'s career earnings could fund ${n.toLocaleString()} street tacos — that's Taco Tuesday for an entire country, every single week.`, gradient: 'from-yellow-950 to-[#111]', accent: 'text-yellow-400' } } },
    { min: 800_000,     fn: () => { const n = Math.floor(earnings / 80);          return { emoji: '🍷', headline: `${n.toLocaleString()} bottles of wine`,          body: `A nice bottle of wine runs about $80. ${name}'s NBA earnings could stock ${n.toLocaleString()} bottles — enough to fill a wine cellar the size of a gymnasium.`, gradient: 'from-purple-950 to-[#111]', accent: 'text-purple-400' } } },
    { min: 1_500_000,   fn: () => { const n = Math.floor(earnings / 150);         return { emoji: '🦞', headline: `${n.toLocaleString()} lobster dinners`,          body: `A full lobster dinner at a nice restaurant runs ~$150. ${name} could have treated ${n.toLocaleString()} people to surf-and-turf — no splitting the bill.`, gradient: 'from-red-950 to-[#111]', accent: 'text-red-400' } } },
    { min: 5_000_000,   fn: () => { const n = Math.floor(earnings / 500);         return { emoji: '🍣', headline: `${n.toLocaleString()} Michelin-star meals`,      body: `A tasting menu at a Michelin 3-star restaurant runs ~$500/person. ${name}'s career could have treated ${n.toLocaleString()} people to the finest dining on earth.`, gradient: 'from-pink-950 to-[#111]', accent: 'text-pink-400' } } },
    { min: 800_000,     fn: () => { const n = Math.floor(earnings / 8);           return { emoji: '🍺', headline: `${n.toLocaleString()} craft beers`,              body: `At $8 a craft beer, ${name}'s career earnings could buy ${n.toLocaleString()} cold ones — enough to keep every bar in a city stocked for a decade.`, gradient: 'from-amber-950 to-[#111]', accent: 'text-amber-400' } } },
    // ── Sports & events ───────────────────────────────────────────────────────
    { min: 90_000_000,  fn: () => { const n = Math.floor(earnings / 90_000_000);  return { emoji: '🚀', headline: `${n} trip${n !== 1 ? 's' : ''} to space`,        body: `A seat on a private space mission runs ~$90M. ${name}'s career earnings could have funded ${n} round trip${n !== 1 ? 's' : ''} to orbit — just for fun.`, gradient: 'from-indigo-950 to-[#111]', accent: 'text-indigo-400' } } },
    { min: 1_000_000,   fn: () => { const n = Math.floor(earnings / 10_000);      return { emoji: '🏈', headline: `${n.toLocaleString()} Super Bowl tickets`,       body: `A Super Bowl ticket averages ~$10K on the secondary market. ${name}'s career earnings could buy ${n.toLocaleString()} seats to the biggest game in America.`, gradient: 'from-blue-950 to-[#111]', accent: 'text-blue-400' } } },
    { min: 1_500_000,   fn: () => { const n = Math.floor(earnings / 150);         return { emoji: '🎸', headline: `${n.toLocaleString()} concert tickets`,          body: `At a $150 average ticket price, ${name}'s career earnings could put ${n.toLocaleString()} fans in seats — enough to fill Madison Square Garden ${Math.floor(n / 20_000)} times over.`, gradient: 'from-pink-950 to-[#111]', accent: 'text-pink-400' } } },
    { min: 200_000,     fn: () => { const n = Math.floor(earnings / 2_000);       return { emoji: '🏒', headline: `${n.toLocaleString()} Stanley Cup Finals tickets`, body: `A Stanley Cup Finals ticket runs ~$2,000. ${name}'s career could buy ${n.toLocaleString()} seats to hockey's biggest night — one for every loyal fan in the building.`, gradient: 'from-cyan-950 to-[#111]', accent: 'text-cyan-400' } } },
    { min: 200_000,     fn: () => { const n = Math.floor(earnings / 2_000);       return { emoji: '⚽', headline: `${n.toLocaleString()} World Cup final tickets`, body: `A World Cup final ticket on the secondary market goes for ~$2,000. ${name}'s career earnings could have put ${n.toLocaleString()} fans in the stands for soccer's greatest night.`, gradient: 'from-green-950 to-[#111]', accent: 'text-green-400' } } },
    { min: 200_000,     fn: () => { const n = Math.floor(earnings / 2_000);       return { emoji: '🎾', headline: `${n.toLocaleString()} Wimbledon finals tickets`, body: `A Centre Court seat for the Wimbledon final runs ~$2,000. ${name}'s career earnings could have filled the grounds ${Math.floor(n / 15_000)} times over.`, gradient: 'from-emerald-950 to-[#111]', accent: 'text-emerald-400' } } },
    { min: 500_000,     fn: () => { const n = Math.floor(earnings / 5_000);       return { emoji: '🥊', headline: `${n.toLocaleString()} boxing ringside seats`,    body: `A ringside seat at a major world title fight runs ~$5,000. ${name}'s career could have put ${n.toLocaleString()} fans front-row for the biggest bouts in boxing history.`, gradient: 'from-red-950 to-[#111]', accent: 'text-red-400' } } },
    { min: 100_000,     fn: () => { const n = Math.floor(earnings / 2_000);       return { emoji: '🏇', headline: `${n.toLocaleString()} Kentucky Derby tickets`,   body: `A Kentucky Derby box seat runs ~$2,000. ${name}'s NBA career could have put ${n.toLocaleString()} people in the Infield at Churchill Downs for the Run for the Roses.`, gradient: 'from-rose-950 to-[#111]', accent: 'text-rose-400' } } },
    { min: 200_000,     fn: () => { const n = Math.floor(earnings / 2_000);       return { emoji: '🏅', headline: `${n.toLocaleString()} Olympic opening ceremony tickets`, body: `A premium Olympic Opening Ceremony ticket runs ~$2,000. ${name}'s career earnings could have sent ${n.toLocaleString()} fans to watch the world's greatest athletes march in.`, gradient: 'from-yellow-950 to-[#111]', accent: 'text-yellow-400' } } },
    // ── Travel & experiences ──────────────────────────────────────────────────
    { min: 300_000,     fn: () => { const n = Math.floor(earnings / 3_000);       return { emoji: '🚢', headline: `${n.toLocaleString()} Caribbean cruises`,       body: `A 7-night Caribbean cruise runs ~$3,000 per person. ${name}'s career earnings could have taken ${n.toLocaleString()} people to sea — that's a full fleet of cruise ships.`, gradient: 'from-blue-950 to-[#111]', accent: 'text-blue-400' } } },
    { min: 500_000,     fn: () => { const n = Math.floor(earnings / 5_000);       return { emoji: '🌍', headline: `${n.toLocaleString()} round-the-world trips`,   body: `A round-the-world plane ticket costs ~$5,000. ${name}'s career earnings could send ${n.toLocaleString()} people on a full lap of the globe — first class included.`, gradient: 'from-teal-950 to-[#111]', accent: 'text-teal-400' } } },
    { min: 600_000,     fn: () => { const n = Math.floor(earnings / 60_000);      return { emoji: '🧗', headline: `${n.toLocaleString()} Everest climbs`,           body: `A guided Mount Everest expedition costs ~$60,000. ${name}'s career earnings could fund ${n.toLocaleString()} summit attempts — more than enough to put a team on top of the world.`, gradient: 'from-slate-950 to-[#111]', accent: 'text-slate-400' } } },
    { min: 1_500_000,   fn: () => { const n = Math.floor(earnings / 15_000);      return { emoji: '🛫', headline: `${n.toLocaleString()} hours on a private jet`,  body: `Chartering a private jet runs ~$15,000/hour. ${name}'s career earnings could buy ${n.toLocaleString()} hours of flying above the clouds, no security line required.`, gradient: 'from-violet-950 to-[#111]', accent: 'text-violet-400' } } },
    { min: 300_000,     fn: () => { const n = Math.floor(earnings / 300);         return { emoji: '🚁', headline: `${n.toLocaleString()} helicopter rides`,         body: `A scenic helicopter tour runs ~$300. ${name}'s career earnings could fund ${n.toLocaleString()} helicopter rides — enough to circle the Grand Canyon ${Math.floor(n / 365)} times a day for a year.`, gradient: 'from-sky-950 to-[#111]', accent: 'text-sky-400' } } },
    { min: 200_000,     fn: () => { const n = Math.floor(earnings / 200);         return { emoji: '🪂', headline: `${n.toLocaleString()} tandem skydives`,         body: `A tandem skydive runs ~$200. ${name}'s career earnings could fund ${n.toLocaleString()} jumps from 15,000 feet — that's free-falling every day for ${Math.floor(n / 365)} years straight.`, gradient: 'from-indigo-950 to-[#111]', accent: 'text-indigo-400' } } },
    { min: 1_500_000,   fn: () => { const n = Math.floor(earnings / 15_000);      return { emoji: '🧳', headline: `${n.toLocaleString()} luxury European vacations`, body: `A two-week luxury European vacation runs ~$15,000 per couple. ${name}'s career earnings could fund ${n.toLocaleString()} of them — Paris, Rome, and Barcelona, on repeat.`, gradient: 'from-pink-950 to-[#111]', accent: 'text-pink-400' } } },
    { min: 500_000,     fn: () => { const n = Math.floor(earnings / 500);         return { emoji: '🏖️', headline: `${n.toLocaleString()} all-inclusive resort nights`, body: `A night at a top all-inclusive resort runs ~$500. ${name}'s career could have covered ${n.toLocaleString()} nights — roughly ${Math.floor(n / 365)} years of uninterrupted vacation.`, gradient: 'from-cyan-950 to-[#111]', accent: 'text-cyan-400' } } },
    { min: 500_000,     fn: () => { const n = Math.floor(earnings / 5_000);       return { emoji: '⛷️', headline: `${n.toLocaleString()} ski resort vacations`,     body: `A week-long ski trip runs ~$5,000 all-in. ${name}'s career earnings could have covered ${n.toLocaleString()} trips down the mountain — more than enough fresh powder for a lifetime.`, gradient: 'from-blue-950 to-[#111]', accent: 'text-blue-400' } } },
    // ── Entertainment & culture ───────────────────────────────────────────────
    { min: 2_500_000,   fn: () => { const n = Math.floor(earnings / 250);         return { emoji: '🎭', headline: `${n.toLocaleString()} Broadway shows`,          body: `A premium Broadway ticket runs ~$250. ${name}'s career earnings could put ${n.toLocaleString()} people in the front orchestra — enough to sell out every show on the Great White Way for years.`, gradient: 'from-purple-950 to-[#111]', accent: 'text-purple-400' } } },
    { min: 1_500_000,   fn: () => { const n = Math.floor(earnings / 1_500);       return { emoji: '🎠', headline: `${n.toLocaleString()} Disneyland annual passes`, body: `A Disneyland premium annual pass runs ~$1,500. ${name}'s career earnings could cover ${n.toLocaleString()} of them — enough magic for an entire small city.`, gradient: 'from-yellow-950 to-[#111]', accent: 'text-yellow-400' } } },
    { min: 700_000,     fn: () => { const n = Math.floor(earnings / 70);          return { emoji: '🎮', headline: `${n.toLocaleString()} video games`,              body: `At $70 per new release, ${name}'s career earnings could buy ${n.toLocaleString()} video games — enough to play a different game every day until the year ${2024 + Math.floor(n / 365)}.`, gradient: 'from-indigo-950 to-[#111]', accent: 'text-indigo-400' } } },
    { min: 500_000,     fn: () => { const n = Math.floor(earnings / 500);          return { emoji: '🎮', headline: `${n.toLocaleString()} PS5s`,                     body: `A PlayStation 5 retails for ~$500. ${name}'s career earnings could put ${n.toLocaleString()} PS5s under Christmas trees — one for every gamer in a mid-sized city.`, gradient: 'from-blue-950 to-[#111]', accent: 'text-blue-400' } } },
    { min: 200_000,     fn: () => { const n = Math.floor(earnings / 200);         return { emoji: '🎤', headline: `${n.toLocaleString()} hours in a recording studio`, body: `Studio time at a top recording studio runs ~$200/hour. ${name}'s career earnings could book ${n.toLocaleString()} hours of studio time — enough to record every album ever made.`, gradient: 'from-rose-950 to-[#111]', accent: 'text-rose-400' } } },
    // ── Animals ───────────────────────────────────────────────────────────────
    { min: 300_000,     fn: () => { const n = Math.floor(earnings / 3_000);       return { emoji: '🐕', headline: `${n.toLocaleString()} purebred dogs`,           body: `A purebred golden retriever costs ~$3,000. ${name}'s career earnings could bring ${n.toLocaleString()} dogs home — enough to staff every animal shelter in the country.`, gradient: 'from-amber-950 to-[#111]', accent: 'text-amber-400' } } },
    { min: 750_000,     fn: () => { const n = Math.floor(earnings / 75_000);      return { emoji: '🐴', headline: `${n.toLocaleString()} thoroughbred racehorses`, body: `The average thoroughbred racehorse sells for ~$75K. ${name}'s career earnings could have assembled a stable of ${n.toLocaleString()} horses — a Kentucky Derby roster every year.`, gradient: 'from-brown-950 to-[#111]', accent: 'text-orange-400' } } },
    { min: 150_000,     fn: () => { const n = Math.floor(earnings / 1_500);       return { emoji: '🐄', headline: `${n.toLocaleString()} beef cows`,               body: `A beef cow goes for about $1,500. ${name}'s NBA career earnings could stock a ranch of ${n.toLocaleString()} cows — enough beef to feed a nation for a year.`, gradient: 'from-green-950 to-[#111]', accent: 'text-green-400' } } },
    // ── Music & art ───────────────────────────────────────────────────────────
    { min: 2_000_000,   fn: () => { const n = Math.floor(earnings / 20_000);      return { emoji: '🎸', headline: `${n.toLocaleString()} vintage Gibson guitars`,  body: `A vintage Gibson Les Paul runs ~$20,000. ${name}'s career earnings could have built a collection of ${n.toLocaleString()} of them — enough to outfit every band on the Sunset Strip.`, gradient: 'from-orange-950 to-[#111]', accent: 'text-orange-400' } } },
    { min: 1_000_000,   fn: () => { const n = Math.floor(earnings / 100_000);     return { emoji: '🎹', headline: `${n.toLocaleString()} Steinway grand pianos`,   body: `A Steinway concert grand piano runs ~$100K. ${name}'s career earnings could fill ${n.toLocaleString()} concert halls — every stage in the world, fully loaded.`, gradient: 'from-gray-900 to-[#111]', accent: 'text-gray-300' } } },
    // ── Nature & giving ───────────────────────────────────────────────────────
    { min: 100_000,     fn: () => { const n = Math.floor(earnings / 1);           return { emoji: '🌳', headline: `${n.toLocaleString()} trees planted`,            body: `Organizations like One Tree Planted plant a tree for $1. ${name}'s career earnings could reforest ${n.toLocaleString()} acres of forest — that's a brand new national park.`, gradient: 'from-green-950 to-[#111]', accent: 'text-green-400' } } },
    { min: 500_000,     fn: () => { const n = Math.floor(earnings / 5_000);       return { emoji: '🦏', headline: `${n.toLocaleString()} rhinos protected`,         body: `Conservation groups spend ~$5,000 to protect one rhino for a year. ${name}'s career earnings could guard ${n.toLocaleString()} black rhinos from poachers — saving an entire species.`, gradient: 'from-slate-950 to-[#111]', accent: 'text-slate-400' } } },
    // ── Education & luxury ────────────────────────────────────────────────────
    { min: 1_500_000,   fn: () => { const n = Math.floor(earnings / 150_000);     return { emoji: '🎓', headline: `${n.toLocaleString()} Harvard MBAs`,             body: `A two-year Harvard MBA costs ~$150K in tuition alone. ${name}'s career earnings could fund ${n.toLocaleString()} of them — enough to fill every top boardroom in America.`, gradient: 'from-crimson-950 to-[#111]', accent: 'text-red-400' } } },
    { min: 1_000_000,   fn: () => { const n = Math.floor(earnings / 100);         return { emoji: '🏋️', headline: `${n.toLocaleString()} personal trainer sessions`, body: `A personal trainer session runs ~$100/hour. ${name}'s career earnings could book ${n.toLocaleString()} sessions — enough to get every couch in America off the bench.`, gradient: 'from-teal-950 to-[#111]', accent: 'text-teal-400' } } },
    { min: 8_000_000,   fn: () => { const n = Math.floor(earnings / 80_000);      return { emoji: '🚤', headline: `${n.toLocaleString()} speedboats`,               body: `A high-end speedboat runs ~$80K. ${name}'s career earnings could stock ${n.toLocaleString()} marinas — enough to give every lake in Canada its own personal fleet.`, gradient: 'from-blue-950 to-[#111]', accent: 'text-blue-400' } } },
    { min: 600_000,     fn: () => { const n = Math.floor(earnings / 6_500);       return { emoji: '💍', headline: `${n.toLocaleString()} engagement rings`,         body: `The average U.S. engagement ring costs ~$6,500. ${name}'s career earnings could pop the question ${n.toLocaleString()} times over — every proposal funded, no pressure.`, gradient: 'from-pink-950 to-[#111]', accent: 'text-pink-400' } } },
    { min: 2_500_000,   fn: () => { const n = Math.floor(earnings / 2_500);        return { emoji: '💻', headline: `${n.toLocaleString()} MacBook Pros`,             body: `A maxed-out MacBook Pro runs ~$2,500. ${name}'s career could buy ${n.toLocaleString()} of them — enough to outfit every developer at a Silicon Valley startup.`, gradient: 'from-gray-900 to-[#111]', accent: 'text-gray-300' } } },
    // ── Stocks & ownership ────────────────────────────────────────────────────
    { min: 50_000,      fn: () => { const n = Math.floor(earnings / 5);           return { emoji: '🍥', headline: `${n.toLocaleString()} Cinnabons`,                  body: `A Cinnabon Classic Roll costs about $5. ${name}'s career earnings could buy ${n.toLocaleString()} of them — that's ${Math.round(n / 365).toLocaleString()} cinnamon rolls a day for an entire year.`, gradient: 'from-amber-950 to-[#111]', accent: 'text-amber-400' } } },
    { min: 650_000,     fn: () => { const n = Math.floor(earnings / 650_000);     return { emoji: '📈', headline: `${n} Berkshire Hathaway share${n !== 1 ? 's' : ''}`, body: `One share of Berkshire Hathaway Class A (BRK.A) — Warren Buffett's company — costs ~$650,000. ${name}'s career earnings could buy ${n} of them. Most people will never afford even one.`, gradient: 'from-green-950 to-[#111]', accent: 'text-green-400' } } },
    { min: 3_000_000,   fn: () => { const cap = 3_000_000_000;  const n = Math.floor(earnings / cap); const pct = ((earnings / cap) * 100).toFixed(2); return { emoji: '🍔', headline: n >= 1 ? `${n}× Shake Shack` : `${pct}% of Shake Shack`,              body: n >= 1 ? `Shake Shack's entire company is worth ~$3B. ${name}'s career earnings could buy the whole chain ${n} time${n > 1 ? 's' : ''} over.` : `Shake Shack is worth ~$3B on the stock market. ${name}'s career earnings could buy a ${pct}% ownership stake — a real seat at the table.`, gradient: 'from-red-950 to-[#111]', accent: 'text-red-400' } } },
    { min: 1_500_000,   fn: () => { const cap = 15_000_000_000; const n = Math.floor(earnings / cap); const pct = ((earnings / cap) * 100).toFixed(3); return { emoji: '🏀', headline: n >= 1 ? `${n}× DraftKings` : `${pct}% of DraftKings`,                body: n >= 1 ? `DraftKings — the biggest sports betting platform — is worth ~$15B. ${name} could buy it outright ${n} time${n > 1 ? 's' : ''}.` : `DraftKings, the sports betting giant, is valued at ~$15B. ${name}'s career earnings would buy a ${pct}% stake — enough to have a real say in the boardroom.`, gradient: 'from-indigo-950 to-[#111]', accent: 'text-indigo-400' } } },
    { min: 13_000_000,  fn: () => { const cap = 130_000_000_000; const n = Math.floor(earnings / cap); const pct = ((earnings / cap) * 100).toFixed(4); return { emoji: '👟', headline: n >= 1 ? `${n}× Nike` : `${pct}% of Nike`,                          body: n >= 1 ? `Nike's entire company is worth ~$130B. ${name}'s career earnings could buy the whole brand ${n} time${n > 1 ? 's' : ''}.` : `Nike is worth ~$130B on the stock market. ${name}'s career earnings would buy a ${pct}% ownership stake in the world's biggest sneaker brand.`, gradient: 'from-gray-900 to-[#111]', accent: 'text-gray-300' } } },
    { min: 350_000_000, fn: () => { const cap = 3_500_000_000_000; const n = Math.floor(earnings / cap); const pct = ((earnings / cap) * 100).toFixed(5); return { emoji: '🍎', headline: n >= 1 ? `${n}× Apple` : `${pct}% of Apple`,                     body: n >= 1 ? `Apple is worth ~$3.5 trillion. ${name}'s career earnings could buy the whole company ${n} time${n > 1 ? 's' : ''}.` : `Apple is worth ~$3.5 trillion. ${name}'s career earnings would buy a ${pct}% stake — tiny, but still worth more than most people will ever see.`, gradient: 'from-gray-900 to-[#111]', accent: 'text-gray-300' } } },
    // ── Landmarks & construction ──────────────────────────────────────────────
    { min: 80_000_000,   fn: () => { const cost = 800_000_000;  const n = Math.floor(earnings / cost); const pct = ((earnings / cost) * 100).toFixed(1); return { emoji: '🌉', headline: n >= 1 ? `${n} Golden Gate Bridge${n > 1 ? 's' : ''}` : `${pct}% of the Golden Gate Bridge`, body: n >= 1 ? `The Golden Gate Bridge cost ~$800M in today's dollars. ${name}'s earnings could fund ${n} of them from scratch.` : `The Golden Gate Bridge cost ~$800M. ${name}'s career earnings would cover ${pct}% of construction costs.`, gradient: 'from-orange-950 to-[#111]', accent: 'text-orange-400' } } },
    { min: 90_000_000,   fn: () => { const cost = 900_000_000;  const n = Math.floor(earnings / cost); const pct = ((earnings / cost) * 100).toFixed(1); return { emoji: '🏔️', headline: n >= 1 ? `${n} CN Tower${n > 1 ? 's' : ''}` : `${pct}% of the CN Tower`, body: n >= 1 ? `The CN Tower cost ~$900M in today's dollars. ${name}'s NBA earnings could build ${n} of Toronto's most iconic landmark${n > 1 ? 's' : ''}.` : `Toronto's CN Tower cost ~$900M to build. ${name}'s career would cover ${pct}% of that construction bill.`, gradient: 'from-sky-950 to-[#111]', accent: 'text-sky-400' } } },
    { min: 140_000_000,  fn: () => { const cost = 1_400_000_000; const n = Math.floor(earnings / cost); const pct = ((earnings / cost) * 100).toFixed(1); return { emoji: '🏟️', headline: n >= 1 ? `${n} Bills Stadium${n > 1 ? 's' : ''}` : `${pct}% of the new Bills Stadium`, body: n >= 1 ? `The new Buffalo Bills stadium is projected at ~$1.4B. ${name}'s career earnings could fund ${n} of them.` : `The new Buffalo Bills stadium costs ~$1.4B. ${name}'s earnings would cover ${pct}% of the build.`, gradient: 'from-blue-950 to-[#111]', accent: 'text-blue-400' } } },
    { min: 190_000_000,  fn: () => { const cost = 1_900_000_000; const n = Math.floor(earnings / cost); const pct = ((earnings / cost) * 100).toFixed(1); return { emoji: '⚡', headline: n >= 1 ? `${n} Allegiant Stadium${n > 1 ? 's' : ''}` : `${pct}% of Allegiant Stadium`, body: n >= 1 ? `The Las Vegas Raiders' Allegiant Stadium cost ~$1.9B. ${name}'s career earnings could build ${n} of them.` : `Allegiant Stadium cost ~$1.9B. ${name}'s earnings cover ${pct}% of that tab.`, gradient: 'from-gray-900 to-[#111]', accent: 'text-gray-300' } } },
    { min: 70_000_000,   fn: () => { const cost = 700_000_000;  const n = Math.floor(earnings / cost); const pct = ((earnings / cost) * 100).toFixed(1); return { emoji: '🏙️', headline: n >= 1 ? `${n} Empire State Building${n > 1 ? 's' : ''}` : `${pct}% of the Empire State Building`, body: n >= 1 ? `The Empire State Building cost ~$700M in today's dollars. ${name}'s earnings could have raised ${n} of them above the Manhattan skyline.` : `The Empire State Building cost ~$700M in today's dollars. ${name}'s career covers ${pct}% of that iconic build.`, gradient: 'from-zinc-900 to-[#111]', accent: 'text-zinc-300' } } },
    { min: 100_000_000,  fn: () => { const cost = 1_000_000_000; const n = Math.floor(earnings / cost); const pct = ((earnings / cost) * 100).toFixed(1); return { emoji: '🎭', headline: n >= 1 ? `${n} Sydney Opera House${n > 1 ? 's' : ''}` : `${pct}% of the Sydney Opera House`, body: n >= 1 ? `The Sydney Opera House cost ~$1B in today's dollars. ${name}'s career earnings could build ${n} of Australia's most iconic building${n > 1 ? 's' : ''}.` : `The Sydney Opera House cost ~$1B in today's dollars. ${name}'s earnings cover ${pct}% of the construction.`, gradient: 'from-teal-950 to-[#111]', accent: 'text-teal-400' } } },
    { min: 150_000_000,  fn: () => { const cost = 1_500_000_000; const n = Math.floor(earnings / cost); const pct = ((earnings / cost) * 100).toFixed(1); return { emoji: '⚽', headline: n >= 1 ? `${n} Wembley Stadium${n > 1 ? 's' : ''}` : `${pct}% of Wembley Stadium`, body: n >= 1 ? `Wembley Stadium in London cost ~$1.5B to build. ${name}'s career earnings could fund ${n} of the world's most famous arenas.` : `Wembley Stadium cost ~$1.5B. ${name}'s career earnings would cover ${pct}% of that build.`, gradient: 'from-purple-950 to-[#111]', accent: 'text-purple-400' } } },
    { min: 390_000_000,  fn: () => { const cost = 3_900_000_000; const n = Math.floor(earnings / cost); const pct = ((earnings / cost) * 100).toFixed(1); return { emoji: '🗼', headline: n >= 1 ? `${n} One World Trade Center${n > 1 ? 's' : ''}` : `${pct}% of One World Trade Center`, body: n >= 1 ? `One World Trade Center cost ~$3.9B to construct. ${name}'s career earnings could have funded ${n} of them.` : `One World Trade Center cost ~$3.9B. ${name}'s career covers ${pct}% of that price tag.`, gradient: 'from-slate-900 to-[#111]', accent: 'text-slate-300' } } },
    { min: 50_000_000,   fn: () => { const cost = 500_000_000;  const n = Math.floor(earnings / cost); const pct = ((earnings / cost) * 100).toFixed(1); return { emoji: '🗼', headline: n >= 1 ? `${n} Eiffel Tower${n > 1 ? 's' : ''}` : `${pct}% of the Eiffel Tower`, body: n >= 1 ? `The Eiffel Tower cost ~$500M in today's dollars. ${name}'s NBA earnings could have built ${n} of Paris's most iconic structure${n > 1 ? 's' : ''}.` : `The Eiffel Tower cost ~$500M in today's dollars. ${name}'s career covers ${pct}% of that.`, gradient: 'from-yellow-950 to-[#111]', accent: 'text-yellow-400' } } },
    { min: 550_000_000,  fn: () => { const cost = 5_500_000_000; const n = Math.floor(earnings / cost); const pct = ((earnings / cost) * 100).toFixed(1); return { emoji: '🏈', headline: n >= 1 ? `${n} SoFi Stadium${n > 1 ? 's' : ''}` : `${pct}% of SoFi Stadium`, body: n >= 1 ? `SoFi Stadium in LA cost ~$5.5B — the most expensive stadium ever built. ${name}'s career could fund ${n} of them.` : `SoFi Stadium cost ~$5.5B — the priciest stadium ever built. ${name}'s career covers ${pct}% of that.`, gradient: 'from-indigo-950 to-[#111]', accent: 'text-indigo-400' } } },
    { min: 150_000_000,  fn: () => { const cost = 1_500_000_000; const n = Math.floor(earnings / cost); const pct = ((earnings / cost) * 100).toFixed(1); return { emoji: '🏰', headline: n >= 1 ? `${n} Burj Khalifa${n > 1 ? 's' : ''}` : `${pct}% of the Burj Khalifa`, body: n >= 1 ? `The Burj Khalifa — the world's tallest building — cost ~$1.5B. ${name}'s earnings could stack ${n} of them into the Dubai sky.` : `The world's tallest building, the Burj Khalifa, cost ~$1.5B. ${name}'s career covers ${pct}% of that.`, gradient: 'from-yellow-950 to-[#111]', accent: 'text-yellow-400' } } },
    { min: 50_000_000,   fn: () => { const cost = 500_000_000;  const n = Math.floor(earnings / cost); const pct = ((earnings / cost) * 100).toFixed(1); return { emoji: '🏟️', headline: n >= 1 ? `${n} Colosseum${n > 1 ? 's' : ''}` : `${pct}% of the Roman Colosseum`, body: n >= 1 ? `Rebuilding the Roman Colosseum today would cost ~$500M. ${name}'s career earnings could fund ${n} of ancient Rome's greatest arenas.` : `Rebuilding the Roman Colosseum today would cost ~$500M. ${name}'s career covers ${pct}% of that.`, gradient: 'from-amber-950 to-[#111]', accent: 'text-amber-400' } } },
    { min: 50_000_000,   fn: () => { const cost = 500_000_000;  const n = Math.floor(earnings / cost); const pct = ((earnings / cost) * 100).toFixed(1); return { emoji: '🕌', headline: n >= 1 ? `${n} Taj Mahal${n > 1 ? 's' : ''}` : `${pct}% of the Taj Mahal`, body: n >= 1 ? `Building the Taj Mahal in today's dollars would cost ~$500M. ${name}'s career could fund ${n} of the world's most famous monuments to love.` : `The Taj Mahal would cost ~$500M to build today. ${name}'s career earnings cover ${pct}% of that.`, gradient: 'from-rose-950 to-[#111]', accent: 'text-rose-400' } } },
    { min: 120_000_000,  fn: () => { const cost = 1_200_000_000; const n = Math.floor(earnings / cost); const pct = ((earnings / cost) * 100).toFixed(1); return { emoji: '💧', headline: n >= 1 ? `${n} Hoover Dam${n > 1 ? 's' : ''}` : `${pct}% of the Hoover Dam`, body: n >= 1 ? `The Hoover Dam cost ~$1.2B in today's dollars. ${name}'s career earnings could fund ${n} of America's most iconic engineering feats.` : `The Hoover Dam cost ~$1.2B in today's dollars. ${name}'s career covers ${pct}% of that build.`, gradient: 'from-blue-950 to-[#111]', accent: 'text-blue-400' } } },
    { min: 50_000_000,   fn: () => { const cost = 500_000_000;  const n = Math.floor(earnings / cost); const pct = ((earnings / cost) * 100).toFixed(1); return { emoji: '🗽', headline: n >= 1 ? `${n} Statue of Liberty${n > 1 ? 's' : ''}` : `${pct}% of the Statue of Liberty`, body: n >= 1 ? `The Statue of Liberty would cost ~$500M to build today. ${name}'s career could fund ${n} of America's most iconic symbol.` : `The Statue of Liberty would cost ~$500M to build today. ${name}'s career covers ${pct}% of that.`, gradient: 'from-green-950 to-[#111]', accent: 'text-green-400' } } },
    { min: 500_000_000,  fn: () => { const cost = 5_000_000_000; const n = Math.floor(earnings / cost); const pct = ((earnings / cost) * 100).toFixed(1); return { emoji: '🍎', headline: n >= 1 ? `${n} Apple Park${n > 1 ? 's' : ''}` : `${pct}% of Apple Park`, body: n >= 1 ? `Apple's futuristic headquarters cost ~$5B to build. ${name}'s career earnings could fund ${n} of those spaceship campuses.` : `Apple's spaceship campus cost ~$5B to build. ${name}'s career covers ${pct}% of that.`, gradient: 'from-gray-900 to-[#111]', accent: 'text-gray-300' } } },
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
                            className="flex-1 bg-gradient-to-r from-orange-500 to-orange-400 hover:from-orange-400 hover:to-orange-300 text-white font-black py-2.5 rounded-xl transition-all text-sm tracking-wide shadow-md shadow-orange-900/50"
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
