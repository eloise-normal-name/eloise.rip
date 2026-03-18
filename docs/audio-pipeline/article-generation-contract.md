# Article Generation And Publish Contract

Last updated: March 17, 2026

## Purpose

This document records the current behavior contract for article generation and publish flows in `content_manager`.

Use this when:

- reviewing changes to `content_manager/app.py`
- changing the author article UI
- changing generation source resolution
- deciding whether a reviewer comment reflects an actual bug or a documented contract

## Route Summary

### `POST /api/article/generate`

Accepted request body:

```json
{
  "media_jobs": ["job-id-1"],
  "media_paths": ["video/example.mp4", "images/example.jpg"]
}
```

Contract:

- `media_jobs` and `media_paths` must be arrays
- either source may be empty, but at least one total media source must be provided
- `media_paths` must stay under `content/media/`
- generation is review-only; it does not publish automatically

Success returns:

- `title_ideas`
- `summary`
- `category`
- `tags`
- `content_markdown`
- `location`
- `likely_named_locations`
- `time_of_day`
- `source_media`
- `warnings`

Validation failures should return 4xx JSON errors.

### `POST /api/article/publish`

Accepted request body includes:

```json
{
  "title": "My Post",
  "summary": "Short summary",
  "category": "Pole Dance",
  "tags": "Tag A, Tag B",
  "thumbnail": "media/video/example.jpg",
  "content": "Body text",
  "media_jobs": ["job-id-1"],
  "media_paths": ["video/example.mp4"]
}
```

Contract:

- `title` is required
- `content` is required
- `media_jobs` and `media_paths` must be arrays
- uploaded media jobs must be complete before publish uses them
- existing library media paths are allowed and can contribute embed syntax
- path validation failures should return 4xx JSON errors, not 500s

## Source Resolution Rules

Generation can use two source classes:

### Uploaded job sources

- read from in-memory `state.media_jobs`
- must have `status == "done"`
- images use the original uploaded file as the model image input
- videos use the generated poster JPG as the model image input

### Existing library sources

- resolved relative to `content/media/`
- must not escape that root
- videos require a companion poster JPG for generation
- existence is validated when used

## Metadata Rules

Generation expects one canonical media source with:

- usable capture time
- usable location
- derived time-of-day

If no source has both location and capture time, generation fails with a validation error.

If multiple sources disagree, generation continues with:

- the first source that has both required metadata
- warnings describing metadata disagreements

## OpenAI Input Rules

This repo has two separate compatibility layers:

### Site-media compatibility

The site pipeline can publish broader media formats, including AVIF for images.

### OpenAI generation compatibility

The generation boundary should only send documented-safe image formats to OpenAI vision inputs.

Current repo rule:

- allowed generation image formats: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
- unsupported generation image formats must be rejected or converted before the OpenAI request

Reference:

- [openai-image-input-reference.md](./openai-image-input-reference.md)

## Publish Embedding Rules

When publish builds article content:

- videos become `[[video:<stem>]]`
- one image becomes plain markdown image syntax
- multiple images become `[[carousel:...]]`

Existing library media can contribute to that prefix. This is intentional and should not be treated as upload-only behavior.

## Git Commit Scope

With auto-commit enabled, publish is intentionally scoped to:

- the new article file
- files created by uploaded media jobs in the current session

Publish is not required to discover and add unrelated preexisting files already sitting in `content/media/`.

That is part of the curated-library contract, not a bug.

## UI Expectations

The article authoring UI is expected to support:

- media upload and polling
- existing media path entry
- explicit `Generate From Media`
- editable generated results
- preview
- draft save
- publish

If validation fails, the UI should receive a usable JSON error message rather than a generic server crash.
