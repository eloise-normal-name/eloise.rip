# OpenAI Image Input Reference

Last updated: March 17, 2026

## Purpose

This note exists so future agents and reviewers do not need to keep re-searching the same OpenAI image-input constraints when touching the content manager's article-generation flow.

This repo uses OpenAI image understanding through the Responses API by sending `input_image` items, sometimes as Base64 data URLs. The practical question for this codebase is:

- which image delivery methods are documented
- which image formats are clearly documented as supported
- what the repo should assume when handling local media files

## Official OpenAI References

### 1. Images and vision guide

OpenAI's Images and vision guide documents that image inputs can be provided:

- as a fully qualified image URL
- as a Base64-encoded data URL
- as a file ID

Relevant pages:

- https://platform.openai.com/docs/guides/images-vision
- https://developers.openai.com/api/docs/guides/images-vision

Relevant examples on that page use:

- `.jpg` files for Base64 examples
- standard image URLs for `input_image`

Useful anchors from the current docs snapshot:

- Base64 image input is described around lines 690-692 and 995-999 in the developer-doc rendering
- Responses API `input_image` examples appear around lines 1032-1044 and 1187-1197

### 2. Assistants deep dive

The Assistants deep dive explicitly states:

- supported image content types include `png`, `jpg`, `gif`, and `webp`

Reference:

- https://developers.openai.com/api/docs/assistants/deep-dive

Useful current location:

- line 794 in the developer-doc rendering

Even though this page is for Assistants and Assistants are deprecated, it is still an official OpenAI statement about supported vision image content types.

### 3. Vision fine-tuning guide

The vision fine-tuning guide explicitly states:

- images must be `JPEG`, `PNG`, or `WEBP`

Reference:

- https://platform.openai.com/docs/guides/vision-fine-tuning

This is not the same endpoint as Responses, but it is another current official OpenAI doc that limits accepted image formats to mainstream web image formats and does not list AVIF, TIFF, or BMP.

## Repo Interpretation

Until OpenAI documentation explicitly says otherwise, this repo should treat the following as documented-safe generation inputs:

- `.jpg`
- `.jpeg`
- `.png`
- `.gif`
- `.webp`

This repo should **not** assume the following are safe to send directly to OpenAI vision inputs:

- `.avif`
- `.tif`
- `.tiff`
- `.bmp`

## Implementation Rule For This Repo

For article generation in `content_manager`:

- upload and publish flows may still accept broader media formats for site purposes
- the OpenAI generation boundary must only send documented-safe image formats
- unsupported local image formats must be either:
  - converted to a documented-safe format before calling OpenAI, or
  - rejected with a clear validation error

## Why This Matters Here

This repo's media library already contains AVIF assets under `content/media/images/`. That is fine for site publishing, but it is not enough evidence that those files are safe to reuse as OpenAI generation inputs.

If future reviewers ask why generation rejects AVIF/TIFF/BMP while publish still allows them, the answer is:

- site media compatibility and OpenAI input compatibility are different constraints
- the repo intentionally keeps those boundaries separate

## Update Policy

If OpenAI later publishes a current official doc that explicitly allows AVIF or other additional image formats for Responses/vision inputs, update this file and then relax the generation validation accordingly.
