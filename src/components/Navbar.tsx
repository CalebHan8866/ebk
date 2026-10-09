'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const router = useRouter()

  async function handleLogout() {
    await logout()
    router.push('/')
    router.refresh()
  }

  return (
    <nav className="bg-[#111827] border-b border-orange-500/20">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl">🏀</span>
          <span className="text-lg font-black text-orange-500 tracking-widest">EBK</span>
          <span className="text-xs text-gray-500 hidden sm:block">Elite Ball Knowledge</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/lobby" className="text-gray-300 hover:text-orange-400 text-sm font-semibold transition-colors">Play</Link>
          {user ? (
            <>
              <Link href="/profile" className="text-gray-300 hover:text-orange-400 text-sm font-semibold">
                {user.username}
                <span className="text-gray-500 text-xs ml-1.5">{user.wins}-{user.losses}-{user.draws}</span>
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
