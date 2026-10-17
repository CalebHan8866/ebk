'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { resetSocket } from '@/lib/socket'

export default function Navbar() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  async function handleLogout() {
    await logout()
    resetSocket()
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
      style={{ background: 'rgba(8,8,8,0.88)', backdropFilter: 'blur(20px)' }}>
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-6">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
          <span className="font-display text-2xl text-orange-500 leading-none group-hover:text-orange-400 transition-colors">
            EBK
          </span>
          <span className="hidden md:block text-[10px] font-bold tracking-[0.35em] text-gray-600 uppercase">
            Elite Ball Knowledge
          </span>
        </Link>

        {/* Center nav links */}
        <div className="flex items-center gap-6 flex-1">
          {navLink('/lobby', 'Play')}
          {navLink('/auction', 'War Room')}
          <span className="hidden sm:block">{navLink('/leaderboard', 'Leaderboard')}</span>
        </div>

        {/* Right: auth section */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <>
              {/* Profile chip */}
              <Link href="/profile" className="flex items-center gap-2 group">
                <div className={`w-8 h-8 ${avatarColor} rounded-full flex items-center justify-center font-black text-white text-xs shrink-0`}>
                  {user.username.slice(0, 2).toUpperCase()}
                </div>
                <div className="hidden sm:block">
                  <div className="text-sm font-bold text-gray-300 group-hover:text-white transition-colors leading-tight">
                    {user.username}
                  </div>
                  <div className="text-[10px] text-gray-600 leading-tight tabular-nums">
                    {user.wins}–{user.losses}
                  </div>
                </div>
              </Link>
              <button onClick={handleLogout}
                className="text-xs font-semibold text-gray-600 hover:text-gray-300 transition-colors px-2 py-1 rounded hover:bg-white/5">
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link href="/login"
                className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">
                Login
              </Link>
              <Link href="/register"
                className="text-xs font-black tracking-wide bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-lg transition-all shadow-sm shadow-orange-600/20">
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
