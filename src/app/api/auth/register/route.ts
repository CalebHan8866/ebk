export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { sendVerificationEmail } from '@/lib/email'
import { rateLimit } from '@/lib/ratelimit'
import { containsProfanity } from '@/lib/profanity'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
    const { success } = rateLimit(`register:${ip}`, 5, 60 * 60 * 1000) // 5 signups per hour per IP
    if (!success) return NextResponse.json({ error: 'Too many signup attempts. Try again in an hour.' }, { status: 429 })

    const { username, email, password } = await request.json()
    if (!username || !email || !password || typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'All fields required' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
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
      return NextResponse.json({ error: 'Disposable email addresses are not allowed' }, { status: 400 })
    }
    if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    if (password.length > 72) return NextResponse.json({ error: 'Password must be 72 characters or less' }, { status: 400 })
    if (username.length < 3) return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 })
    if (username.length > 20) return NextResponse.json({ error: 'Username must be 20 characters or less' }, { status: 400 })
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return NextResponse.json({ error: 'Username can only contain letters, numbers, and underscores' }, { status: 400 })
    if (containsProfanity(username)) return NextResponse.json({ error: 'Username contains disallowed words' }, { status: 400 })

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
    if (existing) return NextResponse.json({ error: 'Username or email already taken' }, { status: 409 })

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
        return NextResponse.json({ error: 'Username or email already taken' }, { status: 409 })
      }
      throw e
    }

    // Fire and forget — don't block the response waiting for email
    sendVerificationEmail(email, username, verificationToken).catch(err => console.error('Email error:', err))

    return NextResponse.json({ message: 'Account created! Check your email to verify your account.' }, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
