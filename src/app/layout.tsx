import type { Metadata, Viewport } from 'next'
import { Bebas_Neue, Inter } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { AuthProvider } from '@/context/AuthContext'

const bebasNeue = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-bebas',
  preload: true,
})

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  preload: true,
})

// Prevent iOS from zooming in when the user taps an input field (which happens
// when the input font-size is smaller than 16 px). maximumScale=1 suppresses
// that auto-zoom without disabling pinch-to-zoom (user-scalable is not set).
// viewportFit=cover ensures env(safe-area-inset-*) works on notched/dynamic-island devices.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0a0f',
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? 'https://ebkgame.com'),
  title: {
    default: 'EBK - Elite Ball Knowledge',
    template: '%s | EBK',
  },
  description: 'Live head-to-head NBA draft game. Draft the worst career stats to win.',
  keywords: ['NBA', 'draft game', 'basketball', 'EBK', 'Elite Ball Knowledge', 'head-to-head'],
  authors: [{ name: 'EBK' }],
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/ebk-favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/icons/icon-192.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'EBK',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    title: 'EBK - Elite Ball Knowledge',
    description: 'Live head-to-head NBA draft game. Draft the worst career stats to win.',
    // Note: /ebk-og.png (1200×630 PNG) would improve social preview rendering.
    // SVG is used as a fallback until a raster image is available.
    images: [{ url: '/ebk-logo.svg', width: 400, height: 400, alt: 'EBK - Elite Ball Knowledge' }],
    type: 'website',
    siteName: 'EBK - Elite Ball Knowledge',
    locale: 'en_CA',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EBK - Elite Ball Knowledge',
    description: 'Live head-to-head NBA draft game. Draft the worst career stats to win.',
    images: ['/ebk-logo.svg'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${inter.variable}`}>
      <body className="flex flex-col min-h-screen">
        <AuthProvider>
          <Navbar />
          {/* pb-20 reserves space for the fixed mobile bottom nav (56px bar + ~24px safe-area buffer) */}
          <main className="flex-1 pb-20 sm:pb-0">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  )
}
