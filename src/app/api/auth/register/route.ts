export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { sendVerificationEmail } from '@/lib/email'
import { rateLimit } from '@/lib/ratelimit'
import { containsProfanity } from '@/lib/profanity'
import { noStore } from '@/lib/no-store'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
    const { success } = rateLimit(`register:${ip}`, 5, 60 * 60 * 1000) // 5 signups per hour per IP
    if (!success) return noStore({ error: 'Too many signup attempts. Try again in an hour.' }, { status: 429 })

    let body: { username?: unknown; email?: unknown; password?: unknown }
    try { body = await request.json() } catch { return noStore({ error: 'All fields required' }, { status: 400 }) }
    const { username, email: rawEmail, password } = body
    if (!username || !rawEmail || !password || typeof username !== 'string' || typeof rawEmail !== 'string' || typeof password !== 'string') {
      return noStore({ error: 'All fields required' }, { status: 400 })
    }
    // Reject oversized email strings before any further processing —
    // 254 chars is the RFC 5321 maximum for an email address.
    if (rawEmail.length > 254) return noStore({ error: 'Invalid email address' }, { status: 400 })
    // Normalize email to lowercase so "User@Example.COM" and "user@example.com"
    // are treated as the same address and cannot register as separate accounts.
    const email = rawEmail.toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return noStore({ error: 'Invalid email address' }, { status: 400 })
    // Block disposable/temporary email domains commonly used for throwaway accounts.
    // This is a lightweight static blocklist — not a full external service — but covers
    // the vast majority of abuse vectors seen in the wild.
    const DISPOSABLE_DOMAINS = new Set([
      'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
      'guerrillamail.biz', 'guerrillamail.de', 'guerrillamail.info', 'guerrillamailblock.com',
      'sharklasers.com', 'grr.la', 'guerrillamailblock.com', 'spam4.me', 'trashmail.com',
      'trashmail.me', 'trashmail.net', 'trashmail.at', 'trashmail.io', 'trashmail.org',
      'yopmail.com', 'yopmail.fr', 'cool.fr.nf', 'jetable.fr.nf', 'nospam.ze.tc',
      'nomail.xl.cx', 'mega.zik.dj', 'speed.1s.fr', 'courriel.fr.nf', 'moncourrier.fr.nf',
      'monemail.fr.nf', 'monmail.fr.nf', 'tempmail.com', 'temp-mail.org', 'temp-mail.io',
      'fakeinbox.com', 'throwam.com', 'throwaway.email', 'dispostable.com', 'maildrop.cc',
      'mailnull.com', 'spamgourmet.com', 'spamgourmet.net', 'spamgourmet.org',
      'spamgourmet.com', 'trashcanmail.com', 'deadaddress.com', 'spamfree24.org',
      'getairmail.com', 'filzmail.com', 'throwam.com', 'discard.email', 'spamhereplease.com',
      'uggsrock.com', 'mailexpire.com', 'mailfreeonline.com', 'spambox.us', 'spambox.info',
      'spambox.irishspringrealty.com', 'mailincubator.com', 'spam.la', 'spamhole.com',
      'mailnew.com', 'mailscrap.com', 'dispostable.com', 'gishpuppy.com', 'sofimail.com',
      'emailfake.com', 'tempinbox.co.uk', 'tempinbox.com', 'smellfear.com', 'humaility.com',
      'no-spam.ws', 'fakemailgenerator.com', 'spamoff.de', 'spamgob.com',
      'mailbucket.org', 'maildrop.cc', 'mailnesia.com', 'mailnull.com',
      'spamgourmet.com', 'trashmail.fr', 'armyspy.com', 'cuvox.de', 'dayrep.com',
      'einrot.com', 'fleckens.hu', 'gustr.com', 'jourrapide.com', 'rhyta.com',
      'superrito.com', 'teleworm.us', 'inoutmail.de', 'inoutmail.eu', 'inoutmail.info',
      'inoutmail.net', 'spamgourmet.net', 'spamgourmet.org', 'mytrashmail.com',
      'mt2009.com', 'mt2014.com', 'mt2015.com', 'spamfree.eu', 'tempr.email',
      'discard.email', 'discardmail.com', 'discardmail.de', 'spamwc.de',
      'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org', 'spammail.me',
    ])
    const emailDomain = email.split('@')[1]?.toLowerCase()
    if (emailDomain && DISPOSABLE_DOMAINS.has(emailDomain)) {
      return noStore({ error: 'Disposable email addresses are not allowed' }, { status: 400 })
    }
    if (password.length < 6) return noStore({ error: 'Password must be at least 6 characters' }, { status: 400 })
    if (password.length > 72) return noStore({ error: 'Password must be 72 characters or less' }, { status: 400 })
    if (username.length < 3) return noStore({ error: 'Username must be at least 3 characters' }, { status: 400 })
    if (username.length > 20) return noStore({ error: 'Username must be 20 characters or less' }, { status: 400 })
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return noStore({ error: 'Username can only contain letters, numbers, and underscores' }, { status: 400 })
    if (containsProfanity(username)) return noStore({ error: 'Username contains disallowed words' }, { status: 400 })

    // Case-insensitive username check: prevent "Admin" and "admin" from coexisting.
    // The `mode: 'insensitive'` filter uses a case-insensitive collation/ILIKE so that
    // homoglyph-free look-alike registrations (e.g. "Admin" vs "admin") are rejected.
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { username: { equals: username, mode: 'insensitive' } },
        ],
      },
    })
    if (existing) {
      // Always run bcrypt even on the "already taken" path so that response
      // timing is indistinguishable from a successful registration. Without
      // this a timing oracle would reveal whether a given email or username
      // is already registered (fast 409 vs slow 201 after bcrypt.hash).
      await bcrypt.hash(password, 12)
      return noStore({ error: 'Username or email already taken' }, { status: 409 })
    }

    const hashed = await bcrypt.hash(password, 12)
    const verificationToken = crypto.randomBytes(32).toString('hex')
    // Store only the SHA-256 hash of the token so a DB read cannot be used to
    // replay verification links.  The raw token travels in the email URL only.
    const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex')

    try {
      await prisma.user.create({
        data: { username, email, password: hashed, verificationToken: verificationTokenHash, emailVerified: false }
      })
    } catch (e: unknown) {
      // P2002 = Prisma unique constraint violation (race condition: concurrent signup with same username/email)
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === 'P2002') {
        return noStore({ error: 'Username or email already taken' }, { status: 409 })
      }
      throw e
    }

    // Fire and forget — don't block the response waiting for email
    sendVerificationEmail(email, username, verificationToken).catch(err => console.error('Email error:', err))

    return noStore({ success: true }, { status: 201 })
  } catch (e) {
    // Log only the error message/code — never the full error object, which may contain
    // Prisma query strings with embedded email addresses or other PII.
    console.error('[register] Unexpected error: %s', e instanceof Error ? e.message : String(e))
    return noStore({ error: 'Server error' }, { status: 500 })
  }
}
