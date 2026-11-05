// One-time setup: gets the refresh token the LMS uses to write to Google Drive.
//   GOOGLE_DRIVE_CLIENT_ID=… GOOGLE_DRIVE_CLIENT_SECRET=… node scripts/google-drive-auth.js
// Open the printed link, sign in with the Google account that owns the Drive
// folder, and copy the GOOGLE_DRIVE_REFRESH_TOKEN line into server/.env.
import http from 'http'

const id = process.env.GOOGLE_DRIVE_CLIENT_ID
const secret = process.env.GOOGLE_DRIVE_CLIENT_SECRET
if (!id || !secret) {
  console.error('Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET first.')
  process.exit(1)
}
const redirect = 'http://localhost:53682/callback'
const link = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: id,
  redirect_uri: redirect,
  response_type: 'code',
  scope: 'https://www.googleapis.com/auth/drive.file',
  access_type: 'offline',
  prompt: 'consent'
})
console.log('\nOpen this link and sign in with the Google account that owns the Drive:\n\n' + link + '\n')

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, redirect)
  if (url.pathname !== '/callback') { res.writeHead(404).end(); return }
  const code = url.searchParams.get('code')
  if (!code) {
    res.end('Не получилось: ' + (url.searchParams.get('error') ?? 'нет кода'))
    console.error('No code returned:', url.searchParams.get('error'))
    server.close()
    return
  }
  const tokens = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: 'authorization_code' })
  }).then((r) => r.json())
  if (!tokens.refresh_token) {
    res.end('Refresh token не пришёл. Попробуйте ещё раз.')
    console.error('No refresh token in the answer:', tokens.error ?? tokens)
  } else {
    res.end('Готово, можно закрыть вкладку. Токен — в терминале.')
    console.log('Add this line to server/.env:\n\nGOOGLE_DRIVE_REFRESH_TOKEN=' + tokens.refresh_token + '\n')
  }
  server.close()
})
server.listen(53682, () => console.log('Waiting for the sign-in on http://localhost:53682 …'))
