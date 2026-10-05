#!/usr/bin/env bash
# Deploys the LMS. Safe to re-run.
#
# Note on --delete: the built client lives in server/public on the remote but is
# produced by the client build, not tracked in server/. It must be excluded from
# the server sync, otherwise each deploy wipes it and the image fails to build.
set -euo pipefail

SSH_KEY="${SSH_KEY:-$HOME/.ssh/lms_deploy}"
SSH_USER="${SSH_USER:-root}"
SSH_HOST="${SSH_HOST:-91.239.6.107}"
APP_DIR="${APP_DIR:-/opt/srv3/lms}"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE="$SSH_USER@$SSH_HOST"
SSH_CMD="ssh -i $SSH_KEY -o BatchMode=yes -o StrictHostKeyChecking=accept-new"

# A deploy restarts the server and drops every call in progress (it cut a
# lesson on 2026-10-05). Refuse while anyone was in a call in the last 3
# minutes — call pages report to the diag log every 30 s. FORCE=1 overrides.
if [ "${FORCE:-0}" != "1" ]; then
  LAST=$($SSH_CMD "$REMOTE" 'docker exec srv3-lms-app sh -c "grep -v diag-thumb /app/uploads/diag/diag-$(date +%Y-%m).log 2>/dev/null | grep \" call=\" | tail -1 | cut -c1-24"' 2>/dev/null || true)
  if [ -n "$LAST" ]; then
    AGE=$(( $(date -u +%s) - $(date -u -j -f "%Y-%m-%dT%H:%M:%S" "${LAST%%.*}" +%s 2>/dev/null || date -u -d "${LAST%%.*}" +%s) ))
    if [ "$AGE" -lt 180 ]; then
      echo "!! A call was active ${AGE}s ago (last call diagnostics at $LAST UTC). Deploying now would drop it."
      echo "!! Wait until the lesson ends, or run with FORCE=1."
      exit 1
    fi
  fi
fi

echo "==> Building the client"
npm --prefix "$PROJECT_ROOT/client" run build

echo "==> Uploading server"
rsync -az --delete -e "$SSH_CMD" \
  --exclude node_modules --exclude .env --exclude .env.example --exclude public \
  "$PROJECT_ROOT/server/" "$REMOTE:$APP_DIR/"

echo "==> Uploading built client"
rsync -az --delete -e "$SSH_CMD" \
  "$PROJECT_ROOT/client/dist/" "$REMOTE:$APP_DIR/public/"

echo "==> Rebuilding and restarting"
$SSH_CMD "$REMOTE" 'cd /opt/srv3 && docker compose up -d --build lms-app'

echo "==> Health check"
sleep 5
curl -fsS --max-time 20 https://lms.advent-academy.online/api/health && echo " — OK"
