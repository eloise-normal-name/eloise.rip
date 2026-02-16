# Voice Recorder DOM Elements Reference

## Overview

This document maps the relationship between HTML elements defined in `voice-recorder.md` and their JavaScript references in `voice-recorder.js`. **When removing or renaming DOM elements, all corresponding JavaScript references must be updated.**

## Critical DOM Elements

The `VoiceRecorderApp` constructor initializes references to these DOM elements. If any required element is missing, the app will silently fail (early return on line 66-68).

### Required Elements

| Element ID | HTML Location | JavaScript Reference | Purpose |
|------------|---------------|---------------------|---------|
| `recordButton` | `voice-recorder.md:25` | `this.recordButton` (line 28) | Main record/stop button |
| `testSignalButton` | `voice-recorder.md:29` | `this.testSignalButton` (line 29) | 220Hz test signal generator |
| `debugMsg` | `voice-recorder.md` (in `<details>`) | `this.debugMsg` (line 30) | Status/debug output area |
| `recordingCanvas` | `voice-recorder.md:21` | `this.recordingCanvas` (line 31) | Live waveform visualization canvas |
| `playbackVideo` | `voice-recorder.md:22` | `this.playbackVideo` (line 32) | Video playback element |
| `clipsList` | `voice-recorder.md:36` | `this.clipsList` (line 33) | Container for recorded clips list |

### Validation Check

The constructor includes a validation check (lines 66-68):

```javascript
if (!this.recordButton || !this.testSignalButton || !this.debugMsg 
    || !this.recordingCanvas || !this.playbackVideo || !this.recordingCtx || !this.clipsList) {
    return;
}
```

**⚠️ If you remove any required element from the HTML, you MUST:**
1. Remove its reference from the constructor
2. Remove it from the validation check
3. Remove all usages throughout the JavaScript file
4. Test the page loads without errors

## Historical Context

### PR #21: Removed Global Playback/Save Buttons

PR #21 introduced per-clip controls and removed these global buttons:
- `playButton` (was referenced in constructor and at line 452)
- `saveVideoButton` (was referenced in constructor and at line 454)
- `saveAudioButton` (was referenced in constructor and at line 453)

**Issue:** The HTML was updated to remove these buttons, but JavaScript references remained, causing initialization failures.

**Fix:** Removed all references to these buttons in the fix PR.

## Maintenance Checklist

When modifying the voice recorder UI:

- [ ] Check `voice-recorder.md` for HTML element changes
- [ ] Update `voice-recorder.js` constructor to match (lines 27-33)
- [ ] Update validation check (lines 66-68) if required elements change
- [ ] Search for all usages: `grep -n "this\.elementName" voice-recorder.js`
- [ ] Run local build: `pelican content -o output -s pelicanconf.py`
- [ ] Test page loads without console errors
- [ ] Verify functionality works as expected

## Automated Validation

A GitHub Actions workflow validates that all `getElementById()` calls in JavaScript match existing HTML elements. See `.github/workflows/validate-dom-elements.yml`.

## Related Documentation

- [Voice Recorder Overview](voice-recorder.md)
- [Voice Recorder Roadmap](voice-recorder-roadmap.md)
