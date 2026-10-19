import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Page Not Found — EBK',
  description: 'This page does not exist. Head back to the EBK War Room.',
}

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16 animate-fade-in">
      <div className="w-full max-w-md text-center">

        {/* Ambient glow */}
        <div className="absolute inset-x-0 top-0 h-[480px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 80% 90% at 50% 0%, rgba(234,88,12,0.18) 0%, transparent 65%)' }} />

        <div className="relative">
          {/* Big 404 */}
          <div className="relative mb-4 animate-fade-up">
            <span
              className="font-display leading-none select-none block"
              style={{
                fontSize: 'clamp(6rem, 30vw, 14rem)',
                background: 'linear-gradient(180deg, rgba(249,115,22,0.9) 0%, rgba(234,88,12,0.4) 60%, transparent 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 0 40px rgba(249,115,22,0.25))',
              }}
            >
              404
            </span>
            {/* Reflection / glare line */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-32 h-px bg-gradient-to-r from-transparent via-orange-500/40 to-transparent" />
          </div>

          {/* EBK wordmark */}
          <div className="mb-6 animate-fade-up-1">
            <p className="text-label tracking-[0.4em] mb-1">Elite Ball Knowledge</p>
            <h1 className="font-display text-3xl sm:text-4xl text-white leading-none tracking-wide">
              PAGE NOT FOUND
            </h1>
          </div>

          {/* Card */}
          <div className="card-accent p-6 sm:p-8 mb-6 animate-fade-up-2">
            {/* Bench icon */}
            <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-orange-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
              </svg>
            </div>

            <p className="text-white/70 text-sm leading-relaxed mb-1">
              Looks like this page fouled out of bounds.
            </p>
            <p className="text-white/35 text-xs leading-relaxed mb-6">
              The page you're looking for doesn't exist or may have been moved.
            </p>

            <div className="flex flex-col gap-3">
              <Link href="/" className="btn-primary w-full text-sm font-display tracking-widest">
                Back to Home Court
              </Link>
              <Link href="/lobby" className="btn-secondary w-full text-sm">
                Jump Into a Live Game
              </Link>
            </div>
          </div>

          {/* Quick links */}
          <div className="animate-fade-up-3">
            <p className="text-label mb-3 tracking-widest">Or explore</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {[
                { href: '/practice', label: 'Practice' },
                { href: '/higher-lower', label: 'Higher or Lower' },
                { href: '/fun-facts', label: 'Fun Facts' },
                { href: '/leaderboard', label: 'Leaderboard' },
              ].map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="text-xs font-bold text-white/40 hover:text-orange-400 transition-colors px-3 py-1.5 rounded-lg border border-white/[0.06] hover:border-orange-500/30 bg-white/[0.02] hover:bg-orange-950/20"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
