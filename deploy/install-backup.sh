#!/bin/sh
# Copies backup.sh and backup-library.sh to srv3 and schedules them nightly.
# Safe to run again.
set -eu
HOST=root@91.239.6.107
KEY=~/.ssh/lms_deploy
scp -i "$KEY" "$(dirname "$0")/backup.sh" "$(dirname "$0")/backup-library.sh" "$HOST:/opt/srv3/"
ssh -i "$KEY" "$HOST" 'chmod +x /opt/srv3/backup.sh /opt/srv3/backup-library.sh
  ( crontab -l 2>/dev/null | grep -v -e /opt/srv3/backup.sh -e /opt/srv3/backup-library.sh
    echo "30 3 * * * /opt/srv3/backup.sh >> /opt/srv3/backups/backup.log 2>&1"
    echo "40 4 * * * /opt/srv3/backup-library.sh >> /opt/srv3/backups/library.log 2>&1" ) | crontab -
  mkdir -p /opt/srv3/backups && /opt/srv3/backup-library.sh && /opt/srv3/backup.sh && crontab -l'
