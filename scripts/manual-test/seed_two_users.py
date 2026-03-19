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

import sys
import time

from firestore_writer import firestore_doc


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(
        description="Seed two EasyCall users who can call each other.",
        epilog="Get UIDs from browser console:\n"
               "  (await import('/src/services/firebase.ts')).auth.currentUser.uid",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--uid1", required=True, help="UID of the first user (Grandma Rose)")
    parser.add_argument("--uid2", required=True, help="UID of the second user (Alex Family)")
    args = parser.parse_args()

    uid1 = args.uid1
    uid2 = args.uid2

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
