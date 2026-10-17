import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Link href="/" className="text-orange-400 hover:text-orange-300 text-sm">← Back</Link>
        </div>
        <h1 className="font-display text-4xl text-white leading-none mb-2">Privacy Policy</h1>
        <p className="text-gray-400 text-sm mb-10">Last updated: October 2025</p>

        <div className="space-y-8 text-gray-300 text-sm leading-relaxed">

          <section>
            <h2 className="text-white font-black text-lg mb-3">1. Information We Collect</h2>
            <p className="mb-2">When you create an account, we collect:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-400">
              <li>Username</li>
              <li>Email address</li>
              <li>Hashed password (we never store your plain-text password)</li>
              <li>Game statistics (wins, losses, draws)</li>
            </ul>
            <p className="mt-3">We do not collect payment information, phone numbers, or location data.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">2. How We Use Your Information</h2>
            <p className="mb-2">We use your information to:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-400">
              <li>Create and manage your account</li>
              <li>Send account verification and password reset emails</li>
              <li>Track your game record and unlocked achievements</li>
              <li>Display your username and record to other players in online lobbies</li>
            </ul>
            <p className="mt-3">We do not sell, rent, or share your personal information with third parties for marketing purposes.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">3. Email Communications</h2>
            <p>We only send transactional emails — account verification and password resets. We do not send marketing or promotional emails.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">4. Data Storage</h2>
            <p>Your data is stored in a secure PostgreSQL database hosted on Railway. Passwords are hashed using bcrypt and are never stored in plain text. Authentication tokens are stored as HTTP-only cookies.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">5. Cookies</h2>
            <p>We use a single authentication cookie (&quot;ebk-token&quot;) to keep you logged in. This cookie is HTTP-only, meaning it cannot be accessed by JavaScript. No tracking or advertising cookies are used.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">6. Third-Party Services</h2>
            <p className="mb-2">We use the following third-party services:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-400">
              <li><strong className="text-gray-300">Railway</strong> — hosting and database</li>
              <li><strong className="text-gray-300">Resend</strong> — transactional email delivery</li>
              <li><strong className="text-gray-300">Cloudflare</strong> — DNS and DDoS protection</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">7. Your Rights (PIPEDA)</h2>
            <p className="mb-2">Under Canada&apos;s Personal Information Protection and Electronic Documents Act (PIPEDA), you have the right to:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-400">
              <li>Access the personal information we hold about you</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of your account and associated data</li>
            </ul>
            <p className="mt-3">To exercise these rights, contact us at <span className="text-orange-400">noreply@eliteballknowledge.ca</span></p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">8. Data Retention</h2>
            <p>We retain your account data for as long as your account is active. If you request account deletion, we will remove your personal information within 30 days.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">9. Children&apos;s Privacy</h2>
            <p>EBK is not directed at children under 13. We do not knowingly collect information from children under 13. If you believe a child has created an account, contact us and we will delete it.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">10. Changes to This Policy</h2>
            <p>We may update this policy from time to time. We will notify users of significant changes by posting a notice on the site.</p>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-gray-800 text-gray-400 text-xs">
          <Link href="/terms" className="text-orange-400 hover:text-orange-300 mr-4">Terms of Service</Link>
          <Link href="/" className="hover:text-gray-400">Back to EBK</Link>
        </div>
      </div>
    </div>
  )
}
