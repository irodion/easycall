#!/usr/bin/env python3
"""
Seed Firebase Emulators with test data for manual testing.

Two modes:
  1. Auto mode (default): Creates auth users and seeds Firestore. Use the
     printed sign-in token to sign into the elderly user's browser session.
  2. UID mode: Seeds Firestore data under an existing UID (e.g., one already
     created by the app via anonymous auth).

Usage:
    python3 scripts/manual-test/seed_emulator.py
    python3 scripts/manual-test/seed_emulator.py --elderly-uid <uid>

Prerequisites:
    firebase emulators:start --only auth,firestore,database,functions
"""

import json
import sys
import time
import urllib.error
import urllib.request

from emulator_config import AUTH_URL, FIRESTORE_URL, PROJECT_ID

# Test users
ELDERLY_EMAIL = "grandma@test.local"
ELDERLY_PASSWORD = "test1234"
CAREGIVER_EMAIL = "caregiver@test.local"
CAREGIVER_PASSWORD = "test1234"


class HttpApiError(Exception):
    """HTTP error with preserved response body."""
    def __init__(self, code: int, body: str):
        self.code = code
        self.body = body
        super().__init__(f"HTTP {code}: {body[:200]}")


def request_json(url: str, data: dict | None = None, method: str = "POST", headers: dict | None = None) -> dict:
    """Make an HTTP request and return JSON response."""
    hdrs = {"Content-Type": "application/json", **(headers or {})}
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        resp_body = e.read().decode()
        print(f"  HTTP {e.code}: {resp_body[:300]}")
        raise HttpApiError(e.code, resp_body) from e


def create_auth_user(email: str, password: str, display_name: str) -> str:
    """Create a user in the Auth emulator, or sign in if it already exists. Returns the uid."""
    url = f"{AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test"
    try:
        result = request_json(url, {
            "email": email,
            "password": password,
            "displayName": display_name,
            "returnSecureToken": True,
        })
        uid = result["localId"]
        print(f"  Created auth user: {email} -> uid={uid}")
        return uid
    except HttpApiError as e:
        if "EMAIL_EXISTS" not in e.body:
            raise
        # User already exists — sign in instead
        sign_in_url = f"{AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=test"
        result = request_json(sign_in_url, {
            "email": email,
            "password": password,
            "returnSecureToken": True,
        })
        uid = result["localId"]
        print(f"  Auth user already exists: {email} -> uid={uid}")
        return uid


def sign_in_email(email: str, password: str) -> dict:
    """Sign in with email/password in the Auth emulator. Returns the full response."""
    url = f"{AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=test"
    return request_json(url, {
        "email": email,
        "password": password,
        "returnSecureToken": True,
    })


def list_auth_users() -> list[dict]:
    """List all users in the Auth emulator."""
    url = f"{AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=test"
    # The emulator also supports a project-level endpoint
    url2 = f"{AUTH_URL}/emulator/v1/projects/{PROJECT_ID}/accounts"
    req = urllib.request.Request(url2, method="GET")
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
        return data.get("userInfo", [])
    except (urllib.error.HTTPError, urllib.error.URLError):
        return []


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
                elif mv is None:
                    map_fields[mk] = {"nullValue": None}
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


def clear_firestore() -> None:
    """Clear Firestore data only (preserves auth users)."""
    print("\n🧹 Clearing Firestore data...")
    url = f"{FIRESTORE_URL}/emulator/v1/projects/{PROJECT_ID}/databases/(default)/documents"
    req = urllib.request.Request(url, method="DELETE")
    try:
        with urllib.request.urlopen(req) as resp:
            resp.read()
        print("  Firestore cleared")
    except urllib.error.HTTPError:
        print("  Firestore clear skipped (may be empty)")


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


