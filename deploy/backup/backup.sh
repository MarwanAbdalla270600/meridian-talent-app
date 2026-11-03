#!/bin/sh
# Usage: backup.sh schedule   – run daily at BACKUP_HOUR_UTC (default 01:00 UTC)
#        backup.sh once       – create one backup now
set -eu

: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT (age public key) is required}"
RETENTION="${BACKUP_RETENTION_DAYS:-14}"
DIR=/backups

log() { printf '{"time":"%s","level":"%s","msg":"%s"}\n' "$(date -u +%FT%TZ)" "$1" "$2"; }

run_backup() {
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  out="$DIR/meridian-$ts.dump.age"
  if pg_dump --format=custom --no-owner --no-privileges | age -r "$BACKUP_AGE_RECIPIENT" > "$out.tmp"; then
    mv "$out.tmp" "$out"
    sha256sum "$out" > "$out.sha256"
    log info "backup written $(basename "$out") ($(wc -c < "$out") bytes)"
  else
    rm -f "$out.tmp"
    log error "backup failed"
    return 1
  fi
  find "$DIR" -name 'meridian-*.dump.age*' -type f -mtime "+$RETENTION" -print -delete | while read -r f; do log info "pruned $(basename "$f")"; done
}

case "${1:-schedule}" in
  once) run_backup ;;
  schedule)
    hour="${BACKUP_HOUR_UTC:-1}"
    log info "backup scheduler started (daily at ${hour}:00 UTC, retention ${RETENTION} days)"
    while true; do
      now=$(date -u +%s)
      next=$(date -u -d "today ${hour}:00" +%s)
      [ "$next" -le "$now" ] && next=$(date -u -d "tomorrow ${hour}:00" +%s)
      sleep $((next - now))
      run_backup || true
    done
    ;;
  *) echo "usage: backup.sh [schedule|once]" >&2; exit 2 ;;
esac
