/**
 * Unit tests for core EBK game logic.
 *
 * Focus areas:
 *  1. getRequiredPositions  — verifies correct slot arrays per team mode
 *  2. getStatModeForGame    — verifies the 4-game stat cycle
 *  3. calculateResult logic — pure extraction of the winner-determination math
 *  4. winPct calculation    — profile-page formula (wins / total * 100)
 *  5. Badge unlock thresholds — spot-check key values in BADGES / EMOTES / MILESTONES
 */

import { describe, it, expect } from 'vitest'
import { getRequiredPositions, getStatModeForGame, TEAM_SIZES, STAT_CYCLE } from '../src/types/game'
import { BADGES, EMOTES, MILESTONES } from '../src/lib/accessories'

// ─── 1. getRequiredPositions ─────────────────────────────────────────────────

describe('getRequiredPositions', () => {
  it('starter5 returns exactly 5 starter positions and no BENCH slots', () => {
    const slots = getRequiredPositions('starter5')
    expect(slots).toHaveLength(5)
    expect(slots).toEqual(['PG', 'SG', 'SF', 'PF', 'C'])
    expect(slots.filter(s => s === 'BENCH')).toHaveLength(0)
  })

  it('bench8 returns 5 starters + 3 BENCH slots', () => {
    const slots = getRequiredPositions('bench8')
    expect(slots).toHaveLength(8)
    expect(slots.slice(0, 5)).toEqual(['PG', 'SG', 'SF', 'PF', 'C'])
    expect(slots.filter(s => s === 'BENCH')).toHaveLength(3)
  })

  it('full12 returns 5 starters + 7 BENCH slots', () => {
    const slots = getRequiredPositions('full12')
    expect(slots).toHaveLength(12)
    expect(slots.slice(0, 5)).toEqual(['PG', 'SG', 'SF', 'PF', 'C'])
    expect(slots.filter(s => s === 'BENCH')).toHaveLength(7)
  })

  it('total length matches TEAM_SIZES for all modes', () => {
    for (const mode of ['starter5', 'bench8', 'full12'] as const) {
      expect(getRequiredPositions(mode)).toHaveLength(TEAM_SIZES[mode])
    }
  })
})

// ─── 2. getStatModeForGame (4-game cycle) ────────────────────────────────────

describe('getStatModeForGame', () => {
  it('game 1 → games_played', () => {
    expect(getStatModeForGame(1)).toBe('games_played')
  })

  it('game 2 → ppg', () => {
    expect(getStatModeForGame(2)).toBe('ppg')
  })

  it('game 3 → rpg', () => {
    expect(getStatModeForGame(3)).toBe('rpg')
  })

  it('game 4 → apg', () => {
    expect(getStatModeForGame(4)).toBe('apg')
  })

  it('game 5 wraps back to games_played (cycle restarts)', () => {
    expect(getStatModeForGame(5)).toBe('games_played')
  })

  it('cycle covers all 4 stat modes exactly once', () => {
    const seen = new Set([1, 2, 3, 4].map(n => getStatModeForGame(n)))
    expect(seen).toEqual(new Set(STAT_CYCLE))
  })
})

// ─── 3. calculateResult — pure winner-determination logic ───────────────────
//
// server.ts calculateResult() depends on the runtime `playerById` Map so we
// cannot import it directly.  Instead we test the identical ternary inline —
// this is the specific logic that was previously backwards (R4/R5 fix).

function determineWinner(hostTotal: number, guestTotal: number): 'host' | 'guest' | 'draw' {
  return hostTotal > guestTotal ? 'host' : guestTotal > hostTotal ? 'guest' : 'draw'
}

describe('determineWinner (calculateResult core logic)', () => {
  it('host wins when hostTotal > guestTotal', () => {
    expect(determineWinner(100, 80)).toBe('host')
  })

  it('guest wins when guestTotal > hostTotal', () => {
    expect(determineWinner(75, 90)).toBe('guest')
  })

  it('draw when totals are equal', () => {
    expect(determineWinner(50, 50)).toBe('draw')
  })

  it('host wins by 1 — boundary case', () => {
    expect(determineWinner(101, 100)).toBe('host')
  })

  it('guest wins by 0.1 — floating-point boundary', () => {
    expect(determineWinner(99.9, 100)).toBe('guest')
  })

  it('zero totals → draw', () => {
    expect(determineWinner(0, 0)).toBe('draw')
  })
})

// ─── 4. winPct calculation (profile page formula) ───────────────────────────

function winPct(wins: number, losses: number, draws: number): string {
  const total = wins + losses + draws
  return total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0'
}

describe('winPct', () => {
  it('returns 0.0 with no games played', () => {
    expect(winPct(0, 0, 0)).toBe('0.0')
  })

  it('100.0 when all wins', () => {
    expect(winPct(10, 0, 0)).toBe('100.0')
  })

  it('50.0 for equal wins and losses', () => {
    expect(winPct(5, 5, 0)).toBe('50.0')
  })

  it('draws count against win percentage', () => {
    // 5 wins out of 10 total (5w + 3l + 2d = 10) → 50%
    expect(winPct(5, 3, 2)).toBe('50.0')
  })

  it('rounds to one decimal place', () => {
    // 1/3 ≈ 33.333... → '33.3'
    expect(winPct(1, 2, 0)).toBe('33.3')
  })
})

// ─── 5. Badge / Emote / Milestone threshold spot-checks ─────────────────────

describe('badge unlock thresholds', () => {
  it('bench badge unlocks at 1 game played', () => {
    const bench = BADGES.find(b => b.id === 'bench')
    expect(bench?.gamesRequired).toBe(1)
  })

  it('rotation badge unlocks at 25 wins', () => {
    const rotation = BADGES.find(b => b.id === 'rotation')
    expect(rotation?.winsRequired).toBe(25)
  })

  it('starter badge unlocks at 75 wins', () => {
    const starter = BADGES.find(b => b.id === 'starter')
    expect(starter?.winsRequired).toBe(75)
  })

  it('goat badge unlocks at 1000 wins', () => {
    const goat = BADGES.find(b => b.id === 'goat')
    expect(goat?.winsRequired).toBe(1000)
  })

  it('GG emote is always unlocked (0 wins required)', () => {
    const gg = EMOTES.find(e => e.id === 'gg')
    expect(gg?.winsRequired).toBe(0)
  })

  it('lets_go emote requires 25 wins', () => {
    const letsGo = EMOTES.find(e => e.id === 'lets_go')
    expect(letsGo?.winsRequired).toBe(25)
  })

  it('first_win milestone requires 1 win', () => {
    const firstWin = MILESTONES.find(m => m.id === 'first_win')
    expect(firstWin?.winsRequired).toBe(1)
  })

  it('streak milestone requires 5 wins in a row', () => {
    const streak5 = MILESTONES.find(m => m.id === 'streak_5')
    expect(streak5?.streakRequired).toBe(5)
  })
})
