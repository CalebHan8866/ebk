import nodemailer from 'nodemailer'

function getTransporter() {
  const host = process.env.SMTP_HOST
  const port = parseInt(process.env.SMTP_PORT || '587')
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) {
    return null // dev mode: log to console
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
}

export async function sendVerificationEmail(email: string, username: string, token: string) {
  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  const verifyUrl = `${appUrl}/api/auth/verify?token=${token}`

  const transporter = getTransporter()

  if (!transporter) {
    // Dev mode: log the link instead of sending email
    console.log('\n─────────────────────────────────────────')
    console.log(`📧 VERIFY EMAIL for ${username} (${email})`)
    console.log(`   ${verifyUrl}`)
    console.log('─────────────────────────────────────────\n')
    return
  }

  await transporter.sendMail({
    from: `"EBK - Elite Ball Knowledge" <${process.env.FROM_EMAIL}>`,
    to: email,
    subject: 'Verify your EBK account',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0A0A0A;color:white;padding:32px;border-radius:12px">
        <div style="text-align:center;margin-bottom:24px">
          <span style="font-size:48px">🏀</span>
          <h1 style="color:#F97316;font-size:28px;margin:8px 0">EBK</h1>
          <p style="color:#9CA3AF;margin:0">Elite Ball Knowledge</p>
        </div>
        <h2 style="color:white">Hey ${username}, verify your email</h2>
        <p style="color:#9CA3AF">Click the button below to verify your account and start playing.</p>
        <div style="text-align:center;margin:32px 0">
          <a href="${verifyUrl}" style="background:#EA580C;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">
            Verify Email
          </a>
        </div>
        <p style="color:#6B7280;font-size:12px">Or paste this link: ${verifyUrl}</p>
        <p style="color:#6B7280;font-size:12px">Link expires in 24 hours.</p>
      </div>
    `,
  })
}
