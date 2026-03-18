#!/usr/bin/env python3
"""
Create a pairing code in the Firestore emulator for testing the caregiver pairing flow.

Usage:
    python3 scripts/manual-test/create_pairing_code.py [elderly_uid]
"""

import json
import sys
import time
import urllib.error
import urllib.request
import random

FIRESTORE_URL = "http://127.0.0.1:8080"
PROJECT_ID = "demo-easycall"


def find_elderly_uid() -> str | None:
    base = f"{FIRESTORE_URL}/v1/projects/{PROJECT_ID}/databases/(default)/documents"
    url = f"{base}/users?pageSize=10"
    req = urllib.request.Request(url, headers={"Authorization": "Bearer owner"})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
    except (urllib.error.URLError, urllib.error.HTTPError) as e:
        print(f"  ⚠ Could not query Firestore emulator: {e}")
        return None
    except (json.JSONDecodeError, ValueError) as e:
        print(f"  ⚠ Invalid JSON from Firestore emulator: {e}")
        return None
    for doc in data.get("documents", []):
        fields = doc.get("fields", {})
        if fields.get("role", {}).get("stringValue") == "elderly":
            return doc["name"].split("/")[-1]
    return None


def main() -> None:
    elderly_uid = sys.argv[1] if len(sys.argv) > 1 else find_elderly_uid()
    if not elderly_uid:
        print("❌ Could not find elderly user. Run seed_emulator.py first or pass UID.")
        sys.exit(1)

    code = f"{random.randint(0, 999999):06d}"
    expires_at = time.strftime(
        "%Y-%m-%dT%H:%M:%S.000Z",
        time.gmtime(time.time() + 600),  # 10 minutes from now
    )

    base = f"{FIRESTORE_URL}/v1/projects/{PROJECT_ID}/databases/(default)/documents"
    url = f"{base}/pairingCodes?documentId={code}"

    fields = {
        "elderlyUserId": {"stringValue": elderly_uid},
        "expiresAt": {"timestampValue": expires_at},
        "used": {"booleanValue": False},
    }

    req = urllib.request.Request(
        url,
        data=json.dumps({"fields": fields}).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer owner",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            resp.read()
    except urllib.error.HTTPError as e:
        print(f"❌ Error: {e.read().decode()[:300]}")
        sys.exit(1)

    print(f"✅ Pairing code created: {code}")
    print(f"   Elderly UID: {elderly_uid}")
    print(f"   Expires at: {expires_at}")
    print()
    print("   Enter this code in the caregiver's 'Pair Elderly User' screen.")


if __name__ == "__main__":
    main()
