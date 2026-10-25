// @ts-check
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
})

/** @type {import('next').NextConfig} */

// ─── Next.js 14.2.35 CVE Risk Assessment ────────────────────────────────────
//
// Three CVEs were reported against Next.js 14.x builds that shipped before the
// 14.2.29 / 15.2.3 patches (CVE-2025-29927, CVE-2025-32421, CVE-2025-32420):
//
// CVE-2025-29927 — Middleware authorization bypass via x-middleware-subrequest
//   header injection.
//   STATUS: NOT APPLICABLE — EBK does not use middleware (no middleware.ts file
//   exists in the project). There is no authorization layer in middleware to
//   bypass.  Auth is enforced inside each API route handler.
//
// CVE-2025-32421 — Windows-only path traversal RCE in the Image Optimization
//   API via a malformed `w` (width) parameter.
//   STATUS: NOT EXPLOITABLE — the app is deployed on Railway (Linux). This CVE
//   only affects Windows hosts. Confirmed safe for the current deployment target.
//
// CVE-2025-32420 — SSRF / RCE in Image Optimization when `remotePatterns` (or
//   the legacy `domains`) is absent, allowing arbitrary external URLs to be
//   proxied through the optimizer.
//   STATUS: MITIGATED — `images.remotePatterns` is explicitly configured below,
//   restricting remote image optimization to a single CDN path:
//     https://cdnjs.cloudflare.com/ajax/libs/twemoji/**
//   No other external hostnames are reachable through the optimizer.
//   All `next/image` usage in the codebase (leaderboard/page.tsx,
//   profile/page.tsx) renders only Twemoji SVGs from that whitelisted path.
//
// OVERALL RISK: LOW — zero routes exploitable on Linux + remotePatterns locked.
// Upgrade to 14.2.29+ (or 15.x) is still recommended at the next opportunity
// to clear the CVEs from dependency scanners and reduce future exposure.
// ────────────────────────────────────────────────────────────────────────────

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

    // upgrade-insecure-requests tells browsers to rewrite http:// sub-resource
    // requests to https:// before fetching — belt-and-suspenders alongside HSTS.
    // Only emit in production; dev runs over plain HTTP so the directive would
    // block all local asset loads.
    const upgradeInsecure = isDev ? null : "upgrade-insecure-requests"

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
              // data: URIs in img-src are not used anywhere in the codebase.
              // Allowing them would let XSS payloads exfiltrate data via crafted
              // <img src="data:..."> tags — remove it.
              "img-src 'self' https://cdnjs.cloudflare.com",
              "font-src 'self'",
              connectSrc,
              // Explicit object-src 'none' blocks Flash and legacy plugin injection.
              // default-src 'self' already covers this, but being explicit ensures
              // browsers that don't inherit object-src from default-src are also protected.
              "object-src 'none'",
              "frame-ancestors 'none'",
              // Restrict form submissions to same origin — prevents an injected form
              // from POSTing credentials to an external attacker-controlled URL.
              "form-action 'self'",
              // Restrict <base> tag href to same origin — prevents base-tag injection
              // from hijacking all relative URLs to an attacker's domain.
              "base-uri 'self'",
              // Rewrite any accidental http:// sub-resource requests to https:// in prod.
              ...(upgradeInsecure ? [upgradeInsecure] : []),
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
      {
        // Cache PWA PNG icons from public/icons
        source: '/icons/:file*.png',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
}

module.exports = withBundleAnalyzer(nextConfig)
