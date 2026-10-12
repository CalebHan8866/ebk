/**
 * Profanity filter for usernames.
 * Handles direct matches + common leet-speak substitutions + underscore separators.
 *
 * Strategy: for each bad word, build a regex where each letter is replaced by a
 * character class that includes common leet substitutions, with optional underscores
 * between characters (e.g. f_u_c_k). Test the lowercased username against all patterns.
 */

// Leet substitutions per letter (used in bad-word patterns)
const L: Record<string, string> = {
  a: '[a4@]',
  b: '[b8]',
  c: '[ck(]',
  e: '[e3]',
  g: '[g9]',
  i: '[i1!|]',
  l: '[l1|]',
  o: '[o0]',
  s: '[s5$]',
  t: '[t7+]',
  u: '[uv4]',   // 4 is commonly used for both 'a' and 'u' (f4ck = fuck)
  z: '[z2]',
}

function toPattern(word: string): RegExp {
  const src = word
    .toLowerCase()
    .split('')
    .map(c => L[c] ?? c)
    .join('_?')   // allow underscores between any two chars
  return new RegExp(src, 'i')
}

// Bad words — checked for false positives against common usernames.
// Short words (ass, cum) use compound forms to avoid matching "class", "document", etc.
const BAD_WORDS = [
  // F-word family
  'fuck', 'fuk', 'fck',
  // S-word
  'shit', 'sht',
  // C-word
  'cunt',
  // B-word
  'bitch', 'btch',
  // Slurs
  'nigger', 'nigga',
  'faggot',
  'chink',
  'kike',
  'spic',
  // Sexual
  'cock', 'cocks',
  'pussy',
  'penis',
  'vagina',
  'dickhead', 'dipshit',
  'asshole', 'ashole', 'arsehole',
  'cumshot', 'cumslut',
  'whore',
  'slut',
  'wank', 'wanker',
  // Violence/hate
  'rape', 'raper',
  'lynch',
  // Other
  'retard',
]

const PATTERNS: RegExp[] = BAD_WORDS.map(toPattern)

export function containsProfanity(username: string): boolean {
  const s = username.toLowerCase()
  return PATTERNS.some(p => p.test(s))
}
