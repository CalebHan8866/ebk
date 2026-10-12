// Twemoji CDN — full-color illustrated SVGs of each object
const tw = (cp: string) => `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/${cp}.svg`

export interface Badge {
  id: string
  name: string
  label: string
  icon: string   // Twemoji SVG URL
  description: string
  bgClass: string
  textClass: string
  borderClass: string
  winsRequired?: number
  gamesRequired?: number
  streakRequired?: number
  jamesonCurryRequired?: number
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
    icon: tw('1fa91'),   // 🪑 bench / chair
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
    icon: tw('1f504'),   // 🔄 arrows
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
    icon: tw('2b50'),    // ⭐ star
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
    icon: tw('1f31f'),   // 🌟 glowing star
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
    icon: tw('1f3c6'),   // 🏆 trophy
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
    icon: tw('1f410'),   // 🐐 goat
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
    icon: tw('1f525'),   // 🔥 fire
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
    icon: tw('1f48e'),   // 💎 gem / diamond
    description: 'Win 10 in a row',
    bgClass: 'bg-white/10',
    textClass: 'text-white',
    borderClass: 'border-white/30',
    streakRequired: 10,
  },
  {
    id: 'jc_25',
    name: 'JC Curious',
    label: 'JC',
    icon: tw('1f3c0'),   // 🏀 basketball
    description: 'Draft Jameson Curry in 25 games',
    bgClass: 'bg-amber-900/50',
    textClass: 'text-amber-400',
    borderClass: 'border-amber-700',
    jamesonCurryRequired: 25,
  },
  {
    id: 'jc_50',
    name: 'JC Fan',
    label: 'JC ★',
    icon: tw('1f3af'),   // 🎯 bullseye
    description: 'Draft Jameson Curry in 50 games',
    bgClass: 'bg-amber-800/50',
    textClass: 'text-amber-300',
    borderClass: 'border-amber-500',
    jamesonCurryRequired: 50,
  },
  {
    id: 'jc_100',
    name: 'JC Loyalist',
    label: 'JC ★★',
    icon: tw('1f451'),   // 👑 crown
    description: 'Draft Jameson Curry in 100 games',
    bgClass: 'bg-yellow-900/50',
    textClass: 'text-yellow-300',
    borderClass: 'border-yellow-500',
    jamesonCurryRequired: 100,
  },
  {
    id: 'jc_500',
    name: 'JAMESON',
    label: 'JAMESON',
    icon: tw('1f30a'),   // 🌊 wave
    description: 'Draft Jameson Curry in 500 games',
    bgClass: 'bg-gradient-to-br from-amber-900/60 to-orange-900/60',
    textClass: 'text-amber-200',
    borderClass: 'border-amber-400',
    jamesonCurryRequired: 500,
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
