# Plan — Series (YouTube playlist import) Fase 1

## Goal
Paste YouTube playlist URL → preview → confirm → background ingest →
videos grouped as a "series" in `/videos`. Reuses existing yt-dlp +
video_ingest pipeline. No Google API key.

## Scope

### IN
- Detect playlist URLs (`?list=...`)
- Preview via yt-dlp `--flat-playlist`: title, channel, thumbnail, count, duration
- Confirmation modal with warning if >30 videos
- Hard limit: 50 videos per import
- `series` table + `series_id` FK on `videos` (nullable, ON DELETE SET NULL)
- Background ingest reuses `video_ingest`, attaches videos to series
- Progress visible on the series card while importing
- Videos in a series collapse into ONE SeriesCard in `/videos` grid
- `/series/[id]` detail page with the videos + import progress
- Re-importing same playlist returns existing series (idempotent)

### OUT (Fase 2+)
- Coverage / recurring words / difficulty per series
- "Continúa esta serie" as CTA
- Re-sync (detect new videos in source playlist)
- Manual user-created playlists
- Reorder / drag-drop
- Tiering (free/paid limits — hardcoded 50 for now)
- Analytics dashboards

## Open decisions (locked in)
1. Detail view: dedicated route `/series/[id]` (not modal). Grows into stats.
2. Existing videos: associate (UPDATE series_id) instead of duplicating.
3. Ingest pacing: serial, 2s sleep between videos. ~7min for a 22-video playlist.

## Tasks (10)
1. Migration: `series` table + `videos.series_id`
2. Backend service `playlist_metadata.py` (yt-dlp wrapper) + tests
3. Backend `/series` endpoints (preview, import, list, detail, delete) + worker tests
4. Add `series_id` to videos endpoint select + VideoListItem schema (frontend + backend)
5. Frontend URL parser extension (`isPlaylistUrl`, `parsePlaylistId`) + `lib/series/queries.ts` hooks
6. `SeriesImportModal` wired into `/videos` URL bar
7. `SeriesCard` + grouping logic in `/videos` grid
8. Progress polling (covered by SeriesCard + detail page)
9. `/series/[id]` detail page
10. Manual smoke test: paste URL → preview → import → progress → grouped card

## Notes
- Background ingest uses FastAPI `BackgroundTasks` (per-process, dies with worker). Fine for pre-launch ≤50 videos.
- "done" status even with partial failures — partial import is a UX success. Only catastrophic = "failed".