def seed_firestore(elderly_uid: str, caregiver_uid: str) -> tuple[str, str]:
    """Seed Firestore data for both users. Returns (room_id, room_id_2)."""
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

    print("\n📄 Creating Firestore user documents...")
    firestore_doc(f"users/{elderly_uid}", {
        "uid": elderly_uid,
        "displayName": "Grandma Rose",
        "role": "elderly",
        "email": "",
        "onboardingComplete": True,
        "pushTokens": [],
        "settings": {"__map__": {
            "fontSize": "large",
            "highContrast": False,
            "ringtoneVolume": 80,
            "autoAnswer": False,
            "appLockEnabled": False,
            "appLockPinHash": None,
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
            "appLockPinHash": None,
            "language": "en",
        }},
        "createdAt": {"__timestamp__": now_iso},
        "lastSeen": {"__timestamp__": now_iso},
    })

    print("\n🔗 Linking caregiver to elderly user...")
    firestore_doc(f"users/{elderly_uid}/caregivers/{caregiver_uid}", {
        "linkedAt": {"__timestamp__": now_iso},
        "permissions": ["manage_contacts", "manage_settings", "view_history"],
    })

    print("\n📇 Adding contacts for elderly user...")
    room_id = f"easycall-test-{int(time.time())}"
    firestore_doc(f"users/{elderly_uid}/contacts/contact1", {
        "name": "Alex (Caregiver)",
        "photoURL": None,
        "contactUserId": caregiver_uid,
        "jitsiRoomId": room_id,
        "displayOrder": 0,
        "createdAt": {"__timestamp__": now_iso},
    })

    room_id_2 = f"easycall-test2-{int(time.time())}"
    firestore_doc(f"users/{elderly_uid}/contacts/contact2", {
        "name": "Sarah Daughter",
        "photoURL": None,
        "contactUserId": "",
        "jitsiRoomId": room_id_2,
        "displayOrder": 1,
        "createdAt": {"__timestamp__": now_iso},
    })

    return room_id, room_id_2


def main() -> None:
    print("=" * 60)
    print("EasyCall Manual Test — Emulator Seeder")
    print("=" * 60)

    if not check_emulators():
        print("\n❌ Firebase emulators are not running!")
        print("   Start them first:")
        print("   firebase emulators:start --only auth,firestore,database,functions")
        sys.exit(1)

    # Parse --elderly-uid flag
    elderly_uid_arg = None
    if "--elderly-uid" in sys.argv:
        idx = sys.argv.index("--elderly-uid")
        if idx + 1 < len(sys.argv):
            elderly_uid_arg = sys.argv[idx + 1]
        else:
            print("❌ --elderly-uid requires a value")
            sys.exit(1)

    if elderly_uid_arg:
        # UID mode: seed Firestore under the provided UID
        print(f"\n📌 Using existing elderly UID: {elderly_uid_arg}")
        clear_firestore()

        # Create caregiver auth user
        print("\n👤 Creating caregiver auth user...")
        caregiver_uid = create_auth_user(CAREGIVER_EMAIL, CAREGIVER_PASSWORD, "Alex Caregiver")

        room_id, room_id_2 = seed_firestore(elderly_uid_arg, caregiver_uid)

        print("\n" + "=" * 60)
        print("✅ Emulator seeded successfully!")
        print("=" * 60)
        print()
        print(f"  Elderly UID:  {elderly_uid_arg} (your existing browser session)")
        print(f"  Caregiver:    {CAREGIVER_EMAIL} / {CAREGIVER_PASSWORD}  (uid: {caregiver_uid})")
        print(f"  Jitsi room (Alex):  {room_id}")
        print(f"  Jitsi room (Sarah): {room_id_2}")
        print()
        print("  Reload the elderly user's browser — contacts should now appear.")
    else:
        # Auto mode: create both auth users from scratch
        clear_emulators()

        print("\n👤 Creating auth users...")
        elderly_uid = create_auth_user(ELDERLY_EMAIL, ELDERLY_PASSWORD, "Grandma Rose")
        caregiver_uid = create_auth_user(CAREGIVER_EMAIL, CAREGIVER_PASSWORD, "Alex Caregiver")

        room_id, room_id_2 = seed_firestore(elderly_uid, caregiver_uid)

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
        print("HOW TO TEST:")
        print("  1. Start dev server:  VITE_USE_EMULATORS=true pnpm dev")
        print("  2. Open http://localhost:5173")
        print()
        print("  FOR ELDERLY USER:")
        print("    a. Select 'I need help calling' on RoleSelector")
        print("    b. The app creates a NEW anonymous UID (not the seeded one)")
        print("    c. To use the seeded data, find your UID in the browser console:")
        print("       > (await import('/src/services/firebase.ts')).auth.currentUser.uid")
        print("    d. Re-run:  python3 scripts/manual-test/seed_emulator.py --elderly-uid <YOUR_UID>")
        print("    e. Reload the page — contacts will appear")
        print()
        print("  FOR CAREGIVER:")
        print(f"    Click 'Already have an account? Sign in' → {CAREGIVER_EMAIL} / {CAREGIVER_PASSWORD}")
        print()
        print("  See full guide: scripts/manual-test/TESTING_GUIDE.md")
        print()


if __name__ == "__main__":
    main()
