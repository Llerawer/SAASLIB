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
