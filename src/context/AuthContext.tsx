'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

interface AuthUser {
  id: string
  username: string
  email: string
  wins: number
  losses: number
  draws: number
  gamesPlayed: number
  winStreak: number
  maxWinStreak: number
  firstPickWins: number
  firstPickGames: number
  unlockedBadges: string
  unlockedEmotes: string
  unlockedMilestones: string
  equippedBadge: string
  equippedBadges: string
  equippedEmote: string
  createdAt: string
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  setUser: (user: AuthUser | null) => void
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  setUser: () => {},
  logout: async () => {},
  refreshUser: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/auth/me', { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setUser(data?.user || null)
        setLoading(false)
      })
      .catch(err => { if (err.name !== 'AbortError') setLoading(false) })
    return () => controller.abort()
  }, [])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    // Force a new socket connection so the server middleware re-reads the now-cleared
    // auth cookie. Without this the old socket retains the previous user's identity
    // for the duration of its connection.
    // Dynamic import ensures socket.io-client is never loaded during SSR/prerender.
    const { resetSocket } = await import('@/lib/socket')
    resetSocket()
  }

  async function refreshUser() {
    const res = await fetch('/api/auth/me').catch(() => null)
    if (!res) return                      // network error — leave state as-is
    if (!res.ok) { setUser(null); return } // 401/403/500 — session gone, clear it
    const data = await res.json().catch(() => null)
    setUser(data?.user ?? null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
