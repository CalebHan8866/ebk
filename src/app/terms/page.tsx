import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service — EBK',
  description: 'Read the terms and conditions for using EBK, the live head-to-head NBA draft game.',
}

const SECTIONS = [
  {
    num: '01',
    title: 'Acceptance of Terms',
    content: (
      <p className="text-white/60 text-sm leading-relaxed">By accessing or using Elite Ball Knowledge (&quot;EBK&quot;, &quot;the Service&quot;) at eliteballknowledge.ca, you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>
    ),
  },
  {
    num: '02',
    title: 'Description of Service',
    content: (
      <p className="text-white/60 text-sm leading-relaxed">EBK is an online NBA-themed draft game where players compete head-to-head by selecting NBA players based on career statistics. The Service is intended for entertainment purposes only.</p>
    ),
  },
  {
    num: '03',
    title: 'Accounts',
    content: (
      <>
        <p className="text-white/60 text-sm leading-relaxed mb-3">You must create an account to access online features. You are responsible for:</p>
        <ul className="space-y-2">
          {[
            'Maintaining the confidentiality of your password',
            'All activity that occurs under your account',
            'Providing accurate registration information',
            'Being at least 13 years of age',
          ].map(item => (
            <li key={item} className="flex items-start gap-2 text-white/55 text-sm">
              <span className="text-orange-500/60 mt-0.5 shrink-0">—</span>
              {item}
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    num: '04',
    title: 'Acceptable Use',
    content: (
      <>
        <p className="text-white/60 text-sm leading-relaxed mb-3">You agree not to:</p>
        <ul className="space-y-2">
          {[
            'Use the Service for any unlawful purpose',
            'Attempt to exploit, cheat, or manipulate game results',
            'Create multiple accounts to circumvent restrictions',
            'Harass, abuse, or harm other users',
            'Use automated scripts or bots',
            'Attempt to access systems or data you are not authorized to access',
          ].map(item => (
            <li key={item} className="flex items-start gap-2 text-white/55 text-sm">
              <span className="text-orange-500/60 mt-0.5 shrink-0">—</span>
              {item}
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    num: '05',
    title: 'Intellectual Property',
    content: (
      <>
        <p className="text-white/60 text-sm leading-relaxed mb-3">All content, design, code, and branding of EBK — including the name &quot;Elite Ball Knowledge&quot; and the EBK mark — are owned by or licensed to the operator. You may not copy, reproduce, or distribute any part of the Service without written permission.</p>
        <p className="text-white/35 text-xs leading-relaxed bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">NBA team names, player names, and statistics are property of the NBA and respective rights holders. EBK is an independent fan project and is not affiliated with, endorsed by, or sponsored by the NBA.</p>
      </>
    ),
  },
  {
    num: '06',
    title: 'Disclaimer of Warranties',
    content: (
      <p className="text-white/60 text-sm leading-relaxed">The Service is provided &quot;as is&quot; without warranties of any kind. We do not guarantee uninterrupted, error-free service. Player statistics are sourced from public records and may contain errors.</p>
    ),
  },
  {
    num: '07',
    title: 'Limitation of Liability',
    content: (
      <p className="text-white/60 text-sm leading-relaxed">To the maximum extent permitted by law, EBK and its operators shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service.</p>
    ),
  },
  {
    num: '08',
    title: 'Termination',
    content: (
      <p className="text-white/60 text-sm leading-relaxed">We reserve the right to suspend or terminate accounts that violate these terms, at our discretion, without prior notice.</p>
    ),
  },
  {
    num: '09',
    title: 'Changes to Terms',
    content: (
      <p className="text-white/60 text-sm leading-relaxed">We may update these terms at any time. Continued use of the Service after changes constitutes acceptance of the new terms.</p>
    ),
  },
  {
    num: '10',
    title: 'Governing Law',
    content: (
      <p className="text-white/60 text-sm leading-relaxed">These terms are governed by the laws of Canada and the province of Ontario, without regard to conflict of law principles.</p>
    ),
  },
]

export default function TermsPage() {
  return (
    <div className="min-h-screen px-4 py-12 animate-fade-in">
      <div className="max-w-prose mx-auto">

        {/* Back nav */}
        <div className="mb-10">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-white/30 hover:text-white/70 text-xs font-bold uppercase tracking-widest transition-colors group"
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
            TERMS OF <span className="text-orange-500">SERVICE</span>
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-white/25 text-xs">Last updated: October 2025</span>
            <span className="text-white/10">·</span>
            <Link href="/privacy" className="text-orange-500/50 hover:text-orange-400 text-xs font-semibold transition-colors">
              View Privacy Policy →
            </Link>
          </div>
        </div>

        {/* Intro card */}
        <div className="card-accent p-5 mb-8">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-4.5 h-4.5 text-orange-400" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div>
              <p className="text-white/80 text-sm font-semibold mb-1">Simple rules, fair game</p>
              <p className="text-white/40 text-xs leading-relaxed">EBK is free to play. These terms cover how to use it responsibly and what you can expect from us.</p>
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
            <Link href="/privacy" className="text-white/30 hover:text-orange-400 text-xs font-semibold transition-colors">Privacy</Link>
            <Link href="/" className="text-white/30 hover:text-white/70 text-xs font-semibold transition-colors">Back to EBK</Link>
          </div>
        </div>

      </div>
    </div>
  )
}
