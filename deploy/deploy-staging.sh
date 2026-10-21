#!/usr/bin/env bash
# Puts the code of this checkout on the test copy (deploy/staging/), whatever
# the branch: try a change there before ./deploy/deploy.sh takes it to students.
# Restarting the test copy touches no lesson, so there is no lesson check.
set -euo pipefail

SSH_KEY="${SSH_KEY:-$HOME/.ssh/lms_deploy}"
REMOTE="${SSH_USER:-root}@${SSH_HOST:-91.239.6.107}"
DIR=/opt/lms-staging
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_CMD="ssh -i $SSH_KEY -o BatchMode=yes -o StrictHostKeyChecking=accept-new"

echo "==> Building the client ($(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD) @ $(git -C "$PROJECT_ROOT" rev-parse --short HEAD))"
npm --prefix "$PROJECT_ROOT/client" run build

echo "==> Uploading"
$SSH_CMD "$REMOTE" "mkdir -p $DIR/app/public"
rsync -az -e "$SSH_CMD" "$PROJECT_ROOT/deploy/staging/docker-compose.yml" "$REMOTE:$DIR/"
rsync -az --delete -e "$SSH_CMD" \
  --exclude node_modules --exclude .env --exclude .env.example --exclude public --exclude diag --exclude uploads \
  "$PROJECT_ROOT/server/" "$REMOTE:$DIR/app/"
rsync -az --delete -e "$SSH_CMD" "$PROJECT_ROOT/client/dist/" "$REMOTE:$DIR/app/public/"

echo "==> Rebuilding and restarting the test copy"
$SSH_CMD "$REMOTE" "cd $DIR && docker compose up -d --build staging-app"
# The app runs as uid 1000; fresh volumes are root's.
$SSH_CMD "$REMOTE" "docker run --rm -v lms-staging_staging_uploads:/u -v lms-staging_staging_diag:/d alpine chown -R 1000:1000 /u /d"

echo "==> Health check"
sleep 5
curl -fsS --max-time 20 https://lms-test.91-239-6-107.sslip.io/api/health && echo " — OK"
