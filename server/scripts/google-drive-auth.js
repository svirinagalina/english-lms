// One-time setup: gets the refresh token the LMS uses to write to Google Drive,
// and creates the Drive folder for the copies.
//   node scripts/google-drive-auth.js ~/Downloads/client_secret_….json
// Open the printed link and sign in with the Google account whose Drive to use.
// All four GOOGLE_DRIVE_* lines land in lms-drive.env next to the JSON file, so
// no secret is printed to the terminal. The folder has to be created here: the
// drive.file scope cannot see a folder made by hand in Drive.
import fs from 'fs'
import http from 'http'
import path from 'path'

const clientFile = process.argv[2]
if (!clientFile) {
  console.error('Usage: node scripts/google-drive-auth.js <client_secret JSON from Google Cloud>')
  process.exit(1)
}
const { web } = JSON.parse(fs.readFileSync(clientFile, 'utf8'))
const id = web?.client_id
const secret = web?.client_secret
if (!id || !secret) {
  console.error('This is not a Web application client file.')
  process.exit(1)
}
const envFile = path.join(path.dirname(path.resolve(clientFile)), 'lms-drive.env')
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
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
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
    console.error('No refresh token in the answer:', tokens.error ?? 'unknown')
  } else {
    const folder = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'English LMS', mimeType: 'application/vnd.google-apps.folder' })
    }).then((r) => r.json())
    if (folder.id) {
      const lines = [`GOOGLE_DRIVE_CLIENT_ID=${id}`, `GOOGLE_DRIVE_CLIENT_SECRET=${secret}`, `GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`, `GOOGLE_DRIVE_FOLDER_ID=${folder.id}`]
      fs.writeFileSync(envFile, lines.join('\n') + '\n', { mode: 0o600 })
      res.end('Готово, можно закрыть вкладку.')
      console.log('Saved to ' + envFile)
    } else {
      res.end('Доступ получен, но папка не создалась. Смотрите терминал.')
      console.error('Folder not created:', folder.error ?? 'unknown')
    }
  }
  server.close()
})
server.listen(53682, () => console.log('Waiting for the sign-in on http://localhost:53682 …'))
