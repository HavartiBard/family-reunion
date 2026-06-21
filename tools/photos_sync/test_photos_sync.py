import os
import tempfile
import pytest
from photos_sync import scan_source_dir, caption_from_path, extract_exif_date


# ── caption_from_path ────────────────────────────────────────────────────────

def test_caption_strips_extension():
    assert caption_from_path("/some/album/IMG_0001.jpg") == "IMG_0001"

def test_caption_strips_heic():
    assert caption_from_path("/some/album/Photo 23.HEIC") == "Photo 23"

def test_caption_no_dir():
    assert caption_from_path("plain.png") == "plain"


# ── scan_source_dir ──────────────────────────────────────────────────────────

def test_scan_returns_entries_for_images(tmp_path):
    album = tmp_path / "Summer 2024"
    album.mkdir()
    (album / "IMG_0001.jpg").write_bytes(b"fake")
    (album / "IMG_0002.JPG").write_bytes(b"fake")
    (album / "notes.txt").write_bytes(b"ignore me")

    results = scan_source_dir(str(tmp_path))
    paths = {r["source_path"] for r in results}
    assert "Summer 2024/IMG_0001.jpg" in paths
    assert "Summer 2024/IMG_0002.JPG" in paths
    assert all(r["album"] == "Summer 2024" for r in results)
    assert len(results) == 2

def test_scan_ignores_non_image_files(tmp_path):
    album = tmp_path / "Album"
    album.mkdir()
    (album / "readme.txt").write_bytes(b"x")
    (album / "photo.jpg").write_bytes(b"x")
    results = scan_source_dir(str(tmp_path))
    assert len(results) == 1

def test_scan_multiple_albums(tmp_path):
    for name in ["Album A", "Album B"]:
        d = tmp_path / name
        d.mkdir()
        (d / "img.jpg").write_bytes(b"x")
    results = scan_source_dir(str(tmp_path))
    albums = {r["album"] for r in results}
    assert albums == {"Album A", "Album B"}

def test_scan_source_path_format(tmp_path):
    album = tmp_path / "My Album"
    album.mkdir()
    (album / "shot.png").write_bytes(b"x")
    results = scan_source_dir(str(tmp_path))
    assert results[0]["source_path"] == "My Album/shot.png"

def test_scan_caption_from_filename(tmp_path):
    album = tmp_path / "A"
    album.mkdir()
    (album / "sunset.jpg").write_bytes(b"x")
    results = scan_source_dir(str(tmp_path))
    assert results[0]["caption"] == "sunset"

def test_scan_empty_dir(tmp_path):
    (tmp_path / "Empty Album").mkdir()
    assert scan_source_dir(str(tmp_path)) == []


# ── extract_exif_date ────────────────────────────────────────────────────────

def test_extract_exif_date_no_exif(tmp_path):
    img = tmp_path / "plain.jpg"
    img.write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
    assert extract_exif_date(str(img)) is None

def test_extract_exif_date_nonexistent_file():
    assert extract_exif_date("/nonexistent/path.jpg") is None
