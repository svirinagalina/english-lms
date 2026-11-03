#!/usr/bin/env bash
# Sets up the relay in Germany on a fresh Ubuntu server (Hetzner Cloud,
# Nuremberg) reachable as root with the deploy key. Safe to re-run: the
# secret made on the first run is kept.
#   RELAY_HOST=<ip> ./deploy/relay-de/setup.sh
# Then ./deploy/relay-de/activate.sh hands its address and secret to the app.
set -euo pipefail

RELAY_HOST="${RELAY_HOST:?RELAY_HOST=<the relay server IP>}"
MEDIA_SERVER_IP="${MEDIA_SERVER_IP:-91.239.6.107}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/lms_deploy}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH="ssh -i $SSH_KEY -o BatchMode=yes -o StrictHostKeyChecking=accept-new root@$RELAY_HOST"

echo "==> Installing coturn and the firewall"
$SSH 'export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq coturn ufw openssl >/dev/null'

echo "==> Writing /etc/turnserver.conf"
# The secret is made on the relay and never leaves the servers.
$SSH "test -s /etc/turnserver.secret || (umask 077; openssl rand -hex 32 > /etc/turnserver.secret)"
sed "s/__MEDIA_SERVER_IP__/$MEDIA_SERVER_IP/" "$HERE/turnserver.conf" | $SSH 'umask 077; sed "s/__SECRET__/$(cat /etc/turnserver.secret)/" > /etc/turnserver.conf; chown root:turnserver /etc/turnserver.conf 2>/dev/null; chmod 640 /etc/turnserver.conf'

echo "==> Firewall: ssh, TURN from anyone, relayed media only from the media server"
$SSH "ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 3478/udp >/dev/null
ufw allow from $MEDIA_SERVER_IP to any port 49160:49400 proto udp >/dev/null
ufw --force enable >/dev/null
ufw status | sed -n '1,12p'"

echo "==> Starting coturn"
$SSH 'sed -i "s/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/" /etc/default/coturn 2>/dev/null || true
systemctl enable -q coturn && systemctl restart coturn && sleep 1 && systemctl is-active coturn && ss -ulnp | grep -c ":3478 " | sed "s/^/udp 3478 sockets: /"'

echo "==> Done. Next: RELAY_HOST=$RELAY_HOST ./deploy/relay-de/activate.sh"
