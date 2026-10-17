import type { Metadata } from 'next'
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

export const metadata: Metadata = {
  title: 'EBK - Elite Ball Knowledge',
  description: 'Live head-to-head NBA draft game. Draft the worst career stats to win.',
  icons: {
    icon: '/ebk-favicon.svg',
    apple: '/ebk-logo.svg',
  },
  openGraph: {
    title: 'EBK - Elite Ball Knowledge',
    description: 'Live head-to-head NBA draft game. Draft the worst career stats to win.',
    images: [{ url: '/ebk-logo.svg', width: 400, height: 400 }],
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${inter.variable}`}>
      <body className="flex flex-col min-h-screen">
        <AuthProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  )
}
