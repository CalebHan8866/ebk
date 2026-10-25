/**
 * Shared utility functions used across multiple pages.
 */

// Minimal Player shape required by the earnings utilities.
// Both salary/page.tsx and fun-facts/FunFactsClient.tsx use an identical
// superset of this interface.
export interface EarningsPlayer {
  yearFrom: number
  yearTo: number
  careerPPG: number
  careerEarnings: number
}

/**
 * Estimates career earnings for players who pre-date reliable salary data.
 * Formula: era-based average annual salary × star-power multiplier × career length.
 */
export function estimateCareerEarnings(p: EarningsPlayer): number {
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

/**
 * Compact currency formatter: $1.2B / $34.5M / $123K / $999.
 * Handles negative values correctly (e.g. surplus calculations).
 * The salary page never produces negatives but fun-facts surplus math can,
 * so this version is the superset of both original local copies.
 */
export function fmt(n: number): string {
  if (!isFinite(n) || isNaN(n)) return '$—'
  if (n < 0) return `-${fmt(-n)}`
  if (n >= 1_000_000_000_000) return `$${(n / 1_000_000_000_000).toFixed(2)}T`
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `$${Math.round(n / 1_000)}K`
  return `$${Math.round(n)}`
}
