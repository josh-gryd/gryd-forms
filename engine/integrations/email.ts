// Outgoing email over SMTP. One setting, FORMS_SMTP_URL
// (smtp(s)://user:pass@host:port), plus the From address, FORMS_EMAIL_FROM.
// Works with Resend, Postmark, SendGrid, Amazon SES, Mailgun or Gmail
// (an app password). Not set: email is off and Settings says so.

import nodemailer, { type Transporter } from 'nodemailer'

let transport: Transporter | null = null
let transportUrl = ''

export function emailFrom(): string | null {
  const from = (process.env.FORMS_EMAIL_FROM || '').trim()
  return process.env.FORMS_SMTP_URL && from ? from : null
}

export async function sendEmail(msg: { to: string; subject: string; body: string }): Promise<void> {
  const url = process.env.FORMS_SMTP_URL || ''
  const from = emailFrom()
  if (!url || !from) throw new Error('Email is not set up: set FORMS_SMTP_URL and FORMS_EMAIL_FROM')
  if (!transport || transportUrl !== url) { transport = nodemailer.createTransport(url); transportUrl = url }
  await transport.sendMail({ from, to: msg.to, subject: msg.subject, text: msg.body })
}
