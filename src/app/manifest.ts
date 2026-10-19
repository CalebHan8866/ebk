import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'EBK — NBA Draft Game',
    short_name: 'EBK',
    description: 'Draft NBA players and compete head-to-head in the ultimate basketball stats showdown.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#f97316',       // orange-500 — matches design system
    background_color: '#0f172a',  // slate-900 — dark background
    icons: [
      {
        src: '/ebk-favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/ebk-logo.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  }
}
