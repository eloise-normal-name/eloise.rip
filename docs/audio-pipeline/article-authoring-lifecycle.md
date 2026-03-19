# Article Authoring Lifecycle

Last updated: March 17, 2026

## Purpose

This is the canonical design document for article creation, drafting, save/load, metadata-aware generation, preview, and publish inside `content_manager`.

Metadata is a first-order concern in this workflow:

- manual drafting and publish can proceed without complete metadata
- AI generation cannot
- save/load must preserve media references and re-evaluate metadata state on resume
- generation eligibility should be computed from the current in-progress draft state, not only the last saved draft snapshot

Important current caveat:

- Not all media in the library has complete metadata right now.
- See [media-metadata-coverage-status.md](./media-metadata-coverage-status.md).

## Current Lifecycle

The current authoring flow combines article fields, media references, metadata extraction, generation readiness, and publish behavior in one UI. The editing page should aggregate time/location/media descriptions into one visible draft-state summary.

```mermaid
flowchart TD
    A[Open /admin/articles/new] --> B[Edit article fields]
    B --> C{Attach media?}
    C -->|Uploaded media| D[Upload image/video]
    C -->|Existing library media| E[Enter media_paths]
    C -->|No media| F[Manual drafting only]
    D --> G[Extract metadata from uploaded media]
    E --> H[Resolve library file on demand]
    G --> I{Complete time + location?}
    H --> J{Complete time + location?}
    I -->|Yes| K[Generation eligible]
    I -->|No| L[Generation blocked but draft still valid]
    J -->|Yes| K
    J -->|No| L
    B --> M[Compute current draft state]
    M --> N{Current draft media state generation-eligible?}
    N -->|Yes| O[Enable Generate From Media]
    N -->|No| P[Show aggregated blockers and metadata summary]
    B --> Q[Autosave / manual save]
    Q --> R[In-memory draft store]
    K --> S[Generate article draft]
    L --> P
    F --> T[Preview or publish manually]
    O --> S
    S --> U[Review/edit generated fields]
    U --> T
    P --> T
    T --> V[Publish article markdown]
```

### Current product truths

- Saving a draft does not require metadata completeness.
- Loading a draft must reconstruct media references and metadata state.
- The editing page should show an aggregated draft-state summary for media, location, and time.
- Generation requires at least one canonical source with usable capture time and usable location.
- Publish requires title/content and valid media references, not generation eligibility.

## Metadata Dependency Model

### Images

```mermaid
flowchart TD
    A[Uploaded or library image] --> B[Pillow EXIF read]
    B --> C{Capture time + GPS found?}
    C -->|Yes| F[Evaluate metadata status]
    C -->|No| D[exiftool fallback]
    D --> E{Capture time + GPS found?}
    E -->|Yes| F
    E -->|No| F
    F --> G{GPS available?}
    G -->|Yes| H[Reverse geocode]
    G -->|No| I[Add missing GPS warning]
    H --> J[Compact place name or coordinates]
    J --> K[Metadata status ready/incomplete]
    I --> K
```

### Videos

```mermaid
flowchart TD
    A[Uploaded or library video] --> B[ffprobe]
    B --> C[Tag extraction and normalization]
    C --> D[Parse capture time]
    C --> E[Parse ISO6709 GPS/location]
    E --> F{GPS available?}
    F -->|Yes| G[Reverse geocode]
    F -->|No| H[Add missing GPS warning]
    D --> I{Capture time available?}
    I -->|No| J[Add missing time warning]
    G --> K[Location label]
    K --> L{Library video poster exists?}
    H --> L
    J --> L
    L -->|Yes| M[Metadata/generation status]
    L -->|No| N[Generation blocked for this source]
```

### What counts as usable for generation

- a source must provide:
  - `captured_at`
  - `location_name`
  - `time_of_day`
- generation can use mixed sources, but one canonical source must satisfy all three
- metadata disagreements are warnings, not automatic failure
- existing-library video generation additionally requires a poster JPG

### Expected trouble categories

- partial or missing EXIF/QuickTime tags
- metadata stripped during export or prior conversion
- geocoder/network failure
- approximate or heuristic location labels
- missing poster JPG for existing-library videos
- disagreement between multiple sources
- local-time versus UTC capture-time ambiguity in video metadata

