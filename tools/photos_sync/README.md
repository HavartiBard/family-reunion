# photos_sync

Bulk-import an exported Apple Photos folder into the Kelsall family site.

## Quick start

```bash
pip3 install -r requirements.txt

PB_URL=https://reunion-api.klsll.com \
PB_ADMIN_EMAIL=svc-photos-sync@reunion.local \
PB_ADMIN_PASSWORD=<service account pw> \
python3 photos_sync.py ~/Pictures/FamilyExport/
```

`PB_ADMIN_EMAIL`/`PB_ADMIN_PASSWORD` authenticate as a regular `users` record
with `family_admin=true` (a dedicated service account, credentials in
1Password), **not** PocketBase's superuser `_superusers` table — album
creation is `family_admin`-only, but a family_admin `users` record still goes
through PocketBase's collection rules, unlike true superuser auth.

## Source directory layout

Export from Apple Photos with **File → Export → Export Unmodified Originals** (check "Album subfolder" in the options). The result should look like:

```
FamilyExport/
  Summer Reunion 2024/
    IMG_0001.jpg
    IMG_0002.HEIC
  Christmas 2025/
    photo.jpg
```

Each subdirectory becomes an album. Images directly in the root are ignored.

## Behaviour

- **Idempotent** — re-running never duplicates photos (keyed on `album_name/filename`).
- **EXIF dates** — `DateTimeOriginal` is used as `taken_date` when available.
- **Captions** — default to filename stem; edit individually in the SPA after import.
- **Albums** — created automatically if they don't already exist.

## Dry run

```bash
python3 photos_sync.py ~/Pictures/FamilyExport/ --dry-run
```

Prints what would be uploaded without making any changes.

## Running on Unraid

Same as `gedcom_sync` — run from the Unraid host shell:

```bash
cd /mnt/user/appdata/family-reunion/tools/photos_sync
pip3 install -r requirements.txt --break-system-packages
PB_URL=https://reunion-api.klsll.com \
PB_ADMIN_EMAIL=svc-photos-sync@reunion.local PB_ADMIN_PASSWORD=... \
python3 photos_sync.py /mnt/user/Photos/FamilyExport/
```

## Tests

```bash
python3 -m pytest test_photos_sync.py -q
```

## icloudpd integration (optional)

If you run [`icloudpd`](https://github.com/boredazfcuk/docker-icloudpd) to sync a shared family iCloud album to a local folder in the expected subdirectory layout, point `photos_sync.py` at that folder and run it on a cron schedule for fully automated sync.
