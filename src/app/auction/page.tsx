'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  5:  { budget: 125, label: 'Starter 5',  time: '~12 min' },
  8:  { budget: 175, label: 'Bench 8',    time: '~20 min' },
  12: { budget: 250, label: 'Full Roster', time: '~35 min' },
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

  useEffect(() => {
    const socket = getSocket()

    const onCreated = ({ code: c }: { code: string }) => {
      setCode(c)
      setIsHost(true)
      setPhase('waiting')
    }
    const onJoined = ({ code: c }: { code: string }) => {
      setCode(c)
      setIsHost(false)
      setPhase('waiting')
    }
    const onState = (state: { status: string; participants: ParticipantInfo[]; code: string }) => {
      setParticipants(state.participants)
      if (state.status !== 'waiting') {
        if (state.code) router.push(`/auction/${state.code}`)
      }
    }
    const onError = ({ message }: { message: string }) => {
      setErrorMsg(message)
      setTimeout(() => setErrorMsg(''), 4000)
    }

    socket.on('auction:created', onCreated)
    socket.on('auction:joined', onJoined)
    socket.on('auction:state', onState)
    socket.on('auction:error', onError)

    return () => {
      socket.off('auction:created', onCreated)
      socket.off('auction:joined', onJoined)
      socket.off('auction:state', onState)
      socket.off('auction:error', onError)
    }
  }, [router])

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
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      // fallback for non-HTTPS or older browsers
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const cfg = TEAM_SIZE_CONFIG[teamSize]

  return (
    <div className="min-h-screen px-4 py-8 md:py-14 max-w-2xl mx-auto animate-fade-in">

      {/* ── BACK ───────────────────────────────────────────────────── */}
      <Link href="/lobby" className="text-gray-500 hover:text-white transition-colors text-sm mb-6 flex items-center gap-1 w-fit">
        ← Back
      </Link>

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div className="text-center mb-10">
        <div className="flex items-center justify-center gap-3 mb-1">
          <span className="font-display text-6xl md:text-7xl text-orange-500 tracking-wider">WAR ROOM</span>
          <span className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/30 rounded-full px-3 py-1 text-green-400 text-xs font-bold">
            <span className="live-dot" />
            LIVE
          </span>
        </div>
        <p className="text-white/40 text-sm tracking-widest uppercase">EBK Salary Cap Auction · Multiplayer</p>
      </div>

      {/* ── EBK HOOK BANNER ───────────────────────────────────────── */}
      <div className="mb-8 bg-orange-950/30 border border-orange-800/30 rounded-2xl px-5 py-4">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-orange-600/20 border border-orange-500/30 flex items-center justify-center">
            <span className="font-display text-orange-400 text-lg leading-none">?</span>
          </div>
          <div>
            <p className="text-white font-black text-sm tracking-wide mb-1">Lower score wins — hidden gems beat superstars</p>
            <p className="text-white/50 text-xs leading-relaxed">
              Bid your salary cap on NBA players. LeBron costs a lot and scores high — that&apos;s bad.
              A journeyman role player with low stats and zero Wikipedia fame? That&apos;s the play.
            </p>
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
        <div className="card-accent p-6 md:p-8">
          {/* Guest name input if not logged in */}
          {!user && (
            <div className="mb-6">
              <label className="block text-white/50 text-xs uppercase tracking-widest mb-2">Your GM Name</label>
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
            <div className="space-y-7">

              {/* Team Size — with budget as hero number */}
              <div>
                <label className="block text-white/50 text-xs uppercase tracking-widest mb-3">Team Size</label>
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
                            : 'bg-white/[0.03] border-white/[0.07] text-white/50 hover:border-white/20'
                        }`}
                      >
                        {/* Player count — hero number */}
                        <span className={`font-display text-4xl leading-none ${active ? 'text-white' : 'text-white/50'}`}>
                          {size}
                        </span>
                        <span className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${active ? 'text-white/60' : 'text-white/25'}`}>
                          Players
                        </span>
                        {/* Budget — large, colored */}
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
                <label className="block text-white/50 text-xs uppercase tracking-widest mb-3">
                  GMs in Room <span className="text-white/20 normal-case tracking-normal">({maxPlayers} selected)</span>
                </label>
                <div className="flex gap-2">
                  {([2, 3, 4, 5, 6] as const).map(n => (
                    <button
                      key={n}
                      onClick={() => setMaxPlayers(n)}
                      className={`flex-1 py-3 rounded-xl border font-display text-2xl transition-all duration-200 ${
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

              {/* Config summary bar */}
              <div className="grid grid-cols-3 gap-3 bg-white/[0.03] rounded-2xl px-5 py-4">
                <div className="text-center">
                  <div className={`font-display text-3xl leading-none text-orange-400`}>
                    {teamSize}
                  </div>
                  <div className="text-white/30 text-[10px] uppercase tracking-widest mt-1">Rounds</div>
                </div>
                <div className="text-center border-x border-white/[0.06]">
                  <div className={`font-display text-3xl leading-none text-orange-400`}>
                    ${cfg.budget}M
                  </div>
                  <div className="text-white/30 text-[10px] uppercase tracking-widest mt-1">Cap Per GM</div>
                </div>
                <div className="text-center">
                  <div className={`font-display text-3xl leading-none text-white/70`}>
                    {maxPlayers}
                  </div>
                  <div className="text-white/30 text-[10px] uppercase tracking-widest mt-1">GMs Max</div>
                </div>
              </div>

              <button onClick={handleCreate} className="btn-primary w-full text-lg font-display tracking-widest">
                Open War Room
              </button>
            </div>
          )}

          {activeTab === 'join' && (
            <div className="space-y-6">
              <div>
                <label className="block text-white/50 text-xs uppercase tracking-widest mb-2">Room Code</label>
                <input
                  className="input-field font-mono text-3xl text-center tracking-[0.35em] uppercase font-bold"
                  placeholder="ABCD12"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                  maxLength={6}
                />
                <p className="text-white/25 text-xs text-center mt-2">Ask the room host for the 6-character code</p>
              </div>
              <button onClick={handleJoin} className="btn-primary w-full text-lg font-display tracking-widest">
                Enter War Room
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── WAITING PHASE ──────────────────────────────────────────── */}
      {phase === 'waiting' && (
        <div className="space-y-5 animate-slide-up">

          {/* Room code — hero display */}
          <div className="card-accent p-8 text-center">
            <p className="text-white/40 text-[10px] uppercase tracking-[0.35em] mb-2">Room Code — Share This</p>
            <div
              className="font-mono text-5xl md:text-6xl font-black text-white tracking-[0.25em] mb-5"
              style={{ textShadow: '0 0 40px rgba(249,115,22,0.3)' }}
            >
              {code}
            </div>
            <button
              onClick={handleCopy}
              className={`text-sm px-6 py-2.5 rounded-xl border font-bold transition-all duration-200 ${
                copied
                  ? 'bg-green-500/20 border-green-500/40 text-green-400'
                  : 'bg-white/[0.05] border-white/[0.1] text-white/60 hover:text-white hover:border-white/25 hover:bg-white/[0.08]'
              }`}
            >
              {copied ? '✓ Copied to clipboard' : 'Copy Code'}
            </button>
          </div>

          {/* Session config recap */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Team Size',  value: `${teamSize} players` },
              { label: 'Salary Cap', value: `$${TEAM_SIZE_CONFIG[teamSize]?.budget ?? 175}M` },
              { label: 'GMs Max',    value: `${maxPlayers} GMs` },
            ].map(item => (
              <div key={item.label} className="card-surface px-4 py-3 text-center">
                <div className="font-display text-xl text-orange-400 leading-none">{item.value}</div>
                <div className="text-white/30 text-[9px] uppercase tracking-widest mt-1">{item.label}</div>
              </div>
            ))}
          </div>

          {/* Participants */}
          <div className="card-surface p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl text-white/80 tracking-wider">WAR ROOM ROSTER</h2>
              <div className="flex items-center gap-2">
                <span className="live-dot" />
                <span className="text-white/40 text-xs font-bold tabular-nums">
                  {participants.length} / {maxPlayers}
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="budget-bar mb-4">
              <div
                className="budget-bar-fill"
                style={{ width: `${(participants.length / maxPlayers) * 100}%` }}
              />
            </div>

            <div className="space-y-2">
              {participants.map((p, i) => (
                <div
                  key={p.socketId || i}
                  className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-4 py-3 animate-slide-up"
                >
                  <div className="w-9 h-9 rounded-full bg-orange-600/20 border border-orange-500/30 flex items-center justify-center font-display text-orange-400 text-lg shrink-0">
                    {p.name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-white font-bold block truncate">{p.name}</span>
                    {i === 0 && (
                      <span className="text-orange-400/70 text-[10px] font-bold uppercase tracking-widest">Host</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-green-400 text-[10px] font-bold">READY</span>
                  </div>
                </div>
              ))}

              {/* Empty slots */}
              {Array.from({ length: maxPlayers - participants.length }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center gap-3 bg-white/[0.02] border border-dashed border-white/[0.07] rounded-xl px-4 py-3"
                >
                  <div className="w-9 h-9 rounded-full border border-dashed border-white/[0.1] flex items-center justify-center shrink-0">
                    <span className="text-white/20 text-lg">+</span>
                  </div>
                  <span className="text-white/20 text-sm">Waiting for GM...</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action row */}
          {isHost ? (
            <div className="space-y-3">
              <button
                onClick={handleStart}
                disabled={participants.length < 2}
                className={`btn-primary w-full text-lg font-display tracking-widest ${
                  participants.length < 2 ? 'opacity-40 cursor-not-allowed hover:scale-100 hover:shadow-none hover:translate-y-0' : ''
                }`}
              >
                {participants.length < 2 ? 'Need at least 2 GMs' : `Start Auction — ${participants.length} GMs`}
              </button>
              {participants.length < 2 && (
                <p className="text-center text-white/30 text-xs tracking-wide">
                  Share the room code above to invite more GMs
                </p>
              )}
            </div>
          ) : (
            <div className="card-surface p-5 text-center">
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className="w-4 h-4 border-2 border-orange-500/50 border-t-orange-500 rounded-full animate-spin" />
                <span className="text-white/60 text-sm font-bold">Waiting for host to start</span>
              </div>
              <p className="text-white/25 text-xs">You&apos;ll enter automatically when the host fires it up</p>
            </div>
          )}

          {/* Quick rules reminder */}
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-4">
            <p className="text-white/30 text-[10px] uppercase tracking-widest mb-3 font-bold">Quick Rules</p>
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
