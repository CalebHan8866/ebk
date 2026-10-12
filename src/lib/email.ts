import { Resend } from 'resend'

function getResend() {
  const key = process.env.RESEND_API_KEY
  if (key) return new Resend(key)
  return null
}

const FROM = process.env.FROM_EMAIL || 'noreply@eliteballknowledge.ca'

export async function sendVerificationEmail(email: string, username: string, token: string) {
  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  const verifyUrl = `${appUrl}/api/auth/verify?token=${token}`

  const resend = getResend()

  if (!resend) {
    console.log('\n─────────────────────────────────────────')
    console.log(`📧 VERIFY EMAIL for ${username} (${email})`)
    console.log(`   ${verifyUrl}`)
    console.log('─────────────────────────────────────────\n')
    return
  }

  await resend.emails.send({
    from: `EBK <${FROM}>`,
    to: email,
    subject: 'Verify your EBK account',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;background:#080808;color:white;padding:36px;border-radius:12px;border:1px solid #1f1f1f">
        <div style="margin-bottom:28px">
          <span style="color:#F97316;font-size:32px;font-weight:900;letter-spacing:0.05em">EBK</span>
          <p style="color:#6B7280;margin:4px 0 0;font-size:12px;letter-spacing:0.2em;text-transform:uppercase">Elite Ball Knowledge</p>
        </div>
        <h2 style="color:white;margin:0 0 8px;font-size:20px">Hey ${username}, verify your email</h2>
        <p style="color:#9CA3AF;margin:0 0 28px;line-height:1.6">Click the button below to confirm your account and start playing.</p>
        <a href="${verifyUrl}" style="display:inline-block;background:#EA580C;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">
          Verify Email
        </a>
        <p style="color:#4B5563;font-size:12px;margin-top:28px;word-break:break-all">
          Or copy this link: ${verifyUrl}
        </p>
      </div>
    `,
  })
}

export async function sendPasswordResetEmail(email: string, username: string, token: string) {
  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  const resetUrl = `${appUrl}/reset-password?token=${token}`

  const resend = getResend()

  if (!resend) {
    console.log('\n─────────────────────────────────────────')
    console.log(`🔑 RESET PASSWORD for ${username} (${email})`)
    console.log(`   ${resetUrl}`)
    console.log('─────────────────────────────────────────\n')
    return
  }

  await resend.emails.send({
    from: `EBK <${FROM}>`,
    to: email,
    subject: 'Reset your EBK password',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;background:#080808;color:white;padding:36px;border-radius:12px;border:1px solid #1f1f1f">
        <div style="margin-bottom:28px">
          <span style="color:#F97316;font-size:32px;font-weight:900;letter-spacing:0.05em">EBK</span>
          <p style="color:#6B7280;margin:4px 0 0;font-size:12px;letter-spacing:0.2em;text-transform:uppercase">Elite Ball Knowledge</p>
        </div>
        <h2 style="color:white;margin:0 0 8px;font-size:20px">Reset your password</h2>
        <p style="color:#9CA3AF;margin:0 0 28px;line-height:1.6">Click the button below to set a new password. This link expires in 1 hour.</p>
        <a href="${resetUrl}" style="display:inline-block;background:#EA580C;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">
          Reset Password
        </a>
        <p style="color:#4B5563;font-size:12px;margin-top:28px">If you didn't request this, ignore this email.</p>
        <p style="color:#4B5563;font-size:12px;margin-top:8px;word-break:break-all">
          Or copy this link: ${resetUrl}
        </p>
      </div>
    `,
  })
}
