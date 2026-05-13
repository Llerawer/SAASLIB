"""Media validation pure functions."""
import pytest


def test_image_png_5mb_ok():
    from app.api.v1.cards import _validate_media_request
    _validate_media_request("image", "image/png", 4_000_000)


def test_image_15mb_rejects():
    from app.api.v1.cards import _validate_media_request
    with pytest.raises(ValueError, match="size"):
        _validate_media_request("image", "image/png", 15_000_000)


def test_image_wrong_mime_rejects():
    from app.api.v1.cards import _validate_media_request
    with pytest.raises(ValueError, match="mime"):
        _validate_media_request("image", "video/mp4", 1000)


def test_audio_webm_ok():
    from app.api.v1.cards import _validate_media_request
    _validate_media_request("audio", "audio/webm", 500_000)


def test_audio_2mb_rejects():
    from app.api.v1.cards import _validate_media_request
    with pytest.raises(ValueError, match="size"):
        _validate_media_request("audio", "audio/webm", 2_000_000)


# Minimal valid PNG: 8-byte signature + IHDR chunk (libmagic needs the IHDR to
# identify the type; bare signature + nulls resolves to octet-stream).
_PNG_BYTES = bytes([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
    0x00, 0x00, 0x00, 0x0D,                            # IHDR length = 13
    0x49, 0x48, 0x44, 0x52,                            # "IHDR"
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,   # 1×1 px
    0x08, 0x02, 0x00, 0x00, 0x00,                      # 8-bit RGB
    0x90, 0x77, 0x53, 0xDE,                            # CRC
]) + b"\x00" * 100


def test_sniff_mime_png():
    from app.api.v1.cards import _sniff_mime
    assert _sniff_mime(_PNG_BYTES) == "image/png"


def test_sniff_mime_jpeg():
    from app.api.v1.cards import _sniff_mime
    assert _sniff_mime(b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\0" * 100) == "image/jpeg"
