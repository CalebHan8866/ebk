export interface Badge {
  id: string
  name: string
  label: string
  description: string
  bgClass: string
  textClass: string
  borderClass: string
  winsRequired?: number
  gamesRequired?: number
  streakRequired?: number
}

export interface Emote {
  id: string
  text: string
  label: string
  winsRequired: number
}

export interface Milestone {
  id: string
  name: string
  description: string
  winsRequired?: number
  gamesRequired?: number
  streakRequired?: number
}

export const BADGES: Badge[] = [
  {
    id: 'bench',
    name: 'Bench Warmer',
    label: 'BENCH',
    description: 'Play your first game',
    bgClass: 'bg-gray-800',
    textClass: 'text-gray-400',
    borderClass: 'border-gray-600',
    gamesRequired: 1,
  },
  {
    id: 'rotation',
    name: 'Rotation',
    label: 'ROT',
    description: 'Win 25 games',
    bgClass: 'bg-blue-900/50',
    textClass: 'text-blue-400',
    borderClass: 'border-blue-600',
    winsRequired: 25,
  },
  {
    id: 'starter',
    name: 'Starter',
    label: 'START',
    description: 'Win 75 games',
    bgClass: 'bg-green-900/50',
    textClass: 'text-green-400',
    borderClass: 'border-green-600',
    winsRequired: 75,
  },
  {
    id: 'allstar',
    name: 'All-Star',
    label: 'ALL-STAR',
    description: 'Win 200 games',
    bgClass: 'bg-yellow-900/50',
    textClass: 'text-yellow-400',
    borderClass: 'border-yellow-600',
    winsRequired: 200,
  },
  {
    id: 'mvp',
    name: 'MVP',
    label: 'MVP',
    description: 'Win 500 games',
    bgClass: 'bg-orange-900/50',
    textClass: 'text-orange-400',
    borderClass: 'border-orange-500',
    winsRequired: 500,
  },
  {
    id: 'goat',
    name: 'GOAT',
    label: 'GOAT',
    description: 'Win 1,000 games',
    bgClass: 'bg-purple-900/50',
    textClass: 'text-purple-400',
    borderClass: 'border-purple-500',
    winsRequired: 1000,
  },
  {
    id: 'hot',
    name: 'Hot Streak',
    label: 'HOT',
    description: 'Win 5 in a row',
    bgClass: 'bg-red-900/50',
    textClass: 'text-red-400',
    borderClass: 'border-red-600',
    streakRequired: 5,
  },
  {
    id: 'locked_in',
    name: 'Locked In',
    label: '10x',
    description: 'Win 10 in a row',
    bgClass: 'bg-white/10',
    textClass: 'text-white',
    borderClass: 'border-white/30',
    streakRequired: 10,
  },
]

export const EMOTES: Emote[] = [
  { id: 'gg', text: 'GG', label: 'GG', winsRequired: 0 },
  { id: 'lets_go', text: "Let's Go", label: 'LFG', winsRequired: 25 },
  { id: 'respect', text: 'Respect', label: 'RGG', winsRequired: 75 },
  { id: 'easy', text: 'Too Easy', label: 'EZ', winsRequired: 150 },
  { id: 'buckets', text: 'Buckets', label: 'BKT', winsRequired: 300 },
  { id: 'goat_talk', text: 'GOAT Talk', label: 'GOAT', winsRequired: 600 },
]

export const MILESTONES: Milestone[] = [
  { id: 'first_game', name: 'First Game', description: 'Play your first online game', gamesRequired: 1 },
  { id: 'first_win', name: 'First W', description: 'Win your first game', winsRequired: 1 },
  { id: 'wins_10', name: '50 Wins', description: 'Rack up 50 wins', winsRequired: 50 },
  { id: 'wins_25', name: '150 Wins', description: 'Hit 150 wins', winsRequired: 150 },
  { id: 'wins_50', name: '300 Wins', description: '300 wins — elite', winsRequired: 300 },
  { id: 'wins_100', name: '500 Wins', description: 'Half a thousand Ls handed out', winsRequired: 500 },
  { id: 'streak_3', name: '3-Streak', description: 'Win 3 in a row', streakRequired: 3 },
  { id: 'streak_5', name: '5-Streak', description: 'Win 5 in a row', streakRequired: 5 },
  { id: 'streak_10', name: '10-Streak', description: 'Win 10 in a row', streakRequired: 10 },
  { id: 'games_50', name: '200 Games', description: 'Play 200 online games', gamesRequired: 200 },
  { id: 'games_100', name: '500 Games', description: 'Play 500 online games', gamesRequired: 500 },
]
