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

export function sendPasswordResetEmail({ to, name, link }) {
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
  <h1 style="font-size:20px;margin:0 0 16px">Hello, ${escapeHtml(name)}</h1>
  <p style="font-size:15px;line-height:1.55;margin:0 0 24px">Someone asked to reset the password for your Advent Academy account. If it was you, choose a new password here — the link works for one hour.</p>
  <p style="margin:0 0 24px">
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#14453f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px">Set a new password</a>
  </p>
  <p style="font-size:13px;color:#666;line-height:1.5;margin:0">If you did not ask for this, ignore this letter — your password stays as it is.</p>
</div>`
  const text = `Someone asked to reset the password for your Advent Academy account. If it was you, open this link within an hour: ${link}\nIf not, ignore this letter.`
  return send({ to, subject: 'Reset your Advent Academy password', html, text })
}

// The trial-lesson report, sent when the teacher publishes it.
export function sendTrialReportEmail({ to, name, level, summary, reportLink, paymentLink }) {
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#14453f">
  <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#b5539a;font-weight:700">Advent Academy</div>
  <h1 style="font-size:22px;margin:8px 0 16px">${escapeHtml(name)}, ваш отчёт по пробному уроку готов</h1>
  ${level ? `<p style="font-size:15px;line-height:1.55;margin:0 0 12px">Ваш уровень сейчас: <strong>${escapeHtml(level)}</strong>.</p>` : ''}
  ${summary ? `<p style="font-size:15px;line-height:1.55;margin:0 0 20px">${escapeHtml(summary)}</p>` : ''}
  <p style="margin:0 0 12px">
    <a href="${escapeHtml(reportLink)}" style="display:inline-block;background:#14453f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px">Открыть отчёт и план</a>
  </p>
  <p style="margin:0 0 24px">
    <a href="${escapeHtml(paymentLink)}" style="display:inline-block;background:#f4b9d9;color:#14453f;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px">Перейти к оплате</a>
  </p>
  <p style="font-size:13px;color:#5f7a74;line-height:1.5;margin:0">В отчёте — что уже получается, темы для внимания, рекомендации и план на первый месяц. Скидка 5% на первую покупку действует 3 дня.</p>
</div>`
  const text = `${name}, ваш отчёт по пробному уроку готов.${level ? ` Ваш уровень сейчас: ${level}.` : ''}\n${summary}\n\nОткрыть отчёт: ${reportLink}\nПерейти к оплате: ${paymentLink}\n\nСкидка 5% на первую покупку действует 3 дня.`
  return send({ to, subject: 'Ваш отчёт по пробному уроку — Advent Academy', html, text })
}
