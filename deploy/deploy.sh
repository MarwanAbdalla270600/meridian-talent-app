#!/usr/bin/env bash
# Server-side deployment of a release tag (called by GitHub Actions via SSH).
#
#   deploy/deploy.sh v1.2.3
#
# Can also be used as an SSH forced command (authorized_keys: command="…/deploy.sh");
# the tag is then taken from SSH_ORIGINAL_COMMAND. Steps:
#   1. check out the tag (compose file, Caddyfile, backup scripts)
#   2. backup before the update
#   3. pull images, start (migrations run before the API)
#   4. health check; on failure roll back to the previously deployed tag
set -euo pipefail

# Everything lives in main(): bash parses the whole function before running it, so the
# `git checkout` below can safely replace this file while it executes.
main() {
  APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  cd "$APP_DIR"

  TAG="${1:-${SSH_ORIGINAL_COMMAND:-}}"
  TAG="${TAG##* }" # allow "deploy v1.2.3" as forced-command input
  if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
    echo "usage: deploy.sh vX.Y.Z (got: '${TAG}')" >&2
    exit 2
  fi

  ENV_FILE=deploy/.env
  COMPOSE=(docker compose -f deploy/docker-compose.prod.yml)
  [[ -f "$ENV_FILE" ]] || { echo "missing $ENV_FILE" >&2; exit 1; }

  # Only one deployment at a time.
  exec 9>"$APP_DIR/.deploy.lock"
  flock -n 9 || { echo "another deployment is running" >&2; exit 1; }

  log() { printf '[deploy %s] %s\n' "$(date -u +%FT%TZ)" "$*"; }
  current_tag() { sed -n 's/^IMAGE_TAG=//p' "$ENV_FILE"; }
  set_tag() {
    if grep -q '^IMAGE_TAG=' "$ENV_FILE"; then sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$1/" "$ENV_FILE"
    else echo "IMAGE_TAG=$1" >> "$ENV_FILE"; fi
  }
  domain() { sed -n 's/^DOMAIN=//p' "$ENV_FILE"; }

  healthy() {
    local url
    url="https://$(domain)/api/health"
    for _ in $(seq 1 30); do
      if curl -fsS --max-time 5 "$url" | grep -q '"status":"ok"'; then return 0; fi
      sleep 5
    done
    return 1
  }

  start() {
    local tag="$1"
    # Explicit returns: `set -e` does not apply inside functions called from an `if`.
    git fetch --quiet --tags --force origin || return 1
    git checkout --quiet --force "refs/tags/$tag" || return 1
    set_tag "$tag" || return 1
    "${COMPOSE[@]}" pull --quiet || return 1
    "${COMPOSE[@]}" up -d --remove-orphans || return 1
  }

  PREVIOUS="$(current_tag)"
  log "deploying $TAG (currently: ${PREVIOUS:-none})"

  if "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx backup; then
    log "backup before update"
    "${COMPOSE[@]}" exec -T backup backup.sh once
  fi

  if start "$TAG" && healthy; then
    log "deployed $TAG successfully"
    docker image prune -f --filter "until=168h" >/dev/null || true
    exit 0
  fi

  log "health check failed for $TAG"
  "${COMPOSE[@]}" logs --tail 80 api migrate || true
  if [[ -n "$PREVIOUS" && "$PREVIOUS" != "$TAG" && "$PREVIOUS" != "latest" ]]; then
    log "rolling back to $PREVIOUS (note: database migrations are not reverted)"
    if start "$PREVIOUS" && healthy; then
      log "rollback to $PREVIOUS ok"
    else
      log "ROLLBACK FAILED – manual action required"
    fi
  fi
  exit 1
}

main "$@"
