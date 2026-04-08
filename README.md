# RaceControl external image sources (2026)

This folder contains a **non-F1** source-page manifest for the 2026 grid.

## What it is
- `manifest-2026.json` with 22 drivers and 11 teams.
- Each entry contains a `source_page` URL.

## Why source pages and not hotlinked direct image files
Direct external image URLs tend to be brittle, can break without notice, and may be blocked for hotlinking. The safer production flow is:
1. Use the source page.
2. Extract/download the lead/infobox image.
3. Save it locally into your repo under `assets/heroes/...`.
4. Let the existing `driver -> team -> fallback` logic use local files.

## Suggested repo destination
This folder itself can live anywhere temporary, but the final downloaded images should be placed in:
- `assets/heroes/drivers/`
- `assets/heroes/teams/`
- `assets/heroes/fallback/`

## Suggested Codex task
- Read `manifest-2026.json`
- For each `source_page`, fetch the lead image
- Download it into the correct local asset folder
- Update the hero registry to point to local files only
