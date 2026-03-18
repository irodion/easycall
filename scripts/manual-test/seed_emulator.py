#!/usr/bin/env python3
"""
Seed Firebase Emulators with test data for manual testing.

Creates two users (elderly + caregiver), links them, and adds contacts
so you can test the full flow without touching production.

Usage:
    python3 scripts/manual-test/seed_emulator.py

Prerequisites:
    firebase emulators:start --only auth,firestore,database,functions
"""

import json
import sys
import time
import urllib.error
import urllib.request

# Emulator endpoints
AUTH_URL = "http://127.0.0.1:9099"
FIRESTORE_URL = "http://127.0.0.1:8080"
PROJECT_ID = "demo-easycall"  # emulator default

# Test users
ELDERLY_EMAIL = "grandma@test.local"
ELDERLY_PASSWORD = "test1234"
CAREGIVER_EMAIL = "caregiver@test.local"
CAREGIVER_PASSWORD = "test1234"


def request_json(url: str, data: dict | None = None, method: str = "POST", headers: dict | None = None) -> dict:
    """Make an HTTP request and return JSON response."""
    hdrs = {"Content-Type": "application/json", **(headers or {})}
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  HTTP {e.code}: {body[:300]}")
        raise


def create_auth_user(email: str, password: str, display_name: str) -> str:
    """Create a user in the Auth emulator. Returns the localId (uid)."""
    url = f"{AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test"
    result = request_json(url, {
        "email": email,
        "password": password,
        "displayName": display_name,
        "returnSecureToken": True,
    })
    uid = result["localId"]
    print(f"  Created auth user: {email} -> uid={uid}")
    return uid


def firestore_doc(path: str, fields: dict) -> None:
    """Write a Firestore document via the emulator REST API."""
    # Convert our simple dict to Firestore's value format
    fs_fields = {}
    for k, v in fields.items():
        if isinstance(v, str):
            fs_fields[k] = {"stringValue": v}
        elif isinstance(v, bool):
            fs_fields[k] = {"booleanValue": v}
        elif isinstance(v, int):
            fs_fields[k] = {"integerValue": str(v)}
        elif isinstance(v, float):
            fs_fields[k] = {"doubleValue": v}
        elif isinstance(v, list):
            array_values = []
            for item in v:
                if isinstance(item, str):
                    array_values.append({"stringValue": item})
            fs_fields[k] = {"arrayValue": {"values": array_values}}
        elif v is None:
            fs_fields[k] = {"nullValue": None}
        elif isinstance(v, dict) and "__timestamp__" in v:
            fs_fields[k] = {"timestampValue": v["__timestamp__"]}
        elif isinstance(v, dict) and "__map__" in v:
            map_fields = {}
            for mk, mv in v["__map__"].items():
                if isinstance(mv, str):
                    map_fields[mk] = {"stringValue": mv}
                elif isinstance(mv, bool):
                    map_fields[mk] = {"booleanValue": mv}
                elif isinstance(mv, int):
                    map_fields[mk] = {"integerValue": str(mv)}
            fs_fields[k] = {"mapValue": {"fields": map_fields}}

    # Split path into collection + document
    parts = path.split("/")
    parent_path = "/".join(parts[:-2]) if len(parts) > 2 else ""
    collection_id = parts[-2]
    doc_id = parts[-1]

    base = f"{FIRESTORE_URL}/v1/projects/{PROJECT_ID}/databases/(default)/documents"
    if parent_path:
        url = f"{base}/{parent_path}/{collection_id}?documentId={doc_id}"
    else:
        url = f"{base}/{collection_id}?documentId={doc_id}"

    req = urllib.request.Request(
        url,
        data=json.dumps({"fields": fs_fields}).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer owner",  # bypass security rules
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            resp.read()
        print(f"  Wrote Firestore doc: {path}")
    except urllib.error.HTTPError as e:
        # 409 = already exists, try PATCH
        if e.code == 409:
            patch_url = f"{base}/{path}"
            patch_req = urllib.request.Request(
                patch_url,
                data=json.dumps({"fields": fs_fields}).encode(),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": "Bearer owner",
                },
                method="PATCH",
            )
            with urllib.request.urlopen(patch_req) as resp:
                resp.read()
            print(f"  Updated Firestore doc: {path}")
        else:
            body_text = e.read().decode()
            print(f"  Firestore error ({e.code}): {body_text[:300]}")
            raise


