#!/usr/bin/env bash

set -euo pipefail

MARKER_PATH="${1:-}"
GIT_EXECUTABLE="${GIT_EXECUTABLE:-git}"

if [ -z "$MARKER_PATH" ]; then
  echo "A current-main marker path is required."
  exit 1
fi

if [ -z "${DEPLOY_SHA:-}" ] || [[ ! "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "DEPLOY_SHA must be the full lowercase commit SHA selected for deployment."
  exit 1
fi

if [ -z "${REPOSITORY_URL:-}" ]; then
  echo "REPOSITORY_URL is required to confirm the deployment head."
  exit 1
fi

if [ -z "${GITEA_JOB_TOKEN:-}" ]; then
  echo "GITEA_JOB_TOKEN is required to confirm the deployment head."
  exit 1
fi

rm -f "$MARKER_PATH"

AUTH_HEADER="$({
  printf 'x-access-token:%s' "$GITEA_JOB_TOKEN" |
    base64 -w0
})"

CURRENT_MAIN_LINE="$(
  "$GIT_EXECUTABLE" \
    -c "http.extraHeader=Authorization: Basic ${AUTH_HEADER}" \
    ls-remote --exit-code "$REPOSITORY_URL" refs/heads/main
)"
CURRENT_MAIN_SHA="${CURRENT_MAIN_LINE%%[[:space:]]*}"

if [[ ! "$CURRENT_MAIN_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "The current main branch did not resolve to a full lowercase commit SHA."
  exit 1
fi

if [ "$CURRENT_MAIN_SHA" != "$DEPLOY_SHA" ]; then
  echo "Skipping stale production deployment."
  echo "Run commit:     $DEPLOY_SHA"
  echo "Current main:   $CURRENT_MAIN_SHA"
  exit 0
fi

touch "$MARKER_PATH"
echo "Confirmed current main deployment commit: $DEPLOY_SHA"
