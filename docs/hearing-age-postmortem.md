# Hearing Age Guesser Postmortem

## Scope and evidence reviewed

This postmortem is based on the in-repo development trail for Hearing Age Guesser:

- Commit history for the hearing-age page and related docs/tests
- Merge PR sequence (#59 through #68)
- Review-fix commits that explicitly reference PR feedback

No standalone chat transcript is stored in this repository, so the closest "chat memory" proxy is the sequence of plan/review/fix commits and PR merges.

## Timeline summary

1. **Initial feature landing (PR #59)**
   - Added the Hearing Age Guesser page and core sweep interaction.
   - Commit: `8db5422` (`feat: add hearing age guesser page`).
2. **Reliability fix for audio startup (PR #60)**
   - Addressed signal playback reliability.
   - Commit: `5c914f9` (`feat: ensure hearing age signal reliably starts playing`).
3. **Review-response cycle (PR #61, #62, #63)**
   - Iterative fixes: review comments, preview capture update, and hearing-age review feedback.
   - Commits: `c43b17b`, `8f026d3`, `4d28de8`.
4. **UI and share-image iteration (PR #65, #66, #68)**
   - Gauge refresh and layout work followed by conflict recovery and visual artifact cleanup.
   - Commits: `da05f26`, `be55608`, `ed1ba31`, `a5e63cf`, `aee92ad`.

## What went well

- **Fast incremental delivery:** The feature shipped quickly and then improved through tightly scoped follow-up PRs.
- **Review responsiveness:** Multiple commits explicitly closed review feedback, which improved traceability.
- **Cross-browser hardening:** The explicit oscillator/gain connection logic improved Safari compatibility and prevented silent failures.
- **Test tooling support:** A Playwright preview script exists for repeatable visual checks of the started-sweep state.

## What did not go well

- **Repeated rework in share rendering:** Several follow-up fixes targeted gauge labels, layout alignment, cherry-pick recovery, and artifact removal.
- **Late visual QA signal:** Some UI defects were only caught after merge/review rather than blocked earlier by deterministic checks.
- **State complexity drift:** Mid-cycle refactor was needed to simplify app/share state management, indicating complexity grew during iterative patching.
- **Doc drift during rapid iteration:** Roadmap docs describe goals well, but execution learnings and “definition of done” checks were not captured alongside each change.

## Root-cause analysis

### 1) Share-image rendering had weak invariants

The share-image path likely relied on styling/layout assumptions that were not centrally asserted (e.g., gauge geometry, label positions, clipping boundaries). Without hard checks, regressions survived until manual review.

### 2) Preview and functional checks were under-specified

The project had preview capture capability, but there was no strict checklist requiring a before/after screenshot and explicit visual acceptance criteria per PR for hearing-age UI changes.

### 3) Multi-PR iteration increased merge/cherry-pick risk

Frequent small branches improved speed but raised conflict risk and introduced restoration commits, suggesting branch synchronization and conflict-resolution verification could be more structured.

## Recommended documentation changes for faster development

## 1) Add a hearing-age quality gate checklist

Create a short checklist in `docs/hearing-age-roadmap.md` (or a new `docs/hearing-age-checklist.md`) that must be run for any hearing-age PR:

- Audio starts in one click on Chrome + Safari-compatible path
- Start/Stop/Reset states verified (button text, disabled states, result visibility)
- Share image verified against visual criteria (no clipping/artifacts, label alignment)
- Preview screenshot updated when UI changes
- `python validate_output.py` passes

## 2) Define share-render acceptance criteria in docs

Document exact invariants for the generated share image:

- Gauge arc bounds
- Needle pivot and rotation limits
- Label baseline and spacing rules
- Safe margins to avoid edge artifacts

This reduces subjective review feedback and prevents repeated layout-fix PRs.

## 3) Add a "review feedback log" section per feature doc

For hearing-age docs, add a compact table:

- Issue observed
- Fix commit hash
- Validation performed
- Status (FIXED / VERIFIED)

This mirrors the AGENTS review-resolution pattern and avoids rediscovering the same concerns across PRs.

## 4) Add a "branch sync before polish" note

Before final UI polish PRs, document a required step:

- Rebase/merge latest target branch
- Re-run preview + validator
- Confirm share-image output after conflict resolution

This is a low-cost way to prevent “restore after cherry-pick conflict” regressions.

## 5) Add a one-paragraph "done means" definition for experiments

For experiment features like Hearing Age Guesser, define done as:

- Stable core interaction
- Cross-browser audio sanity path
- Reproducible preview artifact
- Documented caveats/non-medical framing

This helps stop feature drift and limits late-cycle cleanup.

## Suggested next edits (small, concrete)

1. Update `docs/hearing-age-roadmap.md` with a **Quality Gate** section.
2. Add a `docs/hearing-age-share-render-spec.md` with explicit layout invariants.
3. Add a lightweight PR template snippet for hearing-age UI changes requiring screenshot + validator output.

