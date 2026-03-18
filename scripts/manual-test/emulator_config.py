"""Shared config for manual test scripts — auto-detects the emulator project ID."""

import json
import pathlib
import urllib.error
import urllib.request

AUTH_URL = "http://127.0.0.1:9099"
FIRESTORE_URL = "http://127.0.0.1:8080"


def detect_project_id() -> str:
    """Detect the project ID from .env.local (matches what the app uses)."""
    env_file = pathlib.Path(__file__).resolve().parents[2] / ".env.local"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("VITE_FIREBASE_PROJECT_ID="):
                val = line.split("=", 1)[1].strip()
                if val:
                    return val

    # Fallback: ask the running Firestore emulator
    try:
        req = urllib.request.Request(f"{FIRESTORE_URL}/emulator/v1/projects", method="GET")
        with urllib.request.urlopen(req, timeout=2) as resp:
            data = json.loads(resp.read().decode())
            ids = data.get("projectIds", [])
            if ids:
                return ids[0]
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError):
        pass

    return "demo-easycall"


PROJECT_ID = detect_project_id()
