#!/bin/bash
# Offsite copy of the textbook library on srv3: every PDF and audio file goes to
# Wasabi once. The files never change (each has a random name of its own), so
# unlike the nightly archive this costs their size one time, not every night.
# A file a teacher deletes stays in the bucket.
#
# To restore: aws s3 sync s3://<bucket>/srv3-lms/library/<folder> into the same
# folder of the uploads volume; the database dump already points at these names.
#
# Installed by deploy/install-backup.sh; run by root's cron at 04:40 server time.
# Keys come from /opt/srv3/offsite.env, the file offsite-backup.sh reads.
set -euo pipefail
UPLOADS=/var/lib/docker/volumes/srv3_lms_uploads/_data
AWS=/opt/srv3/awsenv/bin/aws
set -a; . /opt/srv3/offsite.env; set +a
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-eu-central-1}"
trap 'echo "[$(date -u +%FT%TZ)] library backup FAILED" >&2' ERR

for folder in textbooks textbook-audio; do
  [ -d "$UPLOADS/$folder" ] || continue
  "$AWS" --endpoint-url "$S3_ENDPOINT" s3 sync --only-show-errors "$UPLOADS/$folder" "s3://$S3_BUCKET/srv3-lms/library/$folder"
done
echo "[$(date -u +%FT%TZ)] library backup ok: $(du -sh "$UPLOADS/textbooks" "$UPLOADS/textbook-audio" 2>/dev/null | awk '{print $2 "=" $1}' | sed "s|$UPLOADS/||" | tr '\n' ' ')"