def clear_emulators() -> None:
    """Clear all emulator data."""
    print("\n🧹 Clearing emulator data...")
    # Clear Firestore
    url = f"{FIRESTORE_URL}/emulator/v1/projects/{PROJECT_ID}/databases/(default)/documents"
    req = urllib.request.Request(url, method="DELETE")
    try:
        with urllib.request.urlopen(req) as resp:
            resp.read()
        print("  Firestore cleared")
    except urllib.error.HTTPError:
        print("  Firestore clear skipped (may be empty)")

    # Clear Auth
    url = f"{AUTH_URL}/emulator/v1/projects/{PROJECT_ID}/accounts"
    req = urllib.request.Request(url, method="DELETE",
                                 data=json.dumps({}).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as resp:
            resp.read()
        print("  Auth cleared")
    except urllib.error.HTTPError:
        print("  Auth clear skipped")


def check_emulators() -> bool:
    """Check if emulators are running."""
    try:
        req = urllib.request.Request(f"{AUTH_URL}/", method="GET")
        with urllib.request.urlopen(req, timeout=2):
            pass
        return True
    except Exception:
        return False


def main() -> None:
    print("=" * 60)
    print("EasyCall Manual Test — Emulator Seeder")
    print("=" * 60)

    if not check_emulators():
        print("\n❌ Firebase emulators are not running!")
        print("   Start them first:")
        print("   firebase emulators:start --only auth,firestore,database,functions")
        sys.exit(1)

    clear_emulators()

    now_iso = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

    # 1. Create auth users
    print("\n👤 Creating auth users...")
    elderly_uid = create_auth_user(ELDERLY_EMAIL, ELDERLY_PASSWORD, "Grandma Rose")
    caregiver_uid = create_auth_user(CAREGIVER_EMAIL, CAREGIVER_PASSWORD, "Alex Caregiver")

    # 2. Create user docs in Firestore
    print("\n📄 Creating Firestore user documents...")
    firestore_doc(f"users/{elderly_uid}", {
        "uid": elderly_uid,
        "displayName": "Grandma Rose",
        "role": "elderly",
        "email": ELDERLY_EMAIL,
        "onboardingComplete": True,
        "pushTokens": [],
        "settings": {"__map__": {
            "fontSize": "large",
            "highContrast": False,
            "ringtoneVolume": 80,
            "autoAnswer": False,
            "appLockEnabled": False,
            "language": "en",
        }},
        "createdAt": {"__timestamp__": now_iso},
        "lastSeen": {"__timestamp__": now_iso},
    })

    firestore_doc(f"users/{caregiver_uid}", {
        "uid": caregiver_uid,
        "displayName": "Alex Caregiver",
        "role": "caregiver",
        "email": CAREGIVER_EMAIL,
        "onboardingComplete": True,
        "pushTokens": [],
        "settings": {"__map__": {
            "fontSize": "large",
            "highContrast": False,
            "ringtoneVolume": 80,
            "autoAnswer": False,
            "appLockEnabled": False,
            "language": "en",
        }},
        "createdAt": {"__timestamp__": now_iso},
        "lastSeen": {"__timestamp__": now_iso},
    })

    # 3. Link caregiver to elderly user
    print("\n🔗 Linking caregiver to elderly user...")
    firestore_doc(f"users/{elderly_uid}/caregivers/{caregiver_uid}", {
        "linkedAt": {"__timestamp__": now_iso},
        "permissions": ["manage_contacts", "manage_settings", "view_history"],
    })

    # 4. Add contacts for the elderly user
    print("\n📇 Adding contacts for elderly user...")
    room_id = f"easycall-test-{int(time.time())}"
    firestore_doc(f"users/{elderly_uid}/contacts/contact1", {
        "name": "Alex (Caregiver)",
        "contactUserId": caregiver_uid,
        "jitsiRoomId": room_id,
        "displayOrder": 0,
        "createdAt": {"__timestamp__": now_iso},
    })

    room_id_2 = f"easycall-test2-{int(time.time())}"
    firestore_doc(f"users/{elderly_uid}/contacts/contact2", {
        "name": "Sarah Daughter",
        "contactUserId": "",
        "jitsiRoomId": room_id_2,
        "displayOrder": 1,
        "createdAt": {"__timestamp__": now_iso},
    })

    # Summary
    print("\n" + "=" * 60)
    print("✅ Emulator seeded successfully!")
    print("=" * 60)
    print()
    print("Test accounts:")
    print(f"  Elderly:   {ELDERLY_EMAIL} / {ELDERLY_PASSWORD}  (uid: {elderly_uid})")
    print(f"  Caregiver: {CAREGIVER_EMAIL} / {CAREGIVER_PASSWORD}  (uid: {caregiver_uid})")
    print()
    print(f"  Jitsi room (Alex):  {room_id}")
    print(f"  Jitsi room (Sarah): {room_id_2}")
    print()
    print("Next steps:")
    print("  1. Start dev server: VITE_USE_EMULATORS=true pnpm dev")
    print("  2. Open http://localhost:5173 in browser")
    print("  3. See the full testing guide in scripts/manual-test/TESTING_GUIDE.md")
    print()


if __name__ == "__main__":
    main()
