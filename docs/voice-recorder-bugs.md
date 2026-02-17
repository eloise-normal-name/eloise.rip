# Voice Recorder Known Issues

This document tracks known bugs and issues with the voice recorder feature.

## Active Bugs

### Pitch Trace Oscillations for Pure Sine Wave Test Signal

**Status:** Open  
**Severity:** Low  
**Reported:** 2026-02-17  
**PR:** #[copilot/change-background-voice-recorder]  

**Description:**
The 220 Hz sine wave test signal produces a choppy/oscillating pitch trace instead of a flat horizontal line. This is visible in the visualizer when the test signal button is active.

**Expected Behavior:**
A pure sine wave at a constant 220 Hz should produce a flat horizontal line in the pitch trace visualization.

**Actual Behavior:**
The pitch trace shows visible oscillations/variations around 220 Hz instead of remaining perfectly flat.

**Root Cause:**
The autocorrelation-based pitch detection algorithm has inherent variability due to:
- Finite buffer window analysis creating edge effects
- Integer quantization in lag calculation (samples are discrete)
- Correlation peak finding imprecision
- Frame-by-frame processing without inter-frame analysis

**Important Note:**
The smoothing parameter (currently 0.35) actually *reduces* the oscillations. Without smoothing (smoothing=1.0), the trace would be even more choppy. The smoothing is working as intended - the issue is in the pitch detection itself.

**Potential Solutions:**
1. **Parabolic interpolation** around the correlation peak for sub-sample precision
2. **Longer analysis windows** to reduce edge effects (trade-off: less responsive)
3. **Alternative pitch detection methods:**
   - Cepstrum analysis
   - Harmonic product spectrum (HPS)
   - YIN algorithm (improved autocorrelation)
4. **Adaptive smoothing** based on signal stability detection
5. **Multi-frame averaging** when signal is stable

**Workaround:**
None needed - the oscillations don't significantly impact voice training use case. Real voices naturally have more variation than a pure sine wave.

**References:**
- Pitch detection implementation: `content/pages/voice-recorder/pitch-detector.js`
- Smoothing implementation: `content/pages/voice-recorder/audio-visualizer.js` lines 74-109
- Screenshot showing issue: https://github.com/user-attachments/assets/271f7f8f-e971-4086-8244-e3682ae7c09c

---

## GitHub Project Tracking

To add this to GitHub Project #3:
1. Go to https://github.com/users/eloise-normal-name/projects/3
2. Click "Add item" → "Create new draft issue"
3. Title: "Pitch trace shows oscillations for pure sine wave test signal"
4. Copy relevant details from above
5. Set Type: Bug
6. Set Priority as needed

---

## Resolved Bugs

(None yet)

---

## Notes

- This document should be updated whenever new bugs are discovered or resolved
- Reference this document in PR descriptions when fixing bugs
- Link to relevant commits and PRs for traceability
