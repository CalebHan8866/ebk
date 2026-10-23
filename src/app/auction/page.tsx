'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getSocket } from '@/lib/socket'
import { useAuth } from '@/context/AuthContext'

type Phase = 'lobby' | 'waiting' | 'error'
type ActiveTab = 'create' | 'join'

interface ParticipantInfo {
  name: string
  socketId: string
}

const TEAM_SIZE_CONFIG: Record<number, { budget: number; label: string; time: string }> = {
  5:  { budget: 125, label: 'Starter 5',   time: '~12 min' },
  8:  { budget: 175, label: 'Bench 8',     time: '~20 min' },
  12: { budget: 250, label: 'Full Roster', time: '~35 min' },
}

// Crown icon for host
function CrownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 2l2.5 4.5L17 5l-2 7H5L3 5l4.5 1.5L10 2z" />
      <rect x="4" y="13" width="12" height="2" rx="1" />
    </svg>
  )
}

function AuctionPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth()

  const [phase, setPhase] = useState<Phase>('lobby')
  const [activeTab, setActiveTab] = useState<ActiveTab>('create')
  const [teamSize, setTeamSize] = useState<5 | 8 | 12>(8)
  const [maxPlayers, setMaxPlayers] = useState<2 | 3 | 4 | 5 | 6>(4)
  const [code, setCode] = useState('')
  // Pre-fill join code if arriving from an /auction/join?code= invite link
  const [joinCode, setJoinCode] = useState(() => searchParams.get('join')?.toUpperCase().trim() ?? '')
  const [participants, setParticipants] = useState<ParticipantInfo[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [guestName, setGuestName] = useState('')
  const [isHost, setIsHost] = useState(false)
  const [mySocketId, setMySocketId] = useState('')
  const [copied, setCopied] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)

  const userName = user?.username || guestName

  // If arriving from an invite link (/auction/join?code=XXX), switch to join tab automatically
  useEffect(() => {
    if (searchParams.get('join')) {
      setActiveTab('join')
    }
  }, [searchParams])

  useEffect(() => {
    const socket = getSocket()
    setMySocketId(socket.id || '')

    const onConnect = () => setMySocketId(socket.id || '')

    const onCreated = ({ code: c }: { code: string }) => {
      setMySocketId(socket.id || '')
      setCode(c)
      setIsHost(true)
      setIsCreating(false)
      setPhase('waiting')
    }
    const onJoined = ({ code: c }: { code: string }) => {
      setMySocketId(socket.id || '')
      setCode(c)
      setIsHost(false)
      setIsJoining(false)
      setPhase('waiting')
    }
    const onState = (state: { status: string; participants: ParticipantInfo[]; code: string; teamSize?: number; maxPlayers?: number; totalBudget?: number; hostSocketId?: string }) => {
      setParticipants(state.participants)
      if (state.teamSize && [5, 8, 12].includes(state.teamSize)) setTeamSize(state.teamSize as 5 | 8 | 12)
      if (state.maxPlayers && state.maxPlayers >= 2 && state.maxPlayers <= 6) setMaxPlayers(state.maxPlayers as 2 | 3 | 4 | 5 | 6)
      if (state.hostSocketId) setIsHost(state.hostSocketId === getSocket().id)
      if (state.status !== 'waiting') {
        if (state.code) router.push(`/auction/${state.code}`)
      }
    }
    const onError = ({ message }: { message: string }) => {
      setErrorMsg(message)
      setIsCreating(false)
      setIsJoining(false)
      setTimeout(() => setErrorMsg(''), 4000)
    }

    const onSessionExpired = () => {
      router.replace('/login?reason=session_expired')
    }

    socket.on('connect', onConnect)
    socket.on('auction:created', onCreated)
    socket.on('auction:joined', onJoined)
    socket.on('auction:state', onState)
    socket.on('auction:error', onError)
    socket.on('session-expired', onSessionExpired)

    return () => {
      socket.off('connect', onConnect)
      socket.off('auction:created', onCreated)
      socket.off('auction:joined', onJoined)
      socket.off('auction:state', onState)
      socket.off('auction:error', onError)
      socket.off('session-expired', onSessionExpired)
    }
  }, [router])

  function handleCreate() {
    if (!userName.trim()) { setErrorMsg('Enter a display name'); return }
    setErrorMsg('')
    setIsCreating(true)
    const socket = getSocket()
    socket.emit('auction:create', { teamSize, maxPlayers, userName: userName.trim() })
  }

  function handleJoin() {
    if (!userName.trim()) { setErrorMsg('Enter a display name'); return }
    if (!joinCode.trim()) { setErrorMsg('Enter a room code'); return }
    setErrorMsg('')
    setIsJoining(true)
    const socket = getSocket()
    socket.emit('auction:join', { code: joinCode.trim().toUpperCase(), userName: userName.trim() })
  }

  function handleStart() {
    const socket = getSocket()
    socket.emit('auction:start', { code })
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      const el = document.createElement('textarea')
      el.value = code
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="min-h-screen px-4 py-8 md:py-14 pb-24 sm:pb-8 max-w-2xl mx-auto space-y-6">
        {/* Header skeleton */}
        <div className="space-y-3 mb-8">
          <div className="skeleton h-3 w-20 rounded-full" />
          <div className="skeleton h-12 w-48 rounded-xl" />
        </div>
        {/* Player card skeleton */}
        <div className="card-accent rounded-2xl p-6 space-y-4">
          <div className="skeleton h-5 w-32 rounded-full" />
          <div className="skeleton h-16 w-full rounded-xl" />
          <div className="grid grid-cols-3 gap-3">
            <div className="skeleton h-12 rounded-xl" />
            <div className="skeleton h-12 rounded-xl" />
            <div className="skeleton h-12 rounded-xl" />
          </div>
        </div>
        {/* Roster skeleton */}
        <div className="card-surface rounded-2xl p-5 space-y-3">
          <div className="skeleton h-4 w-24 rounded-full" />
          {[1,2,3].map(i => (
            <div key={i} className="skeleton h-12 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  const cfg = TEAM_SIZE_CONFIG[teamSize]
  const slotsNeeded = maxPlayers - participants.length

  return (
    <div className="min-h-screen px-4 py-8 md:py-14 pb-24 sm:pb-8 max-w-2xl mx-auto">

      {/* ── BACK ───────────────────────────────────────────────────── */}
      <Link
        href="/lobby"
        className="inline-flex items-center gap-1.5 text-white/60 hover:text-white/80 transition-colors text-sm mb-8 group"
      >
        <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Lobby
      </Link>

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div className="text-center mb-10 animate-fade-up">
        <div className="flex items-center justify-center gap-3 mb-2">
          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl text-orange-500 tracking-wider leading-none">WAR ROOM</h1>
          <span className="live-banner shrink-0">
            <span className="live-dot" />
            LIVE
          </span>
        </div>
        <p className="text-white/35 text-xs tracking-[0.3em] uppercase font-bold">EBK Salary Cap Auction · Multiplayer</p>
      </div>

      {/* ── EBK HOOK BANNER ───────────────────────────────────────── */}
      <div className="mb-8 animate-fade-up-1">
        <div className="stat-highlight rounded-2xl px-5 py-4">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-10 h-10 rounded-xl bg-orange-600/20 border border-orange-500/30 flex items-center justify-center text-orange-400 font-display text-xl leading-none">
              ?
            </div>
            <div>
              <p className="text-white font-black text-sm tracking-wide mb-1">Lower score wins — hidden gems beat superstars</p>
              <p className="text-white/45 text-xs leading-relaxed">
                Bid your salary cap on NBA players. LeBron costs a lot and scores high — that&apos;s bad.
                A journeyman role player with low stats and zero Wikipedia fame? That&apos;s the play.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── ERROR TOAST ────────────────────────────────────────────── */}
      {errorMsg && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm text-center animate-slide-up">
          {errorMsg}
        </div>
      )}

      {/* ── LOBBY PHASE ────────────────────────────────────────────── */}
      {phase === 'lobby' && (
        <div className="card-accent p-6 md:p-8 animate-fade-up-2">

          {/* Guest name input if not logged in */}
          {!user && (
            <div className="mb-6">
              <label className="text-label block mb-2">Your GM Name</label>
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
          <div className="tab-pill mb-8">
            {(['create', 'join'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`tab-pill-item ${activeTab === tab ? 'active' : ''}`}
              >
                {tab === 'create' ? 'Create Room' : 'Join Room'}
              </button>
            ))}
          </div>

          {activeTab === 'create' && (
            <div className="space-y-7">

              {/* Team Size */}
              <div>
                <div className="flex items-baseline gap-2 mb-3">
                  <label className="text-label">Team Size</label>
                  <span className="text-white/20 text-[10px] normal-case tracking-normal font-normal">how many players each GM drafts</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {([5, 8, 12] as const).map(size => {
                    const c = TEAM_SIZE_CONFIG[size]
                    const active = teamSize === size
                    return (
                      <button
                        key={size}
                        onClick={() => setTeamSize(size)}
                        className={`py-5 rounded-xl border transition-all duration-200 flex flex-col items-center gap-0.5 ${
                          active
                            ? 'bg-orange-600/20 border-orange-500/60 text-white shadow-lg shadow-orange-900/30'
                            : 'bg-white/[0.03] border-white/[0.07] text-white/50 hover:border-white/20 hover:bg-white/[0.05]'
                        }`}
                      >
                        <span className={`font-display text-4xl leading-none ${active ? 'text-white' : 'text-white/50'}`}>
                          {size}
                        </span>
                        <span className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${active ? 'text-white/60' : 'text-white/25'}`}>
                          Players
                        </span>
                        <span className={`font-display text-2xl leading-none mt-2 ${active ? 'text-orange-400' : 'text-white/20'}`}>
                          ${c.budget}M
                        </span>
                        <span className={`text-[9px] uppercase tracking-widest ${active ? 'text-orange-400/60' : 'text-white/15'}`}>
                          salary cap
                        </span>
                        <span className={`text-[9px] mt-1.5 ${active ? 'text-white/40' : 'text-white/15'}`}>
                          {c.time}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Max GMs */}
              <div>
                <div className="flex items-baseline gap-2 mb-3">
                  <label className="text-label">GMs in Room</label>
                  <span className="text-white/20 text-[10px] normal-case tracking-normal font-normal">max players — start anytime with 2+</span>
                </div>
                <div className="flex gap-2">
                  {([2, 3, 4, 5, 6] as const).map(n => (
                    <button
                      key={n}
                      onClick={() => setMaxPlayers(n)}
                      className={`flex-1 py-3 rounded-xl border font-display text-2xl transition-all duration-200 ${
                        maxPlayers === n
                          ? 'bg-orange-600/20 border-orange-500/60 text-white'
                          : 'bg-white/[0.03] border-white/[0.07] text-white/50 hover:border-white/20 hover:bg-white/[0.05]'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Config summary */}
              <div className="grid grid-cols-3 gap-3 bg-white/[0.03] rounded-2xl px-5 py-4">
                <div className="text-center">
                  <div className="font-display text-3xl leading-none text-orange-400">{teamSize}</div>
                  <div className="text-label mt-1">Rounds</div>
                </div>
                <div className="text-center border-x border-white/[0.06]">
                  <div className="font-display text-3xl leading-none text-orange-400">${cfg.budget}M</div>
                  <div className="text-label mt-1">Cap Per GM</div>
                </div>
                <div className="text-center">
                  <div className="font-display text-3xl leading-none text-white/70">{maxPlayers}</div>
                  <div className="text-label mt-1">GMs Max</div>
                </div>
              </div>

              <button
                onClick={handleCreate}
                disabled={isCreating}
                className="btn-primary w-full text-lg font-display tracking-widest disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isCreating ? (
                  <span className="inline-flex items-center gap-2.5">
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0" />
                    Opening...
                  </span>
                ) : (
                  'Open War Room'
                )}
              </button>
            </div>
          )}

          {activeTab === 'join' && (
            <div className="space-y-6">
              <div>
                <label className="text-label block mb-2">Room Code</label>
                <input
                  className="input-field font-mono text-3xl text-center tracking-[0.35em] uppercase font-bold"
                  placeholder="ABCD12"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                  maxLength={6}
                />
                <p className="text-white/25 text-xs text-center mt-2">Ask the room host for the 6-character code</p>
              </div>
              <button
                onClick={handleJoin}
                disabled={isJoining}
                className="btn-primary w-full text-lg font-display tracking-widest disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isJoining ? (
                  <span className="inline-flex items-center gap-2.5">
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0" />
                    Joining...
                  </span>
                ) : (
                  'Enter War Room'
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── WAITING PHASE ──────────────────────────────────────────── */}
      {phase === 'waiting' && (
        <div className="space-y-4 animate-fade-up">

          {/* Room code — hero display */}
          <div className="card-accent p-8 text-center">
            <p className="text-label mb-3">Room Code — Share This</p>
            <div
              className="font-mono text-4xl sm:text-5xl md:text-6xl font-black text-white tracking-[0.2em] sm:tracking-[0.25em] mb-5 select-all"
              style={{ textShadow: '0 0 40px rgba(249,115,22,0.35)' }}
            >
              {code}
            </div>
            <button
              onClick={handleCopy}
              className={`inline-flex items-center gap-2 text-sm px-6 py-2.5 rounded-xl border font-bold transition-all duration-200 ${
                copied
                  ? 'bg-green-500/15 border-green-500/40 text-green-400'
                  : 'bg-white/[0.05] border-white/[0.1] text-white/60 hover:text-white hover:border-white/25 hover:bg-white/[0.08]'
              }`}
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                  Copy Code
                </>
              )}
            </button>
          </div>

          {/* Session config recap */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Team Size',  value: `${teamSize}`, sub: 'players' },
              { label: 'Salary Cap', value: `$${TEAM_SIZE_CONFIG[teamSize]?.budget ?? 175}M`, sub: 'per gm' },
              { label: 'GMs Max',    value: `${maxPlayers}`, sub: 'managers' },
            ].map(item => (
              <div key={item.label} className="card-surface px-3 py-3 text-center">
                <div className="font-display text-2xl text-orange-400 leading-none">{item.value}</div>
                <div className="text-label mt-1">{item.label}</div>
              </div>
            ))}
          </div>

          {/* ── PARTICIPANTS ─────────────────────────────────────────── */}
          <div className="card-surface p-5">
            {/* Header row */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl text-white/90 tracking-wider">WAR ROOM ROSTER</h2>
              <div className="flex items-center gap-2.5">
                <span className="live-dot" />
                <span className="text-white/50 text-xs font-black tabular-nums">
                  {participants.length}<span className="text-white/25"> / </span>{maxPlayers}
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="budget-bar mb-1">
              <div
                className="budget-bar-fill transition-all duration-500"
                style={{ width: `${(participants.length / maxPlayers) * 100}%` }}
              />
            </div>
            <p className="text-white/25 text-[10px] font-bold mb-4 text-right tracking-wider uppercase">
              {slotsNeeded > 0
                ? `Waiting for ${slotsNeeded} more GM${slotsNeeded !== 1 ? 's' : ''}...`
                : 'Room is full — ready to launch!'}
            </p>

            {/* Player list */}
            <div className="space-y-2">
              {participants.map((p, i) => {
                const isMe = p.socketId === mySocketId
                const isRoomHost = i === 0
                return (
                  <div
                    key={p.socketId || i}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 border transition-all animate-fade-up ${
                      isMe
                        ? 'bg-orange-950/35 border-orange-500/25'
                        : 'bg-white/[0.025] border-white/[0.05]'
                    }`}
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-display text-xl shrink-0 relative ${
                      isMe
                        ? 'bg-orange-600 text-white'
                        : 'bg-orange-600/15 border border-orange-500/25 text-orange-400'
                    }`}>
                      {p.name?.[0]?.toUpperCase() ?? '?'}
                      {/* Crown badge for host */}
                      {isRoomHost && (
                        <span className="absolute -top-2 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center shadow-lg shadow-amber-900/50">
                          <CrownIcon className="w-3 h-3 text-white" />
                        </span>
                      )}
                    </div>

                    {/* Name + role */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-black text-sm truncate">{p.name}</span>
                        {isRoomHost && (
                          <span className="shrink-0 text-[9px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-400">
                            HOST
                          </span>
                        )}
                        {isMe && (
                          <span className="shrink-0 text-[9px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded bg-orange-500/15 border border-orange-500/30 text-orange-400">
                            YOU
                          </span>
                        )}
                      </div>
                      {isRoomHost && !isMe && (
                        <p className="text-white/30 text-[10px] mt-0.5">Can start the auction</p>
                      )}
                    </div>

                    {/* Ready indicator */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-green-400 text-[10px] font-black tracking-widest uppercase">Ready</span>
                    </div>
                  </div>
                )
              })}

              {/* Empty slots */}
              {Array.from({ length: maxPlayers - participants.length }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center gap-3 bg-white/[0.015] border border-dashed border-white/[0.07] rounded-xl px-4 py-3"
                >
                  <div className="w-10 h-10 rounded-full border-2 border-dashed border-white/[0.08] flex items-center justify-center shrink-0">
                    <span className="text-white/15 text-lg">+</span>
                  </div>
                  <div className="flex-1">
                    <span className="text-white/20 text-sm font-bold">Waiting for GM...</span>
                    <div className="flex gap-1 mt-1.5">
                      {[...Array(3)].map((_, d) => (
                        <span
                          key={d}
                          className="w-1 h-1 rounded-full bg-white/15 animate-pulse"
                          style={{ animationDelay: `${d * 200}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── ACTION ROW ──────────────────────────────────────────── */}
          {isHost ? (
            <div className="space-y-3">
              <button
                onClick={handleStart}
                disabled={participants.length < 2}
                className="btn-primary w-full text-lg font-display tracking-widest disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
              >
                {participants.length < 2
                  ? 'Need at least 2 GMs to start'
                  : `Launch Auction — ${participants.length} GMs`}
              </button>
              {participants.length < 2 && (
                <p className="text-center text-white/25 text-xs tracking-wide">
                  Share the room code above to invite more GMs
                </p>
              )}
            </div>
          ) : (
            <div className="card-surface p-5 text-center">
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className="w-4 h-4 border-2 border-orange-500/50 border-t-orange-500 rounded-full animate-spin" />
                <span className="text-white/60 text-sm font-bold">Waiting for host to launch...</span>
              </div>
              <p className="text-white/25 text-xs">You&apos;ll be dropped into the auction automatically</p>
            </div>
          )}

          {/* Quick rules */}
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-4">
            <p className="text-label mb-3">Quick Rules</p>
            <div className="space-y-2 text-white/40 text-xs leading-relaxed">
              <p>• Each GM gets <span className="text-orange-400 font-bold">${TEAM_SIZE_CONFIG[teamSize]?.budget ?? 175}M</span> to spend on {teamSize} players via live bidding</p>
              <p>• <span className="text-white/70 font-bold">Lower EBK score = better.</span> Hidden gems beat superstars</p>
              <p>• Wikipedia fame counts against you — draft players nobody talks about</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AuctionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-white/[0.05]" />
          <div className="absolute inset-0 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
        </div>
      </div>
    }>
      <AuctionPageInner />
    </Suspense>
  )
}
