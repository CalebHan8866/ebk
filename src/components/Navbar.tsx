'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { BADGES } from '@/lib/accessories'
import { resetSocket } from '@/lib/socket'

export default function Navbar() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  let equippedBadgeIds: string[] = []
  if (user?.equippedBadges) {
    try { equippedBadgeIds = JSON.parse(user.equippedBadges) } catch {}
  }

  async function handleLogout() {
    await logout()
    resetSocket()
    router.push('/')
    router.refresh()
  }

  const equippedBadgeObjects = equippedBadgeIds
    .map(id => BADGES.find(b => b.id === id))
    .filter(Boolean) as typeof BADGES

  const navLink = (href: string, label: string) => {
    const active = pathname === href || (href !== '/' && pathname?.startsWith(href))
    return (
      <Link href={href}
        className={[
          'text-sm font-semibold transition-colors',
          active ? 'text-orange-400' : 'text-gray-400 hover:text-white',
        ].join(' ')}>
        {label}
      </Link>
    )
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-white/[0.06]"
      style={{ background: 'rgba(8,8,8,0.85)', backdropFilter: 'blur(20px)' }}>
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="font-display text-2xl text-orange-500 leading-none group-hover:text-orange-400 transition-colors">
            EBK
          </span>
          <span className="hidden sm:block text-[10px] font-bold tracking-[0.35em] text-gray-600 uppercase">
            Elite Ball Knowledge
          </span>
        </Link>

        {/* Nav links + auth */}
        <div className="flex items-center gap-5">
          {navLink('/lobby', 'Play')}
          {navLink('/auction', 'War Room')}
          {navLink('/leaderboard', 'Leaderboard')}

          {user ? (
            <>
              <Link href="/profile"
                className="flex items-center gap-2 group">
                <div className="text-right">
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="text-sm font-bold text-gray-300 group-hover:text-white transition-colors leading-none">
                      {user.username}
                    </span>
                    {equippedBadgeObjects.slice(0, 2).map(badge => (
                      <span key={badge.id}
                        className={`text-[9px] font-black px-1 py-0.5 rounded border leading-none ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}>
                        {badge.label}
                      </span>
                    ))}
                  </div>
                  <div className="text-[11px] text-gray-600 tabular-nums text-right mt-0.5 leading-none">
                    {user.wins}W {user.losses}L
                  </div>
                </div>
              </Link>
              <button onClick={handleLogout}
                className="text-xs font-bold text-gray-600 hover:text-gray-300 transition-colors">
                Out
              </button>
            </>
          ) : (
            <>
              <Link href="/login"
                className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">
                Login
              </Link>
              <Link href="/register"
                className="text-xs font-black tracking-wide bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-lg transition-all shadow-sm shadow-orange-600/20 hover:shadow-orange-500/30">
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
