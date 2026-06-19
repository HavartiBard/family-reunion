#!/usr/bin/env python3
"""
Regenerate the Apple Sign In client secret JWT and update PocketBase.

Apple client secrets expire after 6 months. Run this before expiry:
  python3 tools/apple_secret/regenerate.py

Requires:
  pip install pyjwt cryptography requests
  op signin (1Password CLI, for credential retrieval)
  PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD env vars (or set in script prompt)
"""

import json
import os
import subprocess
import sys
import time

try:
    import jwt
    import requests
except ImportError:
    sys.exit("Missing dependencies. Run: pip install pyjwt cryptography requests")

API = "https://reunion-api.klsll.com"
APPLE_ITEM = "Family Reunion - Apple Sign In"
PB_ITEM = "Reunion Pocketbase"


def op_read(item, field):
    result = subprocess.run(
        ["op", "item", "get", item, "--fields", field, "--reveal"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        sys.exit(f"1Password read failed for '{item}' / '{field}': {result.stderr.strip()}")
    return result.stdout.strip()


def pb_admin_token(email, password):
    r = requests.post(f"{API}/api/admins/auth-with-password",
                      json={"identity": email, "password": password})
    r.raise_for_status()
    return r.json()["token"]


def generate_jwt(private_key, team_id, key_id, services_id):
    now = int(time.time())
    return jwt.encode(
        {"iss": team_id, "iat": now, "exp": now + 15552000,
         "aud": "https://appleid.apple.com", "sub": services_id},
        private_key,
        algorithm="ES256",
        headers={"kid": key_id}
    )


def main():
    print("Fetching Apple credentials from 1Password...")
    private_key = op_read(APPLE_ITEM, "Private Key")
    team_id     = op_read(APPLE_ITEM, "Team ID")
    key_id      = op_read(APPLE_ITEM, "Key ID")
    services_id = os.environ.get("APPLE_SERVICES_ID") or op_read(APPLE_ITEM, "Services ID")

    print("Fetching PocketBase admin credentials from 1Password...")
    pb_email    = op_read(PB_ITEM, "username")
    pb_password = op_read(PB_ITEM, "password")

    print("Generating Apple JWT (valid 6 months)...")
    client_secret = generate_jwt(private_key, team_id, key_id, services_id)

    expiry = time.strftime("%Y-%m-%d", time.localtime(time.time() + 15552000))
    print(f"JWT expires: {expiry}")

    print("Authenticating with PocketBase...")
    token = pb_admin_token(pb_email, pb_password)

    print("Updating PocketBase Apple OAuth settings...")
    r = requests.patch(
        f"{API}/api/settings",
        headers={"Authorization": token},
        json={"appleAuth": {"enabled": True, "clientId": services_id,
                            "clientSecret": client_secret}}
    )
    r.raise_for_status()
    result = r.json().get("appleAuth", {})
    print(f"Done. appleAuth.enabled = {result.get('enabled')}, "
          f"clientId = {result.get('clientId')}")


if __name__ == "__main__":
    main()
