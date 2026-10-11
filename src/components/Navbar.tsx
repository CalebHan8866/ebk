'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { BADGES } from '@/lib/accessories'

export default function Navbar() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [equippedBadgeId, setEquippedBadgeId] = useState<string>('')

  useEffect(() => {
    if (!user) { setEquippedBadgeId(''); return }
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.user?.equippedBadge) setEquippedBadgeId(d.user.equippedBadge) })
  }, [user])

  async function handleLogout() {
    await logout()
    router.push('/')
    router.refresh()
  }

  const equippedBadge = equippedBadgeId ? BADGES.find(b => b.id === equippedBadgeId) : null

  return (
    <nav className="bg-[#111827] border-b border-orange-500/20">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-display text-2xl text-orange-500 leading-none">EBK</span>
          <span className="text-xs text-gray-600 hidden sm:block tracking-widest uppercase">Elite Ball Knowledge</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/lobby" className="text-gray-300 hover:text-orange-400 text-sm font-semibold transition-colors">Play</Link>
          {user ? (
            <>
              <Link href="/profile" className="flex items-center gap-2 text-gray-300 hover:text-orange-400 text-sm font-semibold">
                <span>{user.username}</span>
                {equippedBadge && (
                  <span className={[
                    'inline-block text-[10px] font-black tracking-wider px-1.5 py-0.5 rounded border',
                    equippedBadge.bgClass,
                    equippedBadge.textClass,
                    equippedBadge.borderClass,
                  ].join(' ')}>
                    {equippedBadge.label}
                  </span>
                )}
                <span className="text-gray-500 text-xs">{user.wins}-{user.losses}-{user.draws}</span>
              </Link>
              <button onClick={handleLogout} className="text-xs bg-orange-600 hover:bg-orange-700 px-3 py-1.5 rounded font-semibold transition-colors">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-gray-300 hover:text-orange-400 text-sm font-semibold">Login</Link>
              <Link href="/register" className="text-xs bg-orange-600 hover:bg-orange-700 px-3 py-1.5 rounded font-semibold transition-colors">
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
