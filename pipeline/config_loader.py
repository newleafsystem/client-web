from __future__ import annotations

import base64
import json
import os
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _parse_env_value(raw: str) -> str:
    value = raw.strip()
    if not value:
        return ""

    quote = value[0]
    if quote in ("'", '"') and value.endswith(quote):
        value = value[1:-1]
        if quote == '"':
            value = (
                value.replace("\\n", "\n")
                .replace("\\r", "\r")
                .replace('\\"', '"')
                .replace("\\\\", "\\")
            )

    return value


def load_env_file(env_file: str | Path | None = None, *, override: bool = False) -> dict[str, str]:
    path = Path(env_file or os.environ.get("NEWLEAF_ENV_FILE") or PROJECT_ROOT / ".env")
    if not path.is_absolute():
        path = PROJECT_ROOT / path

    if not path.exists():
        return {}

    parsed: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, raw_value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue
        parsed[key] = _parse_env_value(raw_value)

    for key, value in parsed.items():
        if override or key not in os.environ:
            os.environ[key] = value

    return parsed


def env(name: str, default: str = "") -> str:
    value = os.environ.get(name)
    return default if value is None or value == "" else value


def bool_env(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def int_env(name: str, default: int | None = None) -> int | None:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    try:
        return int(value)
    except ValueError:
        return default


def list_env(name: str) -> list[str]:
    value = os.environ.get(name, "")
    return [entry.strip() for entry in value.split(",") if entry.strip()]


def resolve_project_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else PROJECT_ROOT / path


def load_firebase_credentials() -> dict[str, Any] | None:
    load_env_file()

    if env("FIREBASE_CREDENTIALS_JSON"):
        return json.loads(env("FIREBASE_CREDENTIALS_JSON"))

    if env("FIREBASE_CREDENTIALS_BASE64"):
        decoded = base64.b64decode(env("FIREBASE_CREDENTIALS_BASE64")).decode("utf-8")
        return json.loads(decoded)

    credentials_file = env("FIREBASE_CREDENTIALS_FILE") or env("GOOGLE_APPLICATION_CREDENTIALS")
    if credentials_file:
        return json.loads(resolve_project_path(credentials_file).read_text(encoding="utf-8"))

    return None


def runtime_config() -> dict[str, Any]:
    load_env_file()

    return {
        "firebase": {
            "projectId": env("FIREBASE_PROJECT_ID"),
            "databaseId": env("FIRESTORE_DATABASE_ID", "newleafdb"),
            "useApplicationDefault": bool_env("FIREBASE_USE_APPLICATION_DEFAULT"),
            "credentialsFile": env("FIREBASE_CREDENTIALS_FILE") or env("GOOGLE_APPLICATION_CREDENTIALS"),
        },
        "alpaca": {
            "apiKey": env("ALPACA_API_KEY"),
            "secretKey": env("ALPACA_SECRET_KEY"),
        },
        "r2": {
            "accountId": env("R2_ACCOUNT_ID"),
            "bucket": env("R2_BUCKET"),
            "accessKeyId": env("R2_ACCESS_KEY_ID"),
            "secretAccessKey": env("R2_SECRET_ACCESS_KEY"),
            "endpoint": env("R2_ENDPOINT"),
            "publicBaseUrl": env("R2_PUBLIC_BASE_URL"),
        },
        "yahoosvc": {"url": env("YAHOO_SVC_URL")},
        "pipeline": {
            "dteMin": int_env("PIPELINE_DTE_MIN", 7),
            "dteMax": int_env("PIPELINE_DTE_MAX", 45),
            "concurrency": int_env("PIPELINE_CONCURRENCY", 3),
        },
        "email": {
            "smtp": {
                "host": env("SMTP_HOST"),
                "port": int_env("SMTP_PORT", 587),
                "user": env("SMTP_USER"),
                "pass": env("SMTP_PASS"),
            },
            "from": env("EMAIL_FROM"),
            "recipients": list_env("EMAIL_RECIPIENTS"),
        },
        "watchlist": list_env("WATCHLIST"),
    }


def require_config(config: dict[str, Any], paths: list[str]) -> None:
    missing: list[str] = []
    for dotted_path in paths:
        value: Any = config
        for part in dotted_path.split("."):
            value = value.get(part) if isinstance(value, dict) else None
            if value in (None, ""):
                break
        if value in (None, ""):
            missing.append(dotted_path)

    if missing:
        raise RuntimeError(f"Missing runtime config: {', '.join(missing)}")
