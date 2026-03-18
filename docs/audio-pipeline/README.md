# Audio Pipeline And Content Manager Docs

Last updated: March 17, 2026

## Purpose

This folder is the canonical documentation set for the local `content_manager` app and the related admin media/article pipeline.

Future agents should start here before changing `content_manager/`, the admin UI, or the article-generation flow.

## Start Here

- [agent-quick-reference.md](./agent-quick-reference.md)
  - shortest path to the repo's actual contracts
  - use this first during reviews or small fixes
- [content-manager-architecture.md](./content-manager-architecture.md)
  - code structure, service boundaries, and main flows
- [admin-upload-page-design-implementation.md](./admin-upload-page-design-implementation.md)
  - operational runbook for the locally hosted admin stack

## Generation Docs

- [article-generation-contract.md](./article-generation-contract.md)
  - current API/UI contract for article generation and publish behavior
- [article-generation-from-media-plan.md](./article-generation-from-media-plan.md)
  - design intent and acceptance criteria
- [article-generation-style-plan.md](./article-generation-style-plan.md)
  - writing-style guidance for generated copy
- [openai-image-input-reference.md](./openai-image-input-reference.md)
  - official OpenAI image-input constraints relevant to this repo

## Why These Docs Exist

The same failures have repeated across agent runs and reviews:

- confusing site-media compatibility with OpenAI image-input compatibility
- re-flagging documented local dependency contracts as novel bugs
- assuming existing `content/media/` references should behave like new uploads
- treating local restart/process cleanup behavior as accidental
- spending time rediscovering API contracts already implied by current code

This folder is intended to stop that loop.

## Update Rule

When behavior changes in `content_manager/`, update the smallest canonical doc here at the same time:

- architecture change -> update [content-manager-architecture.md](./content-manager-architecture.md)
- API/UI contract change -> update [article-generation-contract.md](./article-generation-contract.md)
- OpenAI image-input assumption change -> update [openai-image-input-reference.md](./openai-image-input-reference.md)
- operations/startup change -> update [admin-upload-page-design-implementation.md](./admin-upload-page-design-implementation.md)
