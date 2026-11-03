#!/bin/sh
# Restore an encrypted backup into the database configured via PG* variables.
# Usage: restore.sh /backups/meridian-<ts>.dump.age /path/to/age-identity.txt [target_db]
# WARNING: --clean drops and recreates objects in the target database.
set -eu
file="${1:?backup file}"
identity="${2:?age identity (private key) file}"
target="${3:-$PGDATABASE}"
if [ -f "$file.sha256" ]; then
  (cd "$(dirname "$file")" && sha256sum -c "$(basename "$file").sha256")
fi
age -d -i "$identity" "$file" | pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error -d "$target"
echo "restore of $(basename "$file") into $target completed"
