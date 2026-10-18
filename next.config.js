/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdnjs.cloudflare.com',
        pathname: '/ajax/libs/twemoji/**',
      },
    ],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
          },
          {
            key: 'Content-Security-Policy',
            // socket.io requires connect-src for WebSocket connections back to self.
            // cdnjs is whitelisted for Twemoji SVG img-src.
            // Inline styles are permitted (Tailwind runtime) — unsafe-inline only for style-src.
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https://cdnjs.cloudflare.com",
              "font-src 'self'",
              "connect-src 'self' wss:",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
      {
        // Cache static SVG assets from public dir
        source: '/:file*.svg',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
