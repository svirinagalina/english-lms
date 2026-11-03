#!/usr/bin/env bash
# Hands the relay's address and secret to the app on srv3 and restarts the
# app (calls drop for a moment — so not during a lesson; FORCE=1 overrides).
# The secret goes from server to server and is never printed.
#   RELAY_HOST=<ip> ./deploy/relay-de/activate.sh
set -euo pipefail

RELAY_HOST="${RELAY_HOST:?RELAY_HOST=<the relay server IP>}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/lms_deploy}"
SSH_OPTS="-i $SSH_KEY -o BatchMode=yes -o StrictHostKeyChecking=accept-new"
SRV3="ssh $SSH_OPTS root@91.239.6.107"
RELAY="ssh $SSH_OPTS root@$RELAY_HOST"

if [ "${FORCE:-0}" != "1" ]; then
  BUSY=$($SRV3 'docker logs --since 3m srv3-lms-app 2>&1 | grep "\[diag\]" | grep " call=" | grep -vc "\"peers\":0"' || true)
  if [ "${BUSY:-0}" != "0" ]; then
    echo "!! A lesson is in progress — restarting the app now would drop it. Run again after it, or with FORCE=1."
    exit 1
  fi
fi

echo "==> docker-compose.yml: pass RELAY_TURN_HOST / RELAY_TURN_SECRET to the app"
$SRV3 'cd /opt/srv3 && if ! grep -q RELAY_TURN_HOST docker-compose.yml; then
  cp docker-compose.yml docker-compose.yml.bak.$(date +%s)
  sed -i -E "s/^( *)TURN_HOST: \\$\\{TURN_HOST:-\\}$/&\n\1RELAY_TURN_HOST: \${RELAY_TURN_HOST:-}\n\1RELAY_TURN_SECRET: \${RELAY_TURN_SECRET:-}/" docker-compose.yml
fi
grep -c "RELAY_TURN_" docker-compose.yml | sed "s/^/compose lines: /"'

echo "==> .env: the relay address and its secret"
$RELAY 'cat /etc/turnserver.secret' | $SRV3 "cd /opt/srv3 && cp .env .env.bak.\$(date +%s) && sed -i -E '/^RELAY_TURN_(HOST|SECRET)=/d' .env && { echo 'RELAY_TURN_HOST=$RELAY_HOST'; printf 'RELAY_TURN_SECRET=%s\n' \"\$(cat)\"; } >> .env && grep -c '^RELAY_TURN_' .env | sed 's/^/env lines: /'"

echo "==> Restarting the app with the new settings"
$SRV3 'cd /opt/srv3 && docker compose up -d lms-app 2>&1 | tail -3'
sleep 5
curl -fsS --max-time 20 https://lms.advent-academy.online/api/health && echo " — OK"
$SRV3 'docker exec srv3-lms-app sh -c "test -n \"\$RELAY_TURN_HOST\" && test -n \"\$RELAY_TURN_SECRET\" && echo relay settings: present"'
