# Voice Recorder Known Issues

This document tracks known bugs and issues with the voice recorder feature.

## Active Bugs

No active bugs currently tracked.

---

## Resolved Bugs

### Pitch Trace Oscillations for Pure Sine Wave Test Signal

**Status:** Fixed  
**Severity:** Low  
**Reported:** 2026-02-17  
**Fixed:** 2026-02-17  
**PR:** #[copilot/fix-pitch-detection-visualizer]  

**Description:**
The 220 Hz sine wave test signal produced a choppy/oscillating pitch trace instead of a flat horizontal line. The visualizer showed the pitch jumping between approximately 220 Hz and 73 Hz (a subharmonic).

**Expected Behavior:**
A pure sine wave at a constant 220 Hz should produce a flat horizontal line in the pitch trace visualization.

**Actual Behavior:**
The pitch trace showed visible oscillations, jumping between the correct frequency (~220 Hz) and a subharmonic (~73 Hz, which is 220/3).

**Root Cause:**
Two issues in the autocorrelation-based pitch detection algorithm:
1. **Integer quantization**: Lag values were discrete integers, causing quantization noise that manifested as small oscillations
2. **Octave jumping**: The algorithm was finding strong correlation peaks at both the fundamental period and at 3× the period (subharmonic), and would alternate between selecting these peaks

**Solution Implemented:**
1. **Parabolic interpolation** around the correlation peak for sub-sample precision:
   - Fits a parabola through the peak and its neighbors
   - Calculates refined fractional lag position
   - Reduces quantization noise from ~±0.5 samples to ~±0.05 samples
   
2. **Octave error prevention** with intelligent peak selection:
   - Prefers smaller lags (higher frequencies) when correlations are similar
   - Uses 1% hysteresis threshold to avoid spurious peak switches
   - Prevents jumping to harmonically-related subharmonics

**Results:**
- 220 Hz test signal now produces **perfectly flat horizontal line**
- Standard deviation reduced from ~73 Hz (due to octave jumping) to **0.00 Hz**
- Detected frequency: 222.73 Hz (consistent, accurate)
- No oscillations or jumps visible in visualization

**References:**
- Fix implementation: `content/pages/voice-recorder/pitch-detector.js` lines 36-74, 99-117
- Before screenshot: https://github.com/user-attachments/assets/48a8e022-7238-42f8-907e-f575cd309f68
- After screenshot: https://github.com/user-attachments/assets/05d3e48a-934a-42e4-b67e-082fbb0c460a
- Commit: ef16245

---

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
