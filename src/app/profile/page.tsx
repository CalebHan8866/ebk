'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface UserProfile { id: string; username: string; email: string; wins: number; losses: number; draws: number; createdAt: string }

export default function ProfilePage() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => { if (!r.ok) { router.push('/login'); return null } return r.json() })
      .then(d => { if (d?.user) setUser(d.user); else router.push('/login'); setLoading(false) })
  }, [router])

  if (loading) return <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin"></div></div>
  if (!user) return null

  const total = user.wins + user.losses + user.draws
  const winPct = total > 0 ? ((user.wins / total) * 100).toFixed(1) : '0.0'

  return (
    <div className="min-h-screen bg-[#0A0A0A] py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-[#111827] rounded-2xl p-8 mb-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-orange-600 rounded-full flex items-center justify-center text-2xl font-black">{user.username[0].toUpperCase()}</div>
            <div>
              <h1 className="text-2xl font-black text-white">{user.username}</h1>
              <p className="text-gray-400 text-sm">Member since {new Date(user.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
          <div className="bg-[#0A0A0A] rounded-xl p-6">
            <h2 className="text-gray-400 text-xs uppercase tracking-wide mb-4">All-Time Series Record</h2>
            <div className="flex items-center justify-center gap-8">
              <div className="text-center"><div className="text-4xl font-black text-green-400">{user.wins}</div><div className="text-gray-400 text-sm">W</div></div>
              <div className="text-3xl text-gray-700 font-bold">-</div>
              <div className="text-center"><div className="text-4xl font-black text-red-400">{user.losses}</div><div className="text-gray-400 text-sm">L</div></div>
              <div className="text-3xl text-gray-700 font-bold">-</div>
              <div className="text-center"><div className="text-4xl font-black text-yellow-400">{user.draws}</div><div className="text-gray-400 text-sm">D</div></div>
            </div>
            <div className="text-center mt-4">
              <span className="text-gray-400 text-sm">Win Rate: </span>
              <span className="text-orange-400 font-bold">{winPct}%</span>
              <span className="text-gray-600 text-sm ml-2">({total} series)</span>
            </div>
          </div>
        </div>
        <div className="text-center">
          <Link href="/lobby" className="bg-orange-600 hover:bg-orange-700 text-white font-black py-3 px-8 rounded-xl inline-block">Play Now</Link>
        </div>
      </div>
    </div>
  )
}
