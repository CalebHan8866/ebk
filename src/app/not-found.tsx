import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Page Not Found — EBK',
  description: 'This page does not exist. Head back to the EBK War Room.',
}

export default function NotFound() {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-16 overflow-hidden animate-fade-in">

      {/* Ambient glow — fixed to viewport top, doesn't scroll */}
      <div className="fixed inset-x-0 top-0 h-[520px] pointer-events-none z-0"
        style={{ background: 'radial-gradient(ellipse 80% 90% at 50% 0%, rgba(234,88,12,0.20) 0%, transparent 65%)' }} />

      <div className="relative z-10 w-full max-w-md text-center">

        {/* Big 404 */}
        <div className="relative mb-3 animate-fade-up">
          <span
            className="font-display leading-none select-none block"
            style={{
              fontSize: 'clamp(6rem, 30vw, 14rem)',
              background: 'linear-gradient(180deg, rgba(249,115,22,0.95) 0%, rgba(234,88,12,0.45) 55%, transparent 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 0 48px rgba(249,115,22,0.30))',
            }}
          >
            404
          </span>
          {/* Reflection / glare line */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-2 w-40 h-px bg-gradient-to-r from-transparent via-orange-500/50 to-transparent" />
        </div>

        {/* EBK wordmark */}
        <div className="mb-7 animate-fade-up-1">
          <p className="text-label tracking-[0.4em] mb-1.5">Elite Ball Knowledge</p>
          <h1 className="font-display text-3xl sm:text-4xl text-white leading-none tracking-wide">
            PAGE NOT FOUND
          </h1>
        </div>

        {/* Card */}
        <div className="card-accent p-6 sm:p-8 mb-6 animate-fade-up-2">
          {/* Bouncing basketball */}
          <div className="flex items-center justify-center mb-5">
            <div style={{ animation: 'bounce-ball 1.1s cubic-bezier(0.36,0,0.66,0) infinite' }}>
              <div
                className="w-16 h-16 rounded-full bg-orange-500/15 border-2 border-orange-500/35 flex items-center justify-center"
                style={{ boxShadow: '0 0 28px rgba(249,115,22,0.22), inset 0 1px 0 rgba(255,255,255,0.08)' }}
              >
                <svg className="w-9 h-9 text-orange-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" />
                  <path strokeLinecap="round" d="M12 3c0 5 3 8 9 9M12 3C12 8 9 11 3 12M12 21c0-5-3-8-9-9M12 21c0-5 3-8 9-9" />
                </svg>
              </div>
            </div>
          </div>

          <p className="text-white/75 text-sm font-bold leading-relaxed mb-1.5">
            This page fouled out of bounds.
          </p>
          <p className="text-white/35 text-xs leading-relaxed mb-7">
            Whatever you were looking for doesn&apos;t exist — or got traded to another URL.
          </p>

          <div className="flex flex-col gap-3">
            <Link href="/" className="btn-primary w-full font-display tracking-widest">
              Back to Home Court
            </Link>
            <Link href="/lobby" className="btn-secondary w-full">
              Jump Into a Live Game
            </Link>
          </div>
        </div>

        {/* Quick links */}
        <div className="animate-fade-up-3">
          <p className="text-label mb-3 tracking-widest">Or explore</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {[
              { href: '/practice',     label: 'Practice' },
              { href: '/higher-lower', label: 'Higher or Lower' },
              { href: '/fun-facts',    label: 'Fun Facts' },
              { href: '/leaderboard',  label: 'Leaderboard' },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="text-xs font-bold text-white/55 hover:text-orange-400 transition-colors px-3 py-1.5 rounded-lg border border-white/[0.06] hover:border-orange-500/30 bg-white/[0.02] hover:bg-orange-950/20 min-h-[36px] flex items-center"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
