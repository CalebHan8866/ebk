/**
 * Shared game types used by both the server (server.ts) and client pages.
 * Import from here to avoid type drift between client and server.
 */

export type TeamMode = 'starter5' | 'bench8' | 'full12'
export type SeriesLength = 1 | 3 | 5
export type Difficulty = 'casual' | 'ebk'
export type AuctionStatus = 'waiting' | 'bidding' | 'steal-window' | 'trading' | 'complete'

export interface GameResult {
  game: number
  statMode: string
  hostTotal: number
  guestTotal: number
  winner: 'host' | 'guest' | 'draw'
}

/** Shape of a game room as sent from the server via socket events */
export interface Room {
  code: string
  hostSocketId: string
  guestSocketId: string | null
  hostUserId?: string | null
  guestUserId?: string | null
  hostName: string
  guestName: string | null
  teamMode: TeamMode
  series: SeriesLength
  difficulty: Difficulty
  source: 'online' | 'friends'
  status: 'waiting' | 'drafting' | 'result' | 'complete'
  draftOrder: ('host' | 'guest')[]
  currentPickIndex: number
  hostPicks: number[]
  guestPicks: number[]
  hostPickSlots: string[]
  guestPickSlots: string[]
  currentGame: number
  hostSeriesScore: number
  guestSeriesScore: number
  gameResults: GameResult[]
  currentSpunTeam: string | null
}

export interface Player {
  id: number
  firstName: string
  lastName: string
  team: string
  position: string
  positions: string
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

export const TEAM_SIZES: Record<TeamMode, number> = {
  starter5: 5,
  bench8: 8,
  full12: 12,
}

export const STAT_CYCLE = ['games_played', 'ppg', 'rpg', 'apg'] as const

export function getRequiredPositions(teamMode: TeamMode): string[] {
  const starters = ['PG', 'SG', 'SF', 'PF', 'C']
  const bench = Array(TEAM_SIZES[teamMode] - 5).fill('BENCH')
  return [...starters, ...bench]
}

export function getStatModeForGame(gameNum: number): string {
  return STAT_CYCLE[(gameNum - 1) % STAT_CYCLE.length]
}
