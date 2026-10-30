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

# This script ships whatever this checkout holds, so a checkout on an old
# branch rolls production back: on 2026-10-30 a branch started on 10-22 went
# out and a week of main (board icons, the shared-screen window, …)
# disappeared. Refuse unless HEAD contains the latest origin/main.
# STALE_OK=1 overrides (only for a deliberate rollback).
if [ "${STALE_OK:-0}" != "1" ]; then
  if ! git -C "$PROJECT_ROOT" fetch -q origin main 2>/dev/null; then
    echo "!! Could not fetch origin/main to check this checkout is up to date. Fix the connection, or run with STALE_OK=1."
    exit 1
  fi
  if ! git -C "$PROJECT_ROOT" merge-base --is-ancestor origin/main HEAD; then
    BEHIND=$(git -C "$PROJECT_ROOT" rev-list --count HEAD..origin/main)
    echo "!! This checkout ($(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD)) is missing $BEHIND commit(s) of origin/main."
    echo "!! Deploying it would take them off the site. Merge origin/main into this branch first:"
    echo "!!   git fetch origin && git merge origin/main"
    echo "!! (STALE_OK=1 deploys anyway — only for a deliberate rollback.)"
    exit 1
  fi
fi

# A deploy restarts the server and drops every call in progress (it cut a
# lesson on 2026-10-05). Refuse while anyone was in a call in the last 3
# minutes — call pages report to the diag log every 30 s. FORCE=1 overrides.
if [ "${FORCE:-0}" != "1" ]; then
  # Call pages report every 30 s with "peers":N — someone alone in a
  # forgotten tab (peers 0) is not a lesson.
  BUSY=$($SSH_CMD "$REMOTE" 'docker exec srv3-lms-app sh -c "cat /app/diag/diag-$(date +%Y-%m).log /app/uploads/diag/diag-$(date +%Y-%m).log 2>/dev/null | grep -v diag-thumb | grep \" call=\" | tail -200"' 2>/dev/null | python3 -c '
import sys, re, datetime
now = datetime.datetime.now(datetime.timezone.utc)
for line in sys.stdin:
    m = re.match(r"(\S+?)(?:\.\d+)?Z ", line)
    p = re.search(r"\"peers\":(\d+)", line)
    if not m or not p: continue
    t = datetime.datetime.fromisoformat(m.group(1)).replace(tzinfo=datetime.timezone.utc)
    if (now - t).total_seconds() < 180 and int(p.group(1)) > 0:
        print(line[:24]); break
' || true)
  if [ -n "$BUSY" ]; then
    echo "!! A lesson is in progress (someone was in a call with others at $BUSY UTC). Deploying now would drop it."
    echo "!! Wait until the lesson ends, or run with FORCE=1."
    exit 1
  fi
fi

echo "==> Building the client"
npm --prefix "$PROJECT_ROOT/client" run build

echo "==> Uploading server"
rsync -az --delete -e "$SSH_CMD" \
  --exclude node_modules --exclude .env --exclude .env.example --exclude public --exclude diag --exclude uploads \
  "$PROJECT_ROOT/server/" "$REMOTE:$APP_DIR/"

echo "==> Uploading built client"
rsync -az --delete -e "$SSH_CMD" \
  "$PROJECT_ROOT/client/dist/" "$REMOTE:$APP_DIR/public/"

echo "==> Rebuilding and restarting"
$SSH_CMD "$REMOTE" 'cd /opt/srv3 && docker compose up -d --build lms-app'

echo "==> Health check"
sleep 5
curl -fsS --max-time 20 https://lms.advent-academy.online/api/health && echo " — OK"
