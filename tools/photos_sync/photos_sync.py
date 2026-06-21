"""Sync an exported Apple Photos folder into PocketBase albums + photos.

Directory convention:
  <export-root>/
    Album Name/
      IMG_0001.jpg
      IMG_0002.HEIC
    Another Album/
      photo.png

Run:
  PB_URL=https://reunion-api.klsll.com \\
  PB_ADMIN_EMAIL=admin@example.com \\
  PB_ADMIN_PASSWORD=secret \\
  python3 photos_sync.py ~/Pictures/FamilyExport/

Pure helper functions (scan_source_dir, caption_from_path, extract_exif_date)
have no I/O and are tested independently in test_photos_sync.py.
"""

import argparse
import os
import sys

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".gif", ".webp", ".tiff", ".bmp"}


def caption_from_path(path: str) -> str:
    """Return filename stem (no extension) as a caption."""
    return os.path.splitext(os.path.basename(path))[0]


def extract_exif_date(path: str) -> "str | None":
    """Return 'YYYY-MM-DD' from EXIF DateTimeOriginal, or None."""
    try:
        from PIL import Image
        from PIL.ExifTags import TAGS
        img = Image.open(path)
        exif = img._getexif()
        if not exif:
            return None
        tag_map = {v: k for k, v in TAGS.items()}
        dto_tag = tag_map.get("DateTimeOriginal")
        if dto_tag is None or dto_tag not in exif:
            return None
        raw = exif[dto_tag]  # "2024:08:15 14:32:00"
        date_part = raw.split(" ")[0].replace(":", "-")
        return date_part if len(date_part) == 10 else None
    except Exception:
        return None


def scan_source_dir(root: str) -> list:
    """Return list of photo entries for all images found under root.

    Each entry: {"album": str, "path": str, "source_path": str,
                 "taken_date": str|None, "caption": str}
    Only direct children of root are treated as album directories.
    Files directly in root (not in a subdirectory) are ignored.
    """
    entries = []
    try:
        subdirs = sorted([
            d for d in os.listdir(root)
            if os.path.isdir(os.path.join(root, d)) and not d.startswith(".")
        ])
    except OSError:
        return []

    for album_name in subdirs:
        album_dir = os.path.join(root, album_name)
        try:
            files = sorted(os.listdir(album_dir))
        except OSError:
            continue
        for fname in files:
            ext = os.path.splitext(fname)[1].lower()
            if ext not in IMAGE_EXTENSIONS:
                continue
            full_path = os.path.join(album_dir, fname)
            entries.append({
                "album": album_name,
                "path": full_path,
                "source_path": f"{album_name}/{fname}",
                "taken_date": extract_exif_date(full_path),
                "caption": caption_from_path(fname),
            })
    return entries


# ── I/O: PocketBase client ───────────────────────────────────────────────────

class PB:
    def __init__(self, base: str, token: str):
        self.base = base.rstrip("/")
        self.h = {"Authorization": token}

    @classmethod
    def login(cls, base: str, identity: str, password: str) -> "PB":
        import requests
        r = requests.post(
            f"{base.rstrip('/')}/api/admins/auth-with-password",
            json={"identity": identity, "password": password},
            timeout=15,
        )
        r.raise_for_status()
        return cls(base, r.json()["token"])

    def find_album(self, name: str) -> "dict | None":
        import requests
        r = requests.get(
            f"{self.base}/api/collections/albums/records",
            params={"perPage": 1, "filter": f'(name="{name}")'},
            headers=self.h, timeout=15,
        )
        r.raise_for_status()
        items = r.json().get("items", [])
        return items[0] if items else None

    def create_album(self, name: str) -> dict:
        import requests
        r = requests.post(
            f"{self.base}/api/collections/albums/records",
            json={"name": name},
            headers=self.h, timeout=15,
        )
        r.raise_for_status()
        return r.json()

    def find_photo_by_source(self, source_path: str) -> "dict | None":
        import requests
        r = requests.get(
            f"{self.base}/api/collections/photos/records",
            params={"perPage": 1, "filter": f'(source_path="{source_path}")'},
            headers=self.h, timeout=15,
        )
        r.raise_for_status()
        items = r.json().get("items", [])
        return items[0] if items else None

    def create_photo(self, album_id: str, entry: dict) -> dict:
        import requests
        with open(entry["path"], "rb") as f:
            files = {"image": (os.path.basename(entry["path"]), f)}
            data = {
                "album": album_id,
                "source_path": entry["source_path"],
                "caption": entry["caption"],
            }
            if entry["taken_date"]:
                data["taken_date"] = entry["taken_date"]
            r = requests.post(
                f"{self.base}/api/collections/photos/records",
                data=data, files=files, headers=self.h, timeout=60,
            )
        r.raise_for_status()
        return r.json()


# ── Orchestration ─────────────────────────────────────────────────────────────

def run(args):
    print(f"Connecting to {args.pb_url}…")
    pb = PB.login(args.pb_url, args.pb_email, args.pb_password)
    print("Authenticated.")

    entries = scan_source_dir(args.source_dir)
    if not entries:
        print("No images found. Check that subdirectories contain image files.")
        return

    album_cache: dict = {}
    created = skipped = errors = 0

    for entry in entries:
        album_name = entry["album"]

        if album_name not in album_cache:
            album = pb.find_album(album_name)
            if not album:
                if args.dry_run:
                    print(f"  [dry-run] Would create album: {album_name!r}")
                    album_cache[album_name] = {"id": "dry-run"}
                else:
                    album = pb.create_album(album_name)
                    print(f"  Created album: {album_name!r}")
                    album_cache[album_name] = album
            else:
                album_cache[album_name] = album

        album_id = album_cache[album_name]["id"]

        if pb.find_photo_by_source(entry["source_path"]):
            skipped += 1
            continue

        if args.dry_run:
            print(f"  [dry-run] Would upload: {entry['source_path']}")
            created += 1
            continue

        try:
            pb.create_photo(album_id, entry)
            print(f"  Uploaded: {entry['source_path']}")
            created += 1
        except Exception as e:
            print(f"  ERROR {entry['source_path']}: {e}", file=sys.stderr)
            errors += 1

    print(f"\nDone. Uploaded: {created}  Skipped: {skipped}  Errors: {errors}")


def main():
    ap = argparse.ArgumentParser(description="Sync Apple Photos export to PocketBase")
    ap.add_argument("source_dir", help="Root export directory (subdirs = albums)")
    ap.add_argument("--pb-url", default=os.environ.get("PB_URL", "https://reunion-api.klsll.com"))
    ap.add_argument("--pb-email", default=os.environ.get("PB_ADMIN_EMAIL", ""))
    ap.add_argument("--pb-password", default=os.environ.get("PB_ADMIN_PASSWORD", ""))
    ap.add_argument("--dry-run", action="store_true", help="Print what would happen without uploading")
    args = ap.parse_args()

    if not args.pb_email or not args.pb_password:
        ap.error("PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD must be set (env vars or flags)")

    run(args)


if __name__ == "__main__":
    main()
