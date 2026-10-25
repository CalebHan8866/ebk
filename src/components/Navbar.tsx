'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  async function handleLogout() {
    // logout() in AuthContext already calls resetSocket() internally
    await logout()
    router.push('/')
    router.refresh()
  }

  const navLink = (href: string, label: string) => {
    const active = pathname === href || (href !== '/' && pathname?.startsWith(href))
    return (
      <Link href={href}
        className={[
          'text-sm font-bold transition-all whitespace-nowrap relative py-1',
          active
            ? 'text-orange-400'
            : 'text-white/50 hover:text-white',
        ].join(' ')}>
        {label}
        {active && (
          <span className="absolute -bottom-[1px] left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-orange-500 to-transparent rounded-full" />
        )}
      </Link>
    )
  }

  // Deterministic avatar color from username
  const avatarColor = user
    ? ['bg-orange-600', 'bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 'bg-rose-600'][
        user.username.charCodeAt(0) % 5
      ]
    : 'bg-gray-700'

  return (
    <>
      {/* ── TOP NAV ────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06]"
        style={{ background: 'rgba(10,10,15,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-6">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group shrink-0">
            <span className="font-display text-3xl text-orange-500 leading-none group-hover:text-orange-400 transition-colors"
              style={{ textShadow: '0 0 20px rgba(249,115,22,0.35)' }}>
              EBK
            </span>
            <span className="hidden md:block text-label text-gray-500 group-hover:text-gray-300 transition-colors">
              Elite Ball Knowledge
            </span>
          </Link>

          {/* Center nav links — hidden on mobile, shown sm+ */}
          <div className="hidden sm:flex items-center gap-6 flex-1">
            {navLink('/lobby', 'Play')}
            {navLink('/leaderboard', 'Leaderboard')}
            {navLink('/fun-facts', 'Fun Facts')}
            {navLink('/salary', 'Salary')}
          </div>

          {/* Right: auth section */}
          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <>
                {/* Profile chip */}
                <Link href="/profile"
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:border-orange-700/40 hover:bg-orange-950/20 transition-all group">
                  <div className="relative shrink-0">
                    <div className={`w-7 h-7 ${avatarColor} rounded-full flex items-center justify-center font-black text-white text-[10px]`}>
                      {user.username.slice(0, 2).toUpperCase()}
                    </div>
                    {user.winStreak >= 3 && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-orange-500 rounded-full border border-[#0a0a0f] flex items-center justify-center text-[7px] font-black text-white leading-none">
                        {user.winStreak}
                      </span>
                    )}
                  </div>
                  <div className="hidden sm:block">
                    <div className="text-xs font-black text-gray-200 group-hover:text-white transition-colors leading-tight tracking-wide">
                      {user.username}
                    </div>
                    <div className="text-label tabular-nums" style={{ fontSize: '9px' }}>
                      {user.wins}W–{user.losses}L
                    </div>
                  </div>
                </Link>
                <button onClick={handleLogout}
                  className="text-xs font-bold text-white/40 hover:text-white/80 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] min-h-[32px]">
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link href="/login"
                  className="text-sm font-bold text-gray-400 hover:text-white transition-colors tracking-wide">
                  Sign In
                </Link>
                <Link href="/register" className="btn-primary py-1.5 px-3 sm:py-2 sm:px-5 text-xs">
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── MOBILE BOTTOM NAV ─────────────────────────────────────── */}
      {/* Visible only below sm breakpoint (640 px) */}
      <BottomNav pathname={pathname} loggedIn={!!user} />
    </>
  )
}

/* ── Bottom nav sub-component ──────────────────────────────────────────── */
function BottomNav({ pathname, loggedIn }: { pathname: string | null; loggedIn: boolean }) {
  // When logged in, swap "Home" for "Profile" so auth-protected pages are reachable on mobile.
  // The EBK wordmark in the top bar is always a home link so we don't lose that entry point.
  const items: { href: string; label: string; icon: React.ReactNode }[] = [
    loggedIn
      ? {
          href: '/profile',
          label: 'Profile',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <circle cx="12" cy="8" r="4"/>
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
          ),
        }
      : {
          href: '/',
          label: 'Home',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M3 9.75L12 3l9 6.75V21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.75z"/>
              <path d="M9 22V12h6v10"/>
            </svg>
          ),
        },
    {
      href: '/lobby',
      label: 'Play',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      ),
    },
    {
      href: '/leaderboard',
      label: 'Ranks',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <rect x="18" y="3" width="4" height="18" rx="1"/>
          <rect x="10" y="8" width="4" height="13" rx="1"/>
          <rect x="2" y="13" width="4" height="8" rx="1"/>
        </svg>
      ),
    },
    {
      href: '/fun-facts',
      label: 'Fun Facts',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4m0-4h.01"/>
        </svg>
      ),
    },
    {
      href: '/salary',
      label: 'Salary',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v2m0 8v2M9.5 9.5a2.5 2.5 0 0 1 5 0c0 2.5-5 2.5-5 5a2.5 2.5 0 0 0 5 0"/>
        </svg>
      ),
    },
  ]

  return (
    <nav className="bottom-nav sm:hidden fixed bottom-0 inset-x-0 z-50"
      style={{
        background: 'rgba(10,10,15,0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.5)',
      }}>
      {/* Safe-area padding for notched phones — min-h so the bar expands on notched iPhones */}
      <div className="flex items-center justify-around min-h-14 pb-[env(safe-area-inset-bottom,0px)]">
        {items.map(({ href, label, icon }) => {
          const active = pathname === href || (href !== '/' && href !== '/profile' && pathname?.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              className={[
                'bottom-nav-item relative flex flex-col items-center justify-center flex-1 py-2 gap-1 transition-all',
                active ? 'text-orange-400' : 'text-white/45 hover:text-white/70',
              ].join(' ')}>
              {/* Active indicator bar at top edge */}
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-orange-500" />
              )}
              <span className={['transition-transform', active ? 'scale-110' : ''].join(' ')}>
                {icon}
              </span>
              <span className={`text-[10px] font-bold tracking-wide leading-none ${active ? 'text-orange-400' : 'text-white/40'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
