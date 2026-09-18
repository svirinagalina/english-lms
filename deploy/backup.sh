#!/bin/sh
# Nightly backup of the LMS on srv3: a database dump plus the uploaded
# images, kept for 30 days under /opt/srv3/backups. Installed by
# deploy/install-backup.sh; run by root's cron at 03:30 server time.
set -eu
DIR=/opt/srv3/backups
STAMP=$(date +%Y-%m-%d_%H%M)
mkdir -p "$DIR"
docker exec srv3-lms-db pg_dump -U lms -d english_lms --clean --if-exists | gzip > "$DIR/db_$STAMP.sql.gz"
docker run --rm -v srv3_lms_uploads:/uploads:ro -v "$DIR":/backup alpine \
  tar czf "/backup/uploads_$STAMP.tar.gz" -C /uploads .
find "$DIR" -name 'db_*.sql.gz' -mtime +30 -delete
find "$DIR" -name 'uploads_*.tar.gz' -mtime +30 -delete
echo "backup $STAMP ok: $(du -sh "$DIR" | cut -f1) in $DIR"
