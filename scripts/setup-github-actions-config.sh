#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck source=scripts/load-env-file.sh
source "$SCRIPT_DIR/load-env-file.sh"

DRY_RUN=0
SKIP_FIREBASE_CREDS=0
ENV_FILE="$ROOT_DIR/.env"
REPO=""

usage() {
  cat <<'USAGE'
Usage: scripts/setup-github-actions-config.sh [options]

Options:
  --dry-run                 Show key names that would be set; do not call gh.
  --repo OWNER/REPO         Target repository for gh variable/secret commands.
  --env-file PATH           Env file to load. Defaults to .env.
  --skip-firebase-creds     Do not set Firebase credential secrets.
  --help                    Show this help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --repo)
      REPO="${2:-}"
      [[ -n "$REPO" ]] || { echo "--repo requires OWNER/REPO" >&2; exit 1; }
      shift 2
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      [[ -n "$ENV_FILE" ]] || { echo "--env-file requires a path" >&2; exit 1; }
      shift 2
      ;;
    --skip-firebase-creds)
      SKIP_FIREBASE_CREDS=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$ENV_FILE" != /* ]]; then
  ENV_FILE="$ROOT_DIR/$ENV_FILE"
fi

load_env_file "$ENV_FILE"

repo_args=()
if [[ -n "$REPO" ]]; then
  repo_args=(--repo "$REPO")
fi

variable_keys=(
  FIREBASE_PROJECT_ID
  FIRESTORE_DATABASE_ID
  FIREBASE_USE_APPLICATION_DEFAULT
  VITE_FIREBASE_API_KEY
  VITE_FIREBASE_AUTH_DOMAIN
  VITE_FIREBASE_PROJECT_ID
  VITE_FIREBASE_STORAGE_BUCKET
  VITE_FIREBASE_MESSAGING_SENDER_ID
  VITE_FIREBASE_APP_ID
  VITE_FIREBASE_MEASUREMENT_ID
  VITE_ADMIN_EMAILS
  VITE_API_BASE_URL
  VITE_SCHEDULER_API
  R2_ACCOUNT_ID
  R2_BUCKET
  R2_ENDPOINT
  R2_PUBLIC_BASE_URL
  YAHOO_SVC_URL
  PIPELINE_DTE_MIN
  PIPELINE_DTE_MAX
  PIPELINE_CONCURRENCY
  WATCHLIST
  SMTP_HOST
  SMTP_PORT
  EMAIL_FROM
  EMAIL_RECIPIENTS
  SENTIMENT_ENABLED
  SENTIMENT_CACHE_MAX_AGE_MINUTES
  CLAUDE_SENTIMENT_ENABLED
  CLAUDE_SENTIMENT_WEIGHT
  GROK_SENTIMENT_ENABLED
  GROK_SENTIMENT_WEIGHT
  GEMINI_SENTIMENT_ENABLED
  GEMINI_SENTIMENT_WEIGHT
  REDDIT_SENTIMENT_ENABLED
  REDDIT_SENTIMENT_WEIGHT
)

secret_keys=(
  ALPACA_API_KEY
  ALPACA_SECRET_KEY
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  SMTP_USER
  SMTP_PASS
  XAI_API_KEY
  GEMINI_API_KEY
  FIREBASE_CREDENTIALS_JSON
  FIREBASE_CREDENTIALS_BASE64
)

set_variable() {
  local key="$1"
  local value="${!key-}"
  [[ -n "$value" ]] || return 0

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] would set GitHub variable $key"
  else
    gh variable set "$key" --body "$value" "${repo_args[@]}" >/dev/null
    echo "Set GitHub variable $key"
  fi
}

set_secret() {
  local key="$1"
  local value="${!key-}"
  [[ -n "$value" ]] || return 0

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] would set GitHub secret $key"
  else
    printf '%s' "$value" | gh secret set "$key" "${repo_args[@]}" >/dev/null
    echo "Set GitHub secret $key"
  fi
}

for key in "${variable_keys[@]}"; do
  set_variable "$key"
done

for key in "${secret_keys[@]}"; do
  if [[ "$SKIP_FIREBASE_CREDS" -eq 1 && "$key" == FIREBASE_CREDENTIALS_* ]]; then
    continue
  fi
  set_secret "$key"
done

echo "GitHub Actions config sync complete. Secret values were not printed."
