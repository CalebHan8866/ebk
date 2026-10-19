/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== 'production'

const nextConfig = {
  compress: true,

  // Don't advertise Next.js version in response headers
  poweredByHeader: false,

  images: {
    // Serve modern image formats (AVIF preferred, WebP fallback)
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdnjs.cloudflare.com',
        pathname: '/ajax/libs/twemoji/**',
      },
    ],
  },

  async headers() {
    // socket.io requires connect-src for WebSocket connections back to self.
    // cdnjs is whitelisted for Twemoji SVG img-src.
    // Inline styles are permitted (Tailwind runtime) — unsafe-inline only for style-src.
    // unsafe-eval is required in dev for Next.js HMR/fast-refresh; drop it in production.
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'"

    // In dev the WebSocket connection is plain ws:; in production it's always wss:.
    const connectSrc = isDev
      ? "connect-src 'self' ws: wss:"
      : "connect-src 'self' wss:"

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // HSTS — only send in production; browsers ignore it over HTTP anyway,
          // but being explicit avoids accidental downgrade in staging.
          ...(isDev ? [] : [{
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          }]),
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https://cdnjs.cloudflare.com",
              "font-src 'self'",
              connectSrc,
              "frame-ancestors 'none'",
              // Restrict form submissions to same origin — prevents an injected form
              // from POSTing credentials to an external attacker-controlled URL.
              "form-action 'self'",
              // Restrict <base> tag href to same origin — prevents base-tag injection
              // from hijacking all relative URLs to an attacker's domain.
              "base-uri 'self'",
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
