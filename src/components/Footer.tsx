import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-[#0A0A0A] mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-gray-400 text-xs">
          © {new Date().getFullYear()} Elite Ball Knowledge. All rights reserved.
        </div>
        <div className="flex items-center gap-5 text-xs">
          <Link href="/terms" className="text-gray-400 hover:text-orange-400 transition-colors">Terms of Service</Link>
          <Link href="/privacy" className="text-gray-400 hover:text-orange-400 transition-colors">Privacy Policy</Link>
        </div>
      </div>
    </footer>
  )
}
