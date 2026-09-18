#!/bin/sh
# Copies backup.sh to srv3 and schedules it nightly. Safe to run again.
set -eu
HOST=root@srv3.advent-academy.online
KEY=~/.ssh/lms_deploy
scp -i "$KEY" "$(dirname "$0")/backup.sh" "$HOST:/opt/srv3/backup.sh"
ssh -i "$KEY" "$HOST" 'chmod +x /opt/srv3/backup.sh
  ( crontab -l 2>/dev/null | grep -v /opt/srv3/backup.sh; echo "30 3 * * * /opt/srv3/backup.sh >> /opt/srv3/backups/backup.log 2>&1" ) | crontab -
  mkdir -p /opt/srv3/backups && /opt/srv3/backup.sh && crontab -l'
