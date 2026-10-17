'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSocket } from '@/lib/socket'
import { useAuth } from '@/context/AuthContext'

type Phase = 'lobby' | 'waiting' | 'error'
type ActiveTab = 'create' | 'join'

interface ParticipantInfo {
  name: string
  socketId: string
}

export default function AuctionPage() {
  const router = useRouter()
  const { user, loading } = useAuth()

  const [phase, setPhase] = useState<Phase>('lobby')
  const [activeTab, setActiveTab] = useState<ActiveTab>('create')
  const [teamSize, setTeamSize] = useState<5 | 8 | 12>(8)
  const [maxPlayers, setMaxPlayers] = useState<2 | 3 | 4 | 5 | 6>(4)
  const [code, setCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [participants, setParticipants] = useState<ParticipantInfo[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [guestName, setGuestName] = useState('')
  const [isHost, setIsHost] = useState(false)
  const [copied, setCopied] = useState(false)

  const userName = user?.username || guestName

  const budgetMap: Record<number, number> = { 5: 125, 8: 175, 12: 250 }

  const setupSocket = useCallback(() => {
    const socket = getSocket()

    socket.on('auction:created', ({ code: c }: { code: string }) => {
      setCode(c)
      setIsHost(true)
      setPhase('waiting')
    })

    socket.on('auction:joined', ({ code: c }: { code: string }) => {
      setCode(c)
      setIsHost(false)
      setPhase('waiting')
    })

    socket.on('auction:state', (state: { status: string; participants: ParticipantInfo[] }) => {
      setParticipants(state.participants)
      if (state.status !== 'waiting') {
        // Navigate to game room
        const roomCode = code || (state as unknown as { code: string }).code
        if (roomCode) router.push(`/auction/${roomCode}`)
      }
    })

    socket.on('auction:error', ({ message }: { message: string }) => {
      setErrorMsg(message)
      setTimeout(() => setErrorMsg(''), 4000)
    })

    return () => {
      socket.off('auction:created')
      socket.off('auction:joined')
      socket.off('auction:state')
      socket.off('auction:error')
    }
  }, [code, router])

  useEffect(() => {
    const cleanup = setupSocket()
    return cleanup
  }, [setupSocket])

  // Re-register handlers when code changes (for navigation after auction:state fires)
  useEffect(() => {
    if (!code) return
    const socket = getSocket()
    socket.off('auction:state')
    socket.on('auction:state', (state: { status: string; participants: ParticipantInfo[]; code: string }) => {
      setParticipants(state.participants)
      if (state.status !== 'waiting') {
        router.push(`/auction/${state.code}`)
      }
    })
  }, [code, router])

  function handleCreate() {
    if (!userName.trim()) { setErrorMsg('Enter a display name'); return }
    setErrorMsg('')
    const socket = getSocket()
    socket.emit('auction:create', { teamSize, maxPlayers, userName: userName.trim() })
  }

  function handleJoin() {
    if (!userName.trim()) { setErrorMsg('Enter a display name'); return }
    if (!joinCode.trim()) { setErrorMsg('Enter a room code'); return }
    setErrorMsg('')
    const socket = getSocket()
    socket.emit('auction:join', { code: joinCode.trim().toUpperCase(), userName: userName.trim() })
  }

  function handleStart() {
    const socket = getSocket()
    socket.emit('auction:start', { code })
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-8 md:py-16 max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="flex items-center justify-center gap-3 mb-2">
          <span className="font-display text-6xl md:text-7xl text-orange-500 tracking-wider">WAR ROOM</span>
          <span className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/30 rounded-full px-3 py-1 text-green-400 text-xs font-bold">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            LIVE
          </span>
        </div>
        <p className="text-white/40 text-sm tracking-widest uppercase">EBK Salary Cap Auction · Multiplayer</p>
      </div>

      {/* Error toast */}
      {errorMsg && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm text-center">
          {errorMsg}
        </div>
      )}

      {phase === 'lobby' && (
        <div className="card-accent p-6 md:p-8">
          {/* Guest name input if not logged in */}
          {!user && (
            <div className="mb-6">
              <label className="block text-white/50 text-xs uppercase tracking-widest mb-2">Display Name</label>
              <input
                className="input-field font-bold"
                placeholder="Enter your GM name..."
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                maxLength={20}
              />
            </div>
          )}

          {/* Tabs */}
          <div className="flex bg-white/[0.04] rounded-xl p-1 mb-8">
            {(['create', 'join'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-black tracking-widest uppercase transition-all duration-200 ${
                  activeTab === tab
                    ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                {tab === 'create' ? 'Create Room' : 'Join Room'}
              </button>
            ))}
          </div>

          {activeTab === 'create' && (
            <div className="space-y-6">
              {/* Team Size */}
              <div>
                <label className="block text-white/50 text-xs uppercase tracking-widest mb-3">Team Size</label>
                <div className="grid grid-cols-3 gap-3">
                  {([5, 8, 12] as const).map(size => (
                    <button
                      key={size}
                      onClick={() => setTeamSize(size)}
                      className={`py-4 rounded-xl border transition-all duration-200 flex flex-col items-center gap-1 ${
                        teamSize === size
                          ? 'bg-orange-600/20 border-orange-500/60 text-white'
                          : 'bg-white/[0.03] border-white/[0.07] text-white/50 hover:border-white/20'
                      }`}
                    >
                      <span className="font-display text-2xl">{size}</span>
                      <span className="text-xs font-bold">Players</span>
                      <span className={`text-xs ${teamSize === size ? 'text-orange-400' : 'text-white/30'}`}>
                        ${budgetMap[size]}M
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Max GMs */}
              <div>
                <label className="block text-white/50 text-xs uppercase tracking-widest mb-3">Max GMs</label>
                <div className="flex gap-2">
                  {([2, 3, 4, 5, 6] as const).map(n => (
                    <button
                      key={n}
                      onClick={() => setMaxPlayers(n)}
                      className={`flex-1 py-3 rounded-xl border font-display text-xl transition-all duration-200 ${
                        maxPlayers === n
                          ? 'bg-orange-600/20 border-orange-500/60 text-white'
                          : 'bg-white/[0.03] border-white/[0.07] text-white/50 hover:border-white/20'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="bg-white/[0.03] rounded-xl px-5 py-4 flex items-center justify-between">
                <span className="text-white/40 text-sm">Configuration</span>
                <span className="text-white font-bold text-sm">
                  {teamSize} rounds · ${budgetMap[teamSize]}M cap per GM
                </span>
              </div>

              <button onClick={handleCreate} className="btn-primary w-full text-lg font-display tracking-widest">
                Open War Room
              </button>
            </div>
          )}

          {activeTab === 'join' && (
            <div className="space-y-4">
              <div>
                <label className="block text-white/50 text-xs uppercase tracking-widest mb-2">Room Code</label>
                <input
                  className="input-field font-mono text-2xl text-center tracking-[0.3em] uppercase font-bold"
                  placeholder="ABCD12"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                  maxLength={6}
                />
              </div>
              <button onClick={handleJoin} className="btn-primary w-full text-lg font-display tracking-widest">
                Enter War Room
              </button>
            </div>
          )}
        </div>
      )}

      {phase === 'waiting' && (
        <div className="space-y-6">
          {/* Room code display */}
          <div className="card-accent p-8 text-center">
            <p className="text-white/40 text-xs uppercase tracking-[0.3em] mb-3">Room Code</p>
            <div className="font-mono text-5xl md:text-6xl font-black text-white tracking-[0.2em] mb-4">
              {code}
            </div>
            <button
              onClick={handleCopy}
              className={`text-sm px-5 py-2 rounded-lg border transition-all duration-200 ${
                copied
                  ? 'bg-green-500/20 border-green-500/40 text-green-400'
                  : 'bg-white/[0.05] border-white/[0.1] text-white/60 hover:text-white hover:border-white/20'
              }`}
            >
              {copied ? 'Copied!' : 'Copy Code'}
            </button>
          </div>

          {/* Participants */}
          <div className="card-surface p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl text-white/80 tracking-wider">WAR ROOM ROSTER</h2>
              <span className="text-white/30 text-sm">
                {participants.length} / {maxPlayers} GMs
              </span>
            </div>

            <div className="space-y-2">
              {participants.map((p, i) => (
                <div
                  key={p.socketId || i}
                  className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-4 py-3"
                >
                  <div className="w-9 h-9 rounded-full bg-orange-600/20 border border-orange-500/30 flex items-center justify-center font-display text-orange-400 text-lg">
                    {p.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <span className="text-white font-bold">{p.name}</span>
                  {i === 0 && (
                    <span className="ml-auto text-xs bg-orange-600/20 text-orange-400 border border-orange-500/30 rounded-full px-2.5 py-0.5 font-bold">
                      HOST
                    </span>
                  )}
                </div>
              ))}

              {/* Empty slots */}
              {Array.from({ length: maxPlayers - participants.length }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center gap-3 bg-white/[0.02] border border-dashed border-white/[0.07] rounded-xl px-4 py-3"
                >
                  <div className="w-9 h-9 rounded-full border border-dashed border-white/[0.1] flex items-center justify-center">
                    <span className="text-white/20 text-xl">+</span>
                  </div>
                  <span className="text-white/20 text-sm">Waiting...</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action */}
          {isHost ? (
            <div className="space-y-3">
              <button
                onClick={handleStart}
                disabled={participants.length < 2}
                className={`btn-primary w-full text-lg font-display tracking-widest ${
                  participants.length < 2 ? 'opacity-40 cursor-not-allowed hover:scale-100 hover:shadow-none' : ''
                }`}
              >
                {participants.length < 2 ? 'Need at least 2 GMs' : 'Start Auction'}
              </button>
              {participants.length < 2 && (
                <p className="text-center text-white/30 text-sm">Share the room code to invite more GMs</p>
              )}
            </div>
          ) : (
            <div className="card-surface p-5 text-center">
              <div className="flex items-center justify-center gap-3 text-white/50">
                <div className="w-4 h-4 border-2 border-orange-500/50 border-t-orange-500 rounded-full animate-spin" />
                <span className="text-sm">Waiting for host to start the auction...</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
