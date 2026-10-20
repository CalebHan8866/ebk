import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy — EBK',
  description: 'Learn how EBK collects, uses, and protects your personal information.',
}

const SECTIONS = [
  {
    num: '01',
    title: 'Information We Collect',
    content: (
      <>
        <p className="text-white/60 text-sm leading-relaxed mb-3">When you create an account, we collect:</p>
        <ul className="space-y-2">
          {['Username', 'Email address', 'Hashed password (we never store your plain-text password)', 'Game statistics (wins, losses, draws)'].map(item => (
            <li key={item} className="flex items-start gap-2 text-white/55 text-sm">
              <span className="text-orange-500/60 mt-0.5 shrink-0">—</span>
              {item}
            </li>
          ))}
        </ul>
        <p className="text-white/60 text-sm leading-relaxed mt-3">We do not collect payment information, phone numbers, or location data.</p>
      </>
    ),
  },
  {
    num: '02',
    title: 'How We Use Your Information',
    content: (
      <>
        <p className="text-white/60 text-sm leading-relaxed mb-3">We use your information to:</p>
        <ul className="space-y-2">
          {[
            'Create and manage your account',
            'Send account verification and password reset emails',
            'Track your game record and unlocked achievements',
            'Display your username and record to other players in online lobbies',
          ].map(item => (
            <li key={item} className="flex items-start gap-2 text-white/55 text-sm">
              <span className="text-orange-500/60 mt-0.5 shrink-0">—</span>
              {item}
            </li>
          ))}
        </ul>
        <p className="text-white/60 text-sm leading-relaxed mt-3">We do not sell, rent, or share your personal information with third parties for marketing purposes.</p>
      </>
    ),
  },
  {
    num: '03',
    title: 'Email Communications',
    content: (
      <p className="text-white/60 text-sm leading-relaxed">We only send transactional emails — account verification and password resets. We do not send marketing or promotional emails.</p>
    ),
  },
  {
    num: '04',
    title: 'Data Storage',
    content: (
      <p className="text-white/60 text-sm leading-relaxed">Your data is stored in a secure PostgreSQL database hosted on Railway. Passwords are hashed using bcrypt and are never stored in plain text. Authentication tokens are stored as HTTP-only cookies.</p>
    ),
  },
  {
    num: '05',
    title: 'Cookies',
    content: (
      <p className="text-white/60 text-sm leading-relaxed">We use a single authentication cookie (&quot;ebk-token&quot;) to keep you logged in. This cookie is HTTP-only, meaning it cannot be accessed by JavaScript. No tracking or advertising cookies are used.</p>
    ),
  },
  {
    num: '06',
    title: 'Third-Party Services',
    content: (
      <>
        <p className="text-white/60 text-sm leading-relaxed mb-3">We use the following third-party services:</p>
        <ul className="space-y-2">
          {[
            { name: 'Railway', desc: 'hosting and database' },
            { name: 'Resend', desc: 'transactional email delivery' },
            { name: 'Cloudflare', desc: 'DNS and DDoS protection' },
          ].map(({ name, desc }) => (
            <li key={name} className="flex items-start gap-2 text-white/40 text-sm">
              <span className="text-orange-500/60 mt-0.5 shrink-0">—</span>
              <span><span className="text-white/70 font-semibold">{name}</span> — {desc}</span>
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    num: '07',
    title: 'Your Rights (PIPEDA)',
    content: (
      <>
        <p className="text-white/60 text-sm leading-relaxed mb-3">Under Canada&apos;s Personal Information Protection and Electronic Documents Act (PIPEDA), you have the right to:</p>
        <ul className="space-y-2">
          {[
            'Access the personal information we hold about you',
            'Request correction of inaccurate information',
            'Request deletion of your account and associated data',
          ].map(item => (
            <li key={item} className="flex items-start gap-2 text-white/55 text-sm">
              <span className="text-orange-500/60 mt-0.5 shrink-0">—</span>
              {item}
            </li>
          ))}
        </ul>
        <p className="text-white/60 text-sm leading-relaxed mt-3">
          To exercise these rights, contact us at{' '}
          <a href="mailto:noreply@eliteballknowledge.ca" className="text-orange-400 hover:text-orange-300 transition-colors">
            noreply@eliteballknowledge.ca
          </a>
        </p>
      </>
    ),
  },
  {
    num: '08',
    title: 'Data Retention',
    content: (
      <p className="text-white/60 text-sm leading-relaxed">We retain your account data for as long as your account is active. If you request account deletion, we will remove your personal information within 30 days.</p>
    ),
  },
  {
    num: '09',
    title: "Children's Privacy",
    content: (
      <p className="text-white/60 text-sm leading-relaxed">EBK is not directed at children under 13. We do not knowingly collect information from children under 13. If you believe a child has created an account, contact us and we will delete it.</p>
    ),
  },
  {
    num: '10',
    title: 'Changes to This Policy',
    content: (
      <p className="text-white/60 text-sm leading-relaxed">We may update this policy from time to time. We will notify users of significant changes by posting a notice on the site.</p>
    ),
  },
]

export default function PrivacyPage() {
  return (
    <div className="min-h-screen px-4 py-12 animate-fade-in">
      <div className="max-w-prose mx-auto">

        {/* Back nav */}
        <div className="mb-10">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-white/60 hover:text-white/80 text-xs font-bold uppercase tracking-widest transition-colors group"
          >
            <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to EBK
          </Link>
        </div>

        {/* Page header */}
        <div className="mb-10">
          <p className="text-label tracking-[0.25em] mb-3">Legal</p>
          <h1 className="font-display text-5xl sm:text-6xl text-white leading-none mb-3 tracking-wide">
            PRIVACY <span className="text-orange-500">POLICY</span>
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-white/25 text-xs">Last updated: October 2025</span>
            <span className="text-white/10">·</span>
            <Link href="/terms" className="text-orange-500/50 hover:text-orange-400 text-xs font-semibold transition-colors">
              View Terms of Service →
            </Link>
          </div>
        </div>

        {/* Intro card */}
        <div className="card-accent p-5 mb-8">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-4.5 h-4.5 text-orange-400" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <p className="text-white/80 text-sm font-semibold mb-1">Your data stays yours</p>
              <p className="text-white/40 text-xs leading-relaxed">EBK collects only what&apos;s needed to run the game. No ads, no data selling, no tracking.</p>
            </div>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-3">
          {SECTIONS.map(({ num, title, content }) => (
            <div key={num} className="card-surface rounded-2xl overflow-hidden">
              {/* Section header */}
              <div className="flex items-center gap-4 px-5 py-4 border-b border-white/[0.05]">
                <span className="font-display text-2xl text-orange-500/40 leading-none tabular-nums shrink-0">{num}</span>
                <h2 className="text-white font-black text-base tracking-wide leading-snug">{title}</h2>
              </div>
              {/* Section body */}
              <div className="px-5 py-4">
                {content}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-10 pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-white/20 text-xs">
            Questions?{' '}
            <a href="mailto:noreply@eliteballknowledge.ca" className="text-orange-500/50 hover:text-orange-400 transition-colors">
              noreply@eliteballknowledge.ca
            </a>
          </p>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="text-white/60 hover:text-orange-400 text-xs font-semibold transition-colors">Terms</Link>
            <Link href="/" className="text-white/60 hover:text-white/80 text-xs font-semibold transition-colors">Back to EBK</Link>
          </div>
        </div>

      </div>
    </div>
  )
}
