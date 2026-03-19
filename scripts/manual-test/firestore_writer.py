"""Shared Firestore emulator document writer for manual test scripts."""

import json
import urllib.error
import urllib.request

from emulator_config import FIRESTORE_URL, PROJECT_ID


def _to_firestore_value(v: object) -> dict:
    """Convert a Python value to Firestore REST API value format."""
    if isinstance(v, str):
        return {"stringValue": v}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    if v is None:
        return {"nullValue": None}
    if isinstance(v, list):
        return {"arrayValue": {"values": [_to_firestore_value(item) for item in v]}}
    if isinstance(v, dict) and "__timestamp__" in v:
        return {"timestampValue": v["__timestamp__"]}
    if isinstance(v, dict) and "__map__" in v:
        return {"mapValue": {"fields": {
            mk: _to_firestore_value(mv) for mk, mv in v["__map__"].items()
        }}}
    raise ValueError(f"Unsupported value type: {type(v).__name__} for {v!r}")


def firestore_doc(path: str, fields: dict) -> None:
    """Write a Firestore document via the emulator REST API (POST, PATCH on conflict)."""
    fs_fields = {k: _to_firestore_value(v) for k, v in fields.items()}

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
            try:
                with urllib.request.urlopen(patch_req) as resp:
                    resp.read()
                print(f"  Updated: {path}")
            except urllib.error.HTTPError as patch_err:
                body_text = patch_err.read().decode()
                print(f"  Firestore PATCH error ({patch_err.code}): {body_text[:300]}")
                raise
        else:
            body_text = e.read().decode()
            print(f"  Firestore error ({e.code}): {body_text[:300]}")
            raise
