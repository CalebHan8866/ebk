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
          'text-sm font-semibold transition-colors whitespace-nowrap',
          active ? 'text-orange-400' : 'text-gray-400 hover:text-white',
        ].join(' ')}>
        {label}
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

        {/* Center nav links */}
        <div className="flex items-center gap-6 flex-1">
          {navLink('/lobby', 'Play')}
          {navLink('/leaderboard', 'Leaderboard')}
          <span className="hidden md:block">{navLink('/fun-facts', 'Fun Facts')}</span>
        </div>

        {/* Right: auth section */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <>
              {/* Profile chip */}
              <Link href="/profile"
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:border-orange-700/40 hover:bg-orange-950/20 transition-all group">
                <div className={`w-7 h-7 ${avatarColor} rounded-full flex items-center justify-center font-black text-white text-[10px] shrink-0`}>
                  {user.username.slice(0, 2).toUpperCase()}
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
              <Link href="/register" className="btn-primary py-2 px-5 text-xs">
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
