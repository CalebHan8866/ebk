import { NextResponse } from 'next/server'

/**
 * Wraps NextResponse.json and adds Cache-Control: no-store so auth responses
 * are never cached by browsers, CDNs, or reverse proxies.
 */
export function noStore<T>(body: T, init?: ResponseInit): NextResponse {
  const res = NextResponse.json(body, init)
  res.headers.set('Cache-Control', 'no-store')
  return res
}
