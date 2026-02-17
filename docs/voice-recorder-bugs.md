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

### Canvas Context Loss on Tab Switch

**Status:** Fixed  
**Severity:** Medium  
**Reported:** 2026-02-17  
**Fixed:** 2026-02-17  
**PR:** #[copilot/fix-voice-visualizer-canvas-issue]  

**Description:**
The voice visualizer canvas could lose its rendering context when switching browser tabs, especially on mobile devices or in low-memory situations. When the context was lost, the visualization would disappear and not recover.

**Expected Behavior:**
The canvas visualization should persist and continue working after switching tabs or when the browser temporarily reclaims resources.

**Actual Behavior:**
The canvas could lose its rendering context, causing the visualization to stop working. The canvas would appear blank or frozen.

**Root Cause:**
- Canvas 2D contexts can be lost when tabs are backgrounded (browser resource management)
- The code obtained the context once in the constructor and never validated it was still available
- No event handlers for `contextlost` or `contextrestored` events
- No checks before rendering operations to detect if context was lost

**Solution Implemented:**
1. Added `contextlost` event listener to prevent default behavior and prepare for restoration
2. Added `contextrestored` event listener to automatically restore the visualization
3. Implemented `restoreContext()` method to:
   - Get a fresh 2D context from the canvas
   - Redraw the current visualization state (background, bands, pitch trace)
4. Implemented `ensureContext()` method to:
   - Check if context is lost using `isContextLost()` API (where available)
   - Attempt automatic restoration
   - Return false to skip the current frame if context was just restored
5. Updated `paintFrame()` and `renderPitchTrace()` to call `ensureContext()` before any drawing operations

**Browser Compatibility:**
- `isContextLost()` API may not be available in all browsers (particularly Safari)
- Event handlers work in modern browsers
- Graceful degradation: if methods aren't available, behavior is unchanged from before

**References:**
- Implementation: `content/pages/voice-recorder/audio-visualizer.js` lines 37-63
- MDN Documentation: [contextlost event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/contextlost_event)
- Commit: 3c621bc

---

## Notes

- This document should be updated whenever new bugs are discovered or resolved
- Reference this document in PR descriptions when fixing bugs
- Link to relevant commits and PRs for traceability
