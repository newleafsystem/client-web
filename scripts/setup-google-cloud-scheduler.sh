#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck source=scripts/load-env-file.sh
source "$SCRIPT_DIR/load-env-file.sh"

DRY_RUN=0
ENV_FILE="$ROOT_DIR/.env"
PROJECT=""
REGION=""
API_BASE_URL=""
SERVICE_ACCOUNT=""
TIME_ZONE="America/New_York"

usage() {
  cat <<'USAGE'
Usage: scripts/setup-google-cloud-scheduler.sh [options]

Creates or updates Google Cloud Scheduler jobs for the production backend.
The jobs call api.newleafsystem.com scheduler endpoints. Cloudflare is not used.

Options:
  --dry-run                  Print job names and commands with secret values redacted.
  --env-file PATH            Env file to load. Defaults to .env.
  --project PROJECT_ID       Google Cloud project. Defaults to GCP_PROJECT_ID/FIREBASE_PROJECT_ID.
  --region REGION            Cloud Scheduler region. Defaults to GCP_SCHEDULER_REGION/GCP_REGION/us-central1.
  --api-base-url URL         Backend base URL. Defaults to SCHEDULER_API_BASE_URL.
  --service-account EMAIL    Optional service account for OIDC token.
  --help                     Show this help.

Required environment:
  SCHEDULER_SHARED_SECRET    Sent as X-NewLeaf-Scheduler-Secret. Value is never printed.

Optional environment:
  GCP_SCHEDULER_SERVICE_ACCOUNT
  GCP_SCHEDULER_REGION
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      [[ -n "$ENV_FILE" ]] || { echo "--env-file requires a path" >&2; exit 1; }
      shift 2
      ;;
    --project)
      PROJECT="${2:-}"
      [[ -n "$PROJECT" ]] || { echo "--project requires a project id" >&2; exit 1; }
      shift 2
      ;;
    --region)
      REGION="${2:-}"
      [[ -n "$REGION" ]] || { echo "--region requires a region" >&2; exit 1; }
      shift 2
      ;;
    --api-base-url)
      API_BASE_URL="${2:-}"
      [[ -n "$API_BASE_URL" ]] || { echo "--api-base-url requires a URL" >&2; exit 1; }
      shift 2
      ;;
    --service-account)
      SERVICE_ACCOUNT="${2:-}"
      [[ -n "$SERVICE_ACCOUNT" ]] || { echo "--service-account requires an email" >&2; exit 1; }
      shift 2
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

PROJECT="${PROJECT:-${GCP_PROJECT_ID:-${FIREBASE_PROJECT_ID:-}}}"
REGION="${REGION:-${GCP_SCHEDULER_REGION:-${GCP_REGION:-us-central1}}}"
API_BASE_URL="${API_BASE_URL:-${SCHEDULER_API_BASE_URL:-https://api.newleafsystem.com}}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-${GCP_SCHEDULER_SERVICE_ACCOUNT:-}}"
SCHEDULER_SHARED_SECRET="${SCHEDULER_SHARED_SECRET:-}"

if [[ -z "$PROJECT" ]]; then
  echo "GCP project is required. Set GCP_PROJECT_ID/FIREBASE_PROJECT_ID or pass --project." >&2
  exit 1
fi

if [[ -z "$SCHEDULER_SHARED_SECRET" ]]; then
  echo "SCHEDULER_SHARED_SECRET is required and will not be printed." >&2
  exit 1
fi

API_BASE_URL="${API_BASE_URL%/}"

run_gcloud() {
  local -a command=("$@")
  if [[ "$DRY_RUN" -eq 1 ]]; then
    local rendered=()
    for part in "${command[@]}"; do
      if [[ "$part" == X-NewLeaf-Scheduler-Secret=* ]]; then
        rendered+=("X-NewLeaf-Scheduler-Secret=<redacted>")
      else
        rendered+=("$part")
      fi
    done
    printf '[dry-run]'
    printf ' %q' "${rendered[@]}"
    printf '\n'
  else
    if ! "${command[@]}" >/dev/null; then
      echo "Google Cloud Scheduler command failed. Secret values were not printed." >&2
      return 1
    fi
  fi
}

upsert_job() {
  local name="$1"
  local schedule="$2"
  local path="$3"
  local description="$4"
  local uri="${API_BASE_URL}${path}"

  local -a common_args=(
    "$name"
    --project "$PROJECT"
    --location "$REGION"
    --schedule "$schedule"
    --time-zone "$TIME_ZONE"
    --uri "$uri"
    --http-method POST
    --attempt-deadline 1800s
    --max-retry-attempts 1
    --description "$description"
  )

  if [[ -n "$SERVICE_ACCOUNT" ]]; then
    common_args+=(--oidc-service-account-email "$SERVICE_ACCOUNT" --oidc-token-audience "$API_BASE_URL")
  fi

  if [[ "$DRY_RUN" -eq 0 ]] && gcloud scheduler jobs describe "$name" --project "$PROJECT" --location "$REGION" >/dev/null 2>&1; then
    run_gcloud gcloud scheduler jobs update http "${common_args[@]}" \
      --update-headers "X-NewLeaf-Scheduler-Secret=${SCHEDULER_SHARED_SECRET}"
  else
    run_gcloud gcloud scheduler jobs create http "${common_args[@]}" \
      --headers "X-NewLeaf-Scheduler-Secret=${SCHEDULER_SHARED_SECRET}"
  fi
}

upsert_job \
  "newleaf-scanner-fast" \
  "*/15 9-16 * * 1-5" \
  "/api/internal/scheduler/scanner-fast" \
  "NewLeaf intraday scanner. Backend rechecks market hours before execution."

upsert_job \
  "newleaf-scanner-daily-catchup" \
  "*/15 9-16 * * 1-5" \
  "/api/internal/scheduler/scanner-daily-catchup" \
  "NewLeaf daily OI/watchlist/Firestore catch-up with durable Firestore markers."

echo "Google Cloud Scheduler setup complete. Secret values were not printed."
