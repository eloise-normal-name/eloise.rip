# Hearing Age Guesser Plan

Quick tone-sweep experiment that estimates hearing age from the last audible frequency. Mirrors the voice recorder page structure (inline CSS/JS includes, minimal dependencies).

## Iteration goals
- MVP: reliable sweep from 8-20 kHz, clear controls, and inline age estimate copy that stresses "not medical advice."
- Comfort & safety: gentle gain defaults, visible progress, and one-tap reset to avoid blasting tones.
- Calibration path: adjustable start/end frequencies, smaller steps near the cutoff, and a "play steady tone" helper for debugging.
- Visualization: sparkline of recent frequencies and a log of "last audible" values across reruns.
- Accessibility: keyboard-friendly controls, focus states, and text updates that mirror button actions.

## Quality gate for future hearing-age PRs

Run this checklist before requesting review:

- Functional audio check: tone starts on first click and stops cleanly.
- State check: Start/Stop button text/state, result visibility, and reset behavior are correct.
- Share output check: gauge labels align, needle remains in bounds, and no clipping/white-edge artifacts appear.
- Preview check: update hearing-age screenshot artifact when UI changes.
- Validation check: run `python validate_output.py` and include result in PR notes.

Reference postmortem: `docs/hearing-age-postmortem.md`.

## Agent prompts
- **UI polish:** "Refine the hearing-age page layout to stay consistent with the voice recorder styling, keeping the three-button control stack and improving mobile spacing."
- **Audio behavior:** "Tighten the sweep logic: keep gain tame, make increments adaptive near 14-18 kHz, and stop oscillators cleanly between runs."
- **Data/verbiage:** "Rework the age estimation copy to be clearer about playfulness and to cite the cutoff frequency in both Hz and kHz."
- **QA:** "Add a lightweight scriptable test that sanity-checks the sweep progress math (0-100%) and the age estimator interpolation edges."

## Codex VS Code extension note
These shell command conventions are for the Codex agent running in the VS Code extension (PowerShell):

- Do not use `&&` in PowerShell command strings; use `;` or separate commands.
- Prefer single-quoted search patterns, e.g. `rg -n 'ageDetail|lastHeardValue' content/pages/hearing-age`.
- Use `--fixed-strings` for literal text containing quotes/symbols, e.g. `rg -n --fixed-strings 'class="notes"' content/pages/hearing-age/hearing-age.md`.
- When quoting gets complex, assign pattern text to a variable first, then pass the variable to `rg`.
