export interface NBATeam {
  abbr: string
  name: string
  city: string
}

export const CURRENT_TEAMS: NBATeam[] = [
  { abbr: 'ATL', name: 'Hawks',        city: 'Atlanta' },
  { abbr: 'BOS', name: 'Celtics',      city: 'Boston' },
  { abbr: 'BKN', name: 'Nets',         city: 'Brooklyn' },
  { abbr: 'CHA', name: 'Hornets',      city: 'Charlotte' },
  { abbr: 'CHI', name: 'Bulls',        city: 'Chicago' },
  { abbr: 'CLE', name: 'Cavaliers',    city: 'Cleveland' },
  { abbr: 'DAL', name: 'Mavericks',    city: 'Dallas' },
  { abbr: 'DEN', name: 'Nuggets',      city: 'Denver' },
  { abbr: 'DET', name: 'Pistons',      city: 'Detroit' },
  { abbr: 'GSW', name: 'Warriors',     city: 'Golden State' },
  { abbr: 'HOU', name: 'Rockets',      city: 'Houston' },
  { abbr: 'IND', name: 'Pacers',       city: 'Indiana' },
  { abbr: 'LAC', name: 'Clippers',     city: 'LA' },
  { abbr: 'LAL', name: 'Lakers',       city: 'LA' },
  { abbr: 'MEM', name: 'Grizzlies',    city: 'Memphis' },
  { abbr: 'MIA', name: 'Heat',         city: 'Miami' },
  { abbr: 'MIL', name: 'Bucks',        city: 'Milwaukee' },
  { abbr: 'MIN', name: 'Timberwolves', city: 'Minnesota' },
  { abbr: 'NOP', name: 'Pelicans',     city: 'New Orleans' },
  { abbr: 'NYK', name: 'Knicks',       city: 'New York' },
  { abbr: 'OKC', name: 'Thunder',      city: 'OKC' },
  { abbr: 'ORL', name: 'Magic',        city: 'Orlando' },
  { abbr: 'PHI', name: '76ers',        city: 'Philadelphia' },
  { abbr: 'PHX', name: 'Suns',         city: 'Phoenix' },
  { abbr: 'POR', name: 'Trail Blazers',city: 'Portland' },
  { abbr: 'SAC', name: 'Kings',        city: 'Sacramento' },
  { abbr: 'SAS', name: 'Spurs',        city: 'San Antonio' },
  { abbr: 'TOR', name: 'Raptors',      city: 'Toronto' },
  { abbr: 'UTA', name: 'Jazz',         city: 'Utah' },
  { abbr: 'WAS', name: 'Wizards',      city: 'Washington' },
]

// All historical BBRef abbreviations → current franchise abbreviation
export const TEAM_LINEAGE: Record<string, string> = {
  // Atlanta Hawks (Tri-Cities → Milwaukee → St. Louis → Atlanta)
  'ATL': 'ATL', 'STL': 'ATL', 'MHK': 'ATL', 'TCB': 'ATL', 'TRI': 'ATL',

  // Boston Celtics
  'BOS': 'BOS',

  // Brooklyn Nets (New York/New Jersey → Brooklyn)
  'BKN': 'BKN', 'NJN': 'BKN', 'NJA': 'BKN', 'NYN': 'BKN',

  // Charlotte Hornets (original Hornets → NOH → Bobcats → Hornets)
  'CHA': 'CHA', 'CHH': 'CHA', 'CHB': 'CHA',

  // Chicago Bulls
  'CHI': 'CHI',

  // Cleveland Cavaliers
  'CLE': 'CLE',

  // Dallas Mavericks
  'DAL': 'DAL',

  // Denver Nuggets (ABA → NBA)
  'DEN': 'DEN', 'DNV': 'DEN',

  // Detroit Pistons (Fort Wayne → Detroit)
  'DET': 'DET', 'FTW': 'DET',

  // Golden State Warriors (Philadelphia → San Francisco → Golden State)
  'GSW': 'GSW', 'SFW': 'GSW', 'PHW': 'GSW',

  // Houston Rockets (San Diego → Houston)
  'HOU': 'HOU', 'SDR': 'HOU',

  // Indiana Pacers
  'IND': 'IND',

  // LA Clippers (Buffalo Braves → San Diego → LA)
  'LAC': 'LAC', 'SDC': 'LAC', 'BUF': 'LAC',

  // LA Lakers (Minneapolis → Los Angeles)
  'LAL': 'LAL', 'MNL': 'LAL',

  // Memphis Grizzlies (Vancouver → Memphis)
  'MEM': 'MEM', 'VAN': 'MEM',

  // Miami Heat
  'MIA': 'MIA',

  // Milwaukee Bucks
  'MIL': 'MIL',

  // Minnesota Timberwolves
  'MIN': 'MIN',

  // New Orleans Pelicans (Jazz → Hornets → NOH/NOK → Pelicans)
  'NOP': 'NOP', 'NOH': 'NOP', 'NOK': 'NOP',

  // New York Knicks
  'NYK': 'NYK',

  // Oklahoma City Thunder (Seattle SuperSonics → OKC)
  'OKC': 'OKC', 'SEA': 'OKC',

  // Orlando Magic
  'ORL': 'ORL',

  // Philadelphia 76ers (Syracuse Nationals → Philadelphia)
  'PHI': 'PHI', 'SYR': 'PHI',

  // Phoenix Suns
  'PHX': 'PHX', 'PHO': 'PHX',

  // Portland Trail Blazers
  'POR': 'POR',

  // Sacramento Kings (Rochester → Cincinnati → KC → Sacramento)
  'SAC': 'SAC', 'KCK': 'SAC', 'KCO': 'SAC', 'CIN': 'SAC', 'ROC': 'SAC',

  // San Antonio Spurs (ABA → NBA)
  'SAS': 'SAS',

  // Toronto Raptors
  'TOR': 'TOR',

  // Utah Jazz (New Orleans Jazz → Utah)
  'UTA': 'UTA', 'NOJ': 'UTA',

  // Washington Wizards (Baltimore → Capital/Washington Bullets → Wizards)
  'WAS': 'WAS', 'WSB': 'WAS', 'CAP': 'WAS', 'BAL': 'WAS', 'BLB': 'WAS',
  'CHZ': 'WAS', // Chicago Zephyrs → became Baltimore/Washington
}

export function getCurrentTeam(historicalAbbr: string): string {
  return TEAM_LINEAGE[historicalAbbr] || historicalAbbr
}

export function getTeamName(abbr: string): string {
  const t = CURRENT_TEAMS.find(t => t.abbr === abbr)
  return t ? `${t.city} ${t.name}` : abbr
}
