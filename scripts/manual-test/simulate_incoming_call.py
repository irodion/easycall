#!/usr/bin/env python3
"""
Simulate an incoming call to the elderly user via the Firestore emulator.

This writes to users/{elderlyUid}/incomingCall/current with status='ringing',
which triggers the IncomingCallScreen overlay in the elderly user's browser.

Usage:
    python3 scripts/manual-test/simulate_incoming_call.py <elderly_uid>

    # Or use the default (auto-detect from seeded data):
    python3 scripts/manual-test/simulate_incoming_call.py
"""

import json
import sys
import time
import urllib.error
import urllib.request

FIRESTORE_URL = "http://127.0.0.1:8080"
PROJECT_ID = "demo-easycall"


def firestore_patch(path: str, fields: dict) -> None:
    """Write/overwrite a Firestore document."""
    fs_fields = {}
    for k, v in fields.items():
        if isinstance(v, str):
            fs_fields[k] = {"stringValue": v}
        elif v is None:
            fs_fields[k] = {"nullValue": None}
        elif isinstance(v, dict) and "__timestamp__" in v:
            fs_fields[k] = {"timestampValue": v["__timestamp__"]}

    base = f"{FIRESTORE_URL}/v1/projects/{PROJECT_ID}/databases/(default)/documents"
    url = f"{base}/{path}"

    # Try PATCH first (update existing), fall back to POST if doc doesn't exist
    patch_req = urllib.request.Request(
        url,
        data=json.dumps({"fields": fs_fields}).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer owner",
        },
        method="PATCH",
    )
    try:
        with urllib.request.urlopen(patch_req) as resp:
            resp.read()
        return
    except urllib.error.HTTPError as e:
        if e.code not in (404, 405, 501):
            body = e.read().decode()[:300]
            print(f"Failed to PATCH document (HTTP {e.code}): {body}")
            sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Cannot reach Firestore emulator: {e.reason}")
        sys.exit(1)

    # Document doesn't exist yet — create via POST
    post_url = url.rsplit("/", 1)[0] + f"?documentId={path.split('/')[-1]}"
    post_req = urllib.request.Request(
        post_url,
        data=json.dumps({"fields": fs_fields}).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer owner",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(post_req) as resp:
            resp.read()
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:300]
        print(f"Failed to create document (HTTP {e.code}): {body}")
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Cannot reach Firestore emulator: {e.reason}")
        sys.exit(1)


def find_elderly_uid() -> str | None:
    """Find the elderly user UID from seeded Firestore data."""
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
        role = fields.get("role", {}).get("stringValue", "")
        if role == "elderly":
            # Extract uid from document name: projects/.../users/THE_UID
            return doc["name"].split("/")[-1]
    return None


def main() -> None:
    if len(sys.argv) > 1:
        elderly_uid = sys.argv[1]
    else:
        elderly_uid = find_elderly_uid()
        if not elderly_uid:
            print("❌ Could not find elderly user in emulator.")
            print("   Run seed_emulator.py first, or pass the UID as an argument.")
            sys.exit(1)

    now_iso = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    room_id = f"easycall-test-{int(time.time())}"

    print(f"📞 Simulating incoming call to elderly user {elderly_uid}...")
    print(f"   Room: {room_id}")
    print("   Caller: Test Caller")

    firestore_patch(f"users/{elderly_uid}/incomingCall/current", {
        "callerId": "simulated-caller-id",
        "callerName": "Test Caller",
        "callerPhotoURL": None,
        "jitsiRoomId": room_id,
        "status": "ringing",
        "timestamp": {"__timestamp__": now_iso},
    })

    print()
    print("✅ Incoming call document written!")
    print("   The elderly user's browser should now show the IncomingCallScreen.")
    print()
    print("   To cancel: python3 scripts/manual-test/simulate_incoming_call.py --cancel " + elderly_uid)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--cancel":
        uid = sys.argv[2] if len(sys.argv) > 2 else find_elderly_uid()
        if not uid:
            print("❌ Could not find elderly user")
            sys.exit(1)
        print(f"❌ Cancelling incoming call for {uid}...")
        firestore_patch(f"users/{uid}/incomingCall/current", {
            "status": "cancelled",
        })
        print("Done.")
    else:
        main()
