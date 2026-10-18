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
                  className="text-label hover:text-gray-300 transition-colors px-2 py-1 rounded-lg hover:bg-white/[0.04]">
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
      <BottomNav pathname={pathname} />
    </>
  )
}

/* ── Bottom nav sub-component ──────────────────────────────────────────── */
function BottomNav({ pathname }: { pathname: string }) {
  const items: { href: string; label: string; icon: React.ReactNode }[] = [
    {
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
      label: 'Leaderboard',
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
      {/* Safe-area padding for notched phones */}
      <div className="flex items-center justify-around h-14 pb-safe"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {items.map(({ href, label, icon }) => {
          const active = pathname === href || (href !== '/' && pathname?.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              className={[
                'bottom-nav-item flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-all',
                active ? 'text-orange-400' : 'text-white/35 hover:text-white/70',
              ].join(' ')}>
              <span className={['transition-transform', active ? 'scale-105' : ''].join(' ')}>
                {icon}
              </span>
              {/* Active indicator dot */}
              {active && (
                <span className="w-1 h-1 rounded-full bg-orange-500" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
