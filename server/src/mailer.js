// Email delivery through Resend. Without RESEND_API_KEY the app keeps working:
// invitations still produce a link, it just has to be passed on by hand.
const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export const mailEnabled = () => Boolean(process.env.RESEND_API_KEY)

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]))

async function send({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, reason: 'Email is not configured' }

  const from = process.env.MAIL_FROM ?? 'onboarding@resend.dev'

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to, subject, html, text })
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      // Never log the key itself, only what the service objected to.
      console.error('Resend rejected the message:', response.status, body?.message ?? body?.name ?? '')
      return { sent: false, reason: body?.message ?? `Mail service returned ${response.status}` }
    }

    return { sent: true }
  } catch (error) {
    console.error('Could not reach the mail service:', error.message)
    return { sent: false, reason: 'Could not reach the mail service' }
  }
}

export function sendInviteEmail({ to, name, inviterName, schoolName, role, link }) {
  const roleLabel = role === 'TEACHER' ? 'a teacher' : 'a student'

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
  <h1 style="font-size:20px;margin:0 0 16px">Hello, ${escapeHtml(name)}</h1>
  <p style="font-size:15px;line-height:1.55;margin:0 0 16px">
    ${escapeHtml(inviterName)} invited you to join <strong>${escapeHtml(schoolName)}</strong> as ${roleLabel}.
  </p>
  <p style="font-size:15px;line-height:1.55;margin:0 0 24px">
    Follow the link below and choose a password — that is all it takes to set up your account.
  </p>
  <p style="margin:0 0 24px">
    <a href="${escapeHtml(link)}"
       style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px">
      Set up my account
    </a>
  </p>
  <p style="font-size:13px;color:#666;line-height:1.5;margin:0 0 8px">
    The link works once and expires in 14 days.
  </p>
  <p style="font-size:13px;color:#666;line-height:1.5;margin:0">
    If the button does not work, paste this into your browser:<br>
    <span style="word-break:break-all">${escapeHtml(link)}</span>
  </p>
</div>`.trim()

  const text = [
    `Hello, ${name}`,
    '',
    `${inviterName} invited you to join ${schoolName} as ${roleLabel}.`,
    'Open the link below and choose a password to set up your account:',
    '',
    link,
    '',
    'The link works once and expires in 14 days.'
  ].join('\n')

  return send({
    to,
    subject: `${inviterName} invited you to ${schoolName}`,
    html,
    text
  })
}

// A student says they have paid: their teachers get a short note.
export function sendPaymentReportedEmail({ to, studentName, note }) {
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
  <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(studentName)} reports a payment</h1>
  <p style="font-size:15px;line-height:1.55;margin:0 0 16px">
    ${escapeHtml(studentName)} pressed “I have paid” on the platform${note ? ` and wrote: <em>${escapeHtml(note)}</em>` : ''}.
  </p>
  <p style="font-size:15px;line-height:1.55;margin:0 0 16px">
    Check the money has arrived, then set the new package in Payments.
  </p>
</div>`
  const text = `${studentName} pressed "I have paid" on the platform${note ? `: ${note}` : ''}. Check the payment, then set the new package in Payments.`
  return send({ to, subject: `${studentName} reports a payment`, html, text })
}
