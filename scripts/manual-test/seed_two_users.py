#!/usr/bin/env python3
"""
Seed two EasyCall users who can call each other.

Both users get a contact pointing to each other with the same Jitsi room ID,
so either can initiate a call and both end up in the same video room.

Usage:
    1. Open browser 1 at localhost:5173 → pick "I need help calling" (elderly)
    2. Open browser 2 (incognito) at localhost:5173 → pick "I need help calling"
    3. Get both UIDs from browser console:
         (await import('/src/services/firebase.ts')).auth.currentUser.uid
    4. Run:
         python3 scripts/manual-test/seed_two_users.py --uid1 <UID1> --uid2 <UID2>
    5. Reload both browsers — each sees the other as a contact
    6. Either user clicks the contact → video call

Prerequisites:
    firebase emulators:start --only auth,firestore,database,functions
"""

import json
import sys
import time
import urllib.error
import urllib.request

from emulator_config import AUTH_URL, FIRESTORE_URL, PROJECT_ID


def firestore_doc(path: str, fields: dict) -> None:
    """Write a Firestore document via the emulator REST API."""
    fs_fields = {}
    for k, v in fields.items():
        if isinstance(v, str):
            fs_fields[k] = {"stringValue": v}
        elif isinstance(v, bool):
            fs_fields[k] = {"booleanValue": v}
        elif isinstance(v, int):
            fs_fields[k] = {"integerValue": str(v)}
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
            "Authorization": "Bearer owner",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            resp.read()
        print(f"  Wrote: {path}")
    except urllib.error.HTTPError as e:
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
            print(f"  Updated: {path}")
        else:
            body = e.read().decode()[:300]
            print(f"  Error ({e.code}): {body}")
            raise


def main() -> None:
    if "--uid1" not in sys.argv or "--uid2" not in sys.argv:
        print("Usage: python3 seed_two_users.py --uid1 <UID1> --uid2 <UID2>")
        print()
        print("Get UIDs from browser console:")
        print("  (await import('/src/services/firebase.ts')).auth.currentUser.uid")
        sys.exit(1)

    uid1 = sys.argv[sys.argv.index("--uid1") + 1]
    uid2 = sys.argv[sys.argv.index("--uid2") + 1]

    print("=" * 60)
    print("EasyCall — Seed Two Users for Call Testing")
    print("=" * 60)
    print(f"  User 1 (Grandma Rose): {uid1}")
    print(f"  User 2 (Alex Family):  {uid2}")

    now_iso = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    ts = int(time.time())
    # Each direction gets its own room ID — the generateJitsiJwt function
    # requires exactly one contact per room to determine authorization.
    # When User 1 calls User 2, they use room_1to2; vice versa uses room_2to1.
    room_1to2 = f"easycall-room-1to2-{ts}"
    room_2to1 = f"easycall-room-2to1-{ts}"

    default_settings = {"__map__": {
        "fontSize": "large",
        "highContrast": False,
        "ringtoneVolume": 80,
        "autoAnswer": False,
        "appLockEnabled": False,
        "appLockPinHash": None,
        "language": "en",
    }}

    # User 1: Grandma Rose
    print("\n👤 Setting up User 1 (Grandma Rose)...")
    firestore_doc(f"users/{uid1}", {
        "uid": uid1,
        "displayName": "Grandma Rose",
        "role": "elderly",
        "email": "",
        "onboardingComplete": True,
        "pushTokens": [],
        "settings": default_settings,
        "createdAt": {"__timestamp__": now_iso},
        "lastSeen": {"__timestamp__": now_iso},
    })
    firestore_doc(f"users/{uid1}/contacts/contact-user2", {
        "name": "Alex Family",
        "photoURL": None,
        "contactUserId": uid2,
        "jitsiRoomId": room_1to2,
        "displayOrder": 0,
        "createdAt": {"__timestamp__": now_iso},
    })

    # User 2: Alex Family
    print("\n👤 Setting up User 2 (Alex Family)...")
    firestore_doc(f"users/{uid2}", {
        "uid": uid2,
        "displayName": "Alex Family",
        "role": "elderly",
        "email": "",
        "onboardingComplete": True,
        "pushTokens": [],
        "settings": default_settings,
        "createdAt": {"__timestamp__": now_iso},
        "lastSeen": {"__timestamp__": now_iso},
    })
    firestore_doc(f"users/{uid2}/contacts/contact-user1", {
        "name": "Grandma Rose",
        "photoURL": None,
        "contactUserId": uid1,
        "jitsiRoomId": room_2to1,
        "displayOrder": 0,
        "createdAt": {"__timestamp__": now_iso},
    })

    print("\n" + "=" * 60)
    print("✅ Both users seeded!")
    print("=" * 60)
    print()
    print(f"  Room (Rose calls Alex): {room_1to2}")
    print(f"  Room (Alex calls Rose): {room_2to1}")
    print()
    print("  Browser 1 (Grandma Rose) sees contact: 'Alex Family'")
    print("  Browser 2 (Alex Family) sees contact: 'Grandma Rose'")
    print()
    print("  Reload both browsers, then either user can tap the contact to start a call.")
    print("  Each direction uses its own Jitsi room (required by generateJitsiJwt).")
    print()
    print("  To test a two-way call:")
    print("    1. User 1 taps 'Alex Family' → enters room")
    print("    2. User 2 opens the same room in a new tab:")
    print(f"       https://8x8.vc/{room_1to2}")
    print("    (Or vice versa: User 2 taps 'Grandma Rose', User 1 joins that room)")


if __name__ == "__main__":
    main()
