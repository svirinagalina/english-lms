# The relay in Germany

Why (2026-11-03): srv3 (Host.AL, Tirana) reaches Deutsche Telekom only through
Cogent, and the Cogent → Telekom link loses a lot every evening — RIPE Atlas
anchors, a week of pings: Cogent → Telekom 1.5–2% by day, 12–13% from 18 to
22 CET on average; Hetzner, netcup, myLoc, OVH, DigitalOcean, Vultr →
Telekom 0%. A student on Telekom (Lubov) lost 30–50% of the sound coming to
her in every evening lesson while her own sound reached us clean; Zoom worked.
srv3 → Hetzner Nuremberg is clean too (0%, 29 ms).

So a call whose incoming sound keeps getting lost (≥15% for 40 s, video
already off) joins the media server again through this relay (Call.jsx,
`sfuRelaySwitchRef`): LiveKit on srv3 → Hetzner → the student. If the loss
stays there, it goes back and doesn't try again for a week.

The server: Hetzner Cloud, Nuremberg, the smallest x86 type, Ubuntu 24.04,
public IPv4, the deploy key (`~/.ssh/lms_deploy.pub`) as its SSH key.
coturn, UDP only, relays only to srv3 (`allowed-peer-ip`); the firewall lets
relayed media in only from srv3.

1. `RELAY_HOST=<ip> ./deploy/relay-de/setup.sh` — coturn, config, firewall.
2. `RELAY_HOST=<ip> ./deploy/relay-de/activate.sh` — between lessons: adds
   `RELAY_TURN_HOST` / `RELAY_TURN_SECRET` to the app (compose + `.env` on
   srv3, backups `*.bak.<ts>`) and restarts it. Without them `/calls/ice`
   returns `lossRelay: null` and nothing changes.

Check in the diag log: `sfu.relay switched|back`, `sfu.on {relay:true}`,
`net.health.path` `relay/udp/udp`.
