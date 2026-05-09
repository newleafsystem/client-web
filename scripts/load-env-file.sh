#!/usr/bin/env bash

# Source this file and call load_env_file <path> to export values from a dotenv
# file without executing it as shell code.

trim_env_value() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

unquote_env_value() {
  local value
  value="$(trim_env_value "$1")"

  if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
    value="${value:1:${#value}-2}"
    value="${value//\\n/$'\n'}"
    value="${value//\\r/$'\r'}"
    value="${value//\\\"/\"}"
    value="${value//\\\\/\\}"
  elif [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
    value="${value:1:${#value}-2}"
  fi

  printf '%s' "$value"
}

load_env_file() {
  local env_file="${1:-.env}"

  if [[ ! -f "$env_file" ]]; then
    echo "Env file not found: $env_file" >&2
    return 1
  fi

  while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
    local line key value
    line="$(trim_env_value "$raw_line")"
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" == export\ * ]] && line="$(trim_env_value "${line#export }")"
    [[ "$line" != *=* ]] && continue

    key="$(trim_env_value "${line%%=*}")"
    value="${line#*=}"

    if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      continue
    fi

    printf -v "$key" '%s' "$(unquote_env_value "$value")"
    export "$key"
  done < "$env_file"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  env_file="${1:-.env}"
  load_env_file "$env_file"
  echo "Loaded env key names from $env_file:"
  while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
    line="$(trim_env_value "$raw_line")"
    [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
    key="$(trim_env_value "${line%%=*}")"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && echo "$key"
  done < "$env_file"
fi
