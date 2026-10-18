#!/bin/bash
# Nightly backup of the LMS on srv3: a database dump plus the uploaded
# images, kept for 30 days under /opt/srv3/backups. Installed by
# deploy/install-backup.sh; run by root's cron at 03:30 server time.
#
# Each file is written under a .part name, checked, and only then renamed to
# its final name — a failed pg_dump (pipefail) or a broken archive never
# leaves something that looks like a good backup. A failure exits non-zero
# with "backup FAILED" in backup.log.
set -euo pipefail
DIR=/opt/srv3/backups
STAMP=$(date +%Y-%m-%d_%H%M)
DB="$DIR/db_$STAMP.sql.gz"
UP="$DIR/uploads_$STAMP.tar.gz"
mkdir -p "$DIR"
trap 'rm -f "$DB.part" "$UP.part"; echo "backup $STAMP FAILED" >&2' ERR

docker exec srv3-lms-db pg_dump -U lms -d english_lms --clean --if-exists | gzip > "$DB.part"
gzip -t "$DB.part"
# A real dump ends with pg_dump's completion line; a cut-off one does not.
gunzip -c "$DB.part" | tail -n 5 | grep -q 'PostgreSQL database dump complete'
mv "$DB.part" "$DB"

docker run --rm -v srv3_lms_uploads:/uploads:ro -v "$DIR":/backup alpine \
  tar czf "/backup/uploads_$STAMP.tar.gz.part" -C /uploads .
gzip -t "$UP.part"
mv "$UP.part" "$UP"

find "$DIR" -name 'db_*.sql.gz' -mtime +30 -delete
find "$DIR" -name 'uploads_*.tar.gz' -mtime +30 -delete
find "$DIR" -name '*.part' -mtime +1 -delete
echo "backup $STAMP ok: db $(du -h "$DB" | cut -f1), uploads $(du -h "$UP" | cut -f1), total $(du -sh "$DIR" | cut -f1) in $DIR"
