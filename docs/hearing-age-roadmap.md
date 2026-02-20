# Hearing Age Guesser Plan

Quick tone-sweep experiment that estimates hearing age from the last audible frequency. Mirrors the voice recorder page structure (inline CSS/JS includes, minimal dependencies).

## Iteration goals
- MVP: reliable sweep from 8-20 kHz, clear controls, and inline age estimate copy that stresses "not medical advice."
- Comfort & safety: gentle gain defaults, visible progress, and one-tap reset to avoid blasting tones.
- Calibration path: adjustable start/end frequencies, smaller steps near the cutoff, and a "play steady tone" helper for debugging.
- Visualization: sparkline of recent frequencies and a log of "last audible" values across reruns.
- Accessibility: keyboard-friendly controls, focus states, and text updates that mirror button actions.

## Agent prompts
- **UI polish:** "Refine the hearing-age page layout to stay consistent with the voice recorder styling, keeping the three-button control stack and improving mobile spacing."
- **Audio behavior:** "Tighten the sweep logic: keep gain tame, make increments adaptive near 14-18 kHz, and stop oscillators cleanly between runs."
- **Data/verbiage:** "Rework the age estimation copy to be clearer about playfulness and to cite the cutoff frequency in both Hz and kHz."
- **QA:** "Add a lightweight scriptable test that sanity-checks the sweep progress math (0-100%) and the age estimator interpolation edges."
