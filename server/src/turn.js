// The name the TURN relay answers to on 443 (Caddy's TLS listener hands it
// to coturn, 2026-10-19): TURN_TLS_HOST, else srv3's sslip name for an IP
// (91.239.6.107 → turn.91-239-6-107.sslip.io), else none.
export function turnTlsHost(host, env = process.env) {
  if (env.TURN_TLS_HOST) return env.TURN_TLS_HOST
  return /^\d+\.\d+\.\d+\.\d+$/.test(host ?? '') ? `turn.${host.replace(/\./g, '-')}.sslip.io` : null
}
