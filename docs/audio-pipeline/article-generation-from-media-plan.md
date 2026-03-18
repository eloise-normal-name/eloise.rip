# Article Generation From Media Plan

Last updated: March 17, 2026

## Goal

Add an explicit generation flow to the admin article page so uploaded media can produce:

- title ideas
- summary text
- category
- tag suggestions
- markdown body copy

The generation must be grounded in:

- uploaded media content
- extracted location metadata
- extracted capture time
- derived time of day

## Non-Goals

- auto-publishing generated content
- background job orchestration for generation
- sunrise/sunset-based time-of-day logic
- manual location or time-of-day override fields in v1
- full video upload to the model in v1

## API Contract

### `POST /api/article/generate`

Request body:

```json
{
  "media_jobs": ["job-id-1", "job-id-2"]
}
```

Success response:

```json
{
  "status": "ok",
  "title_ideas": ["Idea 1", "Idea 2", "Idea 3"],
  "summary": "Short summary",
  "category": "Pole Dance",
  "tags": ["Tag A", "Tag B"],
  "content_markdown": "Markdown body",
  "location": "Seattle, Washington, United States",
  "likely_named_locations": ["Trinity Pole Studio"],
  "time_of_day": "evening",
  "source_media": ["job-id-1", "job-id-2"],
  "warnings": ["Second asset missing GPS metadata."]
}
```

Failure response:

```json
{
  "error": "No uploaded media includes both capture time and location metadata."
}
```

## Metadata Extraction

### Images

- Read EXIF from the original uploaded file with Pillow.
- Extract `DateTimeOriginal`, `DateTimeDigitized`, or `DateTime`.
- Extract GPS latitude and longitude from EXIF GPS tags.

### Videos

- Read metadata from the original uploaded file with `ffprobe`.
- Extract `creation_time` from stream or format tags.
- Extract GPS/location tags when present.
- Use the generated poster image as the visual input for model generation.

### Canonical Metadata Selection

- Scan completed uploaded media in upload order.
- Choose the first asset that has both:
  - usable capture time
  - usable location
- Use that asset as the canonical location/time context.
- Use all uploaded media as visual context.
- If assets disagree on metadata, continue with the canonical asset and return warnings.

## Location Resolution And Time Of Day

### Location

- Reverse geocode extracted coordinates into a readable label.
- Prefer a compact place string assembled from available geocoder fields:
  - city/town/village/suburb
  - state/region
  - country
- Enrich the prompt with likely named venue matches from a curated location map when the resolved city/category pair strongly suggests one.

### Time Of Day

Derive from the extracted local capture hour:

- `early morning`: 05:00-08:59
- `morning`: 09:00-11:59
- `afternoon`: 12:00-16:59
- `evening`: 17:00-20:59
- `night`: 21:00-04:59

## OpenAI Integration

Required env vars:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `GEOCODER_USER_AGENT`

Implementation shape:

- server-side HTTP call from Flask
- multimodal request with text instructions plus uploaded media inputs
- images use the original uploaded image bytes when supported
- videos use poster JPG bytes

Prompt requirements:

- describe visible content conservatively
- ground writing in detected location and time of day
- use only existing site categories and tags
- avoid inventing details that are not visible or extracted
- return structured JSON only

## UI Behavior

Add to the article page:

- `Generate From Media` button
- metadata summary panel
- generation status/error surface
- clickable title suggestions

Behavior:

- generation is explicit and user-triggered
- generated fields remain editable
- publish continues to use the existing workflow
- if metadata is incomplete, generation fails with a clear message and no fields are overwritten

## Acceptance Criteria

- plan document exists before implementation lands
- image with EXIF location and capture time can generate a draft pack
- video with usable metadata can generate a draft pack using poster imagery
- incomplete metadata returns a clear error
- existing preview, draft save, upload, and publish flows still work
- published markdown format remains unchanged except for user-reviewed generated text
