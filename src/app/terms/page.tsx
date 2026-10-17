import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service — EBK',
  description: 'Read the terms and conditions for using EBK, the live head-to-head NBA draft game.',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Link href="/" className="text-orange-400 hover:text-orange-300 text-sm">← Back</Link>
        </div>
        <h1 className="font-display text-4xl text-white leading-none mb-2">Terms of Service</h1>
        <p className="text-gray-400 text-sm mb-10">Last updated: October 2025</p>

        <div className="space-y-8 text-gray-300 text-sm leading-relaxed">

          <section>
            <h2 className="text-white font-black text-lg mb-3">1. Acceptance of Terms</h2>
            <p>By accessing or using Elite Ball Knowledge (&quot;EBK&quot;, &quot;the Service&quot;) at eliteballknowledge.ca, you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">2. Description of Service</h2>
            <p>EBK is an online NBA-themed draft game where players compete head-to-head by selecting NBA players based on career statistics. The Service is intended for entertainment purposes only.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">3. Accounts</h2>
            <p className="mb-2">You must create an account to access online features. You are responsible for:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-400">
              <li>Maintaining the confidentiality of your password</li>
              <li>All activity that occurs under your account</li>
              <li>Providing accurate registration information</li>
              <li>Being at least 13 years of age</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">4. Acceptable Use</h2>
            <p className="mb-2">You agree not to:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-400">
              <li>Use the Service for any unlawful purpose</li>
              <li>Attempt to exploit, cheat, or manipulate game results</li>
              <li>Create multiple accounts to circumvent restrictions</li>
              <li>Harass, abuse, or harm other users</li>
              <li>Use automated scripts or bots</li>
              <li>Attempt to access systems or data you are not authorized to access</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">5. Intellectual Property</h2>
            <p>All content, design, code, and branding of EBK — including the name &quot;Elite Ball Knowledge&quot; and the EBK mark — are owned by or licensed to the operator. You may not copy, reproduce, or distribute any part of the Service without written permission.</p>
            <p className="mt-2 text-gray-400">NBA team names, player names, and statistics are property of the NBA and respective rights holders. EBK is an independent fan project and is not affiliated with, endorsed by, or sponsored by the NBA.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">6. Disclaimer of Warranties</h2>
            <p>The Service is provided &quot;as is&quot; without warranties of any kind. We do not guarantee uninterrupted, error-free service. Player statistics are sourced from public records and may contain errors.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">7. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, EBK and its operators shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">8. Termination</h2>
            <p>We reserve the right to suspend or terminate accounts that violate these terms, at our discretion, without prior notice.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">9. Changes to Terms</h2>
            <p>We may update these terms at any time. Continued use of the Service after changes constitutes acceptance of the new terms.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">10. Governing Law</h2>
            <p>These terms are governed by the laws of Canada and the province of Ontario, without regard to conflict of law principles.</p>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-gray-800 text-gray-400 text-xs">
          <Link href="/privacy" className="text-orange-400 hover:text-orange-300 mr-4">Privacy Policy</Link>
          <Link href="/" className="hover:text-gray-400">Back to EBK</Link>
        </div>
      </div>
    </div>
  )
}