These are workflow constraints to design around, not just incidental bugs.

## Generation Eligibility State

Generation eligibility should depend on the current in-progress draft state:

- current uploaded job ids attached to the editor
- current `existing_media_paths` text in the editor
- current metadata availability for those references
- current blockers and warnings aggregated onto the editing page

It should not depend solely on whether the most recent autosave had a valid snapshot.

```mermaid
stateDiagram-v2
    [*] --> NoMedia
    NoMedia --> DraftStatePending: edit draft
    DraftStatePending --> MediaAttached: media refs present in current editor state
    DraftStatePending --> NoMedia: no media refs present
    MediaAttached --> MetadataIncomplete: no canonical time+location source
    MediaAttached --> GenerationEligible: canonical source available
    MetadataIncomplete --> DraftStatePending: change current draft media state
    GenerationEligible --> Generated: generate from media
    Generated --> DraftStatePending: edit draft or media state
    MediaAttached --> Publishable: title/content valid
    MetadataIncomplete --> Publishable: title/content valid
    GenerationEligible --> Publishable: title/content valid
    Generated --> Publishable: title/content valid
    Publishable --> Published: publish
```

Key rule: `Publishable` does not depend on `GenerationEligible`.

## Draft Save/Load

Current draft payload fields:

- `title`
- `summary`
- `category`
- `tags`
- `thumbnail`
- `existing_media_paths`
- `content`
- `media_jobs`

Drafts are currently in-memory only, so media references may go stale across process restarts.

```mermaid
sequenceDiagram
    participant Browser
    participant EditorJS as Article Editor JS
    participant DraftAPI as /api/article/draft
    participant DraftStore as In-memory Draft Store
    participant Metadata as Metadata Resolver
    participant DraftState as Current Draft State

    Browser->>EditorJS: open draft by id
    EditorJS->>DraftAPI: GET /api/article/draft/<id>
    DraftAPI->>DraftStore: load saved draft fields
    DraftAPI->>Metadata: resolve media refs + metadata state
    Metadata-->>DraftAPI: items, warnings, eligibility, blockers
    DraftAPI-->>EditorJS: draft + metadata snapshot
    EditorJS->>DraftState: recompute current in-editor draft state
    DraftState-->>EditorJS: aggregated media/time/location summary
    EditorJS-->>Browser: hydrate form and show warnings
```

On resume, the app should reconstruct:

- draft fields
- uploaded and existing-library media references
- metadata status per media item
- generation eligibility
- stale-reference warnings
- aggregated media/time/location descriptions shown directly in the editing page

## Target Less-Coupled Architecture

```mermaid
flowchart TD
    A[Article Routes] --> B[Article Authoring Service]
    B --> C[Draft Store]
    B --> D[Media Reference Resolver]
    D --> E[Metadata Resolver]
    B --> F[Generation Workflow]
    B --> G[Publish Workflow]
    G --> H[content/articles/...]

    D --> I[state.media_jobs]
    D --> J[content/media/...]
    E --> K[media_metadata extraction]
```

### Boundaries

- routes parse HTTP and return responses
- article authoring service owns save/load/list/hydration/publish orchestration
- current draft state should be resolvable independently of draft persistence
- media reference resolver normalizes uploaded-job and library-path selections
- metadata resolver computes per-item status, warnings, blockers, and canonical source
- generation workflow handles OpenAI-specific generation
- publish workflow handles article assembly and writing

## Contracts

### `DraftArticle`

- article fields
- attached uploaded job ids
- attached existing media paths
- metadata snapshot
- updated time

### Metadata snapshot

- resolved media items
- generation eligibility
- blocking reasons
- canonical location/time context
- warnings
- aggregated media summary
- aggregated location summary
- aggregated time summary

### Validation split

- generation validation:
  - requires canonical metadata source
  - may fail while draft remains editable and publishable
- publish validation:
  - requires title/content
  - requires valid media references used for embed generation
  - does not require metadata completeness

## Related Docs

- [media-metadata-coverage-status.md](./media-metadata-coverage-status.md)
- [content-manager-architecture.md](./content-manager-architecture.md)
- [article-generation-contract.md](./article-generation-contract.md)
