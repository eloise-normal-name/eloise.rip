# Voice Recorder Test Scenarios

## Purpose
This document lists manual test scenarios to perform before releases or after significant changes to the voice recorder functionality.

## Critical Test Scenarios

### Multi-Clip Recording and Playback
**Status:** Added February 2026 to prevent regression of multi-clip video storage bug

**Steps:**
1. Open the voice recorder page
2. Record the first clip (speak for 3-5 seconds)
3. Wait for "Video ready" status message
4. Record a second clip (speak for 3-5 seconds)
5. Wait for "Video ready" status message
6. Record a third clip (speak for 3-5 seconds)
7. Wait for "Video ready" status message
8. Click the play button on the first clip
9. Verify the first clip video plays correctly with audio
10. Click the play button on the second clip
11. Verify the second clip video plays correctly with audio
12. Click the play button on the third clip
13. Verify the third clip video plays correctly with audio
14. Go back and play the first clip again
15. Verify it still plays correctly

**Expected Results:**
- All three clips should be playable
- Each clip should show its own recorded video with waveform visualization
- No clip should show a black screen or fail to play
- The video and audio should be synchronized for each clip

**Known Failure Mode:**
- Bug fixed in PR: Only the most recent clip was playable; older clips had invalid video URLs

### Basic Recording
**Steps:**
1. Open the voice recorder page
2. Click the "Record" button (circle icon)
3. Grant microphone permission if prompted
4. Speak for 5 seconds
5. Observe the waveform visualization updates in real-time
6. Click the "Stop" button (square icon)
7. Wait for "Recording ready" and "Video ready" status messages

**Expected Results:**
- Microphone access granted successfully
- Waveform animates during recording
- Recording stops cleanly
- Status shows successful recording with file size details

### Playback
**Steps:**
1. Complete a recording (see "Basic Recording")
2. Click the play button (triangle icon) on the clip
3. Observe the playback on the canvas
4. Wait for playback to complete
5. Click the play button again to replay

**Expected Results:**
- Video plays with audio on the canvas
- Playback shows the waveform visualization from recording
- Audio is synchronized with video
- Playback can be repeated multiple times

### Download/Share Video
**Steps:**
1. Complete a recording (see "Basic Recording")
2. Click the "🎬" button on a clip
3. If Web Share API is available, share to a target app
4. If not available, verify download starts

**Expected Results:**
- On mobile/supported browsers: Share dialog appears
- On desktop/unsupported browsers: File downloads with random two-word filename
- File is playable in external video player
- Audio and video are present and synchronized

### Download/Share Audio
**Steps:**
1. Complete a recording (see "Basic Recording")
2. Click the "🎵" button on a clip
3. If Web Share API is available, share to a target app
4. If not available, verify download starts

**Expected Results:**
- On mobile/supported browsers: Share dialog appears
- On desktop/unsupported browsers: File downloads with random two-word filename
- File is playable in external audio player
- Audio quality is good

### Clip Management
**Steps:**
1. Record 3 clips (see "Multi-Clip Recording and Playback")
2. Click on different clips to select them
3. Double-click a clip name
4. Enter a new name and press OK
5. Click the "✕" button on the middle clip
6. Verify the clip is deleted

**Expected Results:**
- Selected clip is highlighted
- Clip can be renamed successfully
- Deleted clip is removed from the list
- Other clips remain intact and playable

### Pitch Detection
**Steps:**
1. Click the "Test Signal (220 Hz)" button
2. Observe the pitch trace on the visualization
3. Click the button again to stop
4. Verify the pitch trace remains visible after stopping
5. Click "Record" and sing a steady note
6. Observe the pitch trace during recording
7. Stop recording
8. Verify the pitch trace remains visible after stopping

**Expected Results:**
- Test signal shows stable blue pitch trace at ~220 Hz
- Pitch trace remains visible (frozen) after test signal stops
- Voice recording shows pitch trace that follows the sung note
- Pitch trace is smooth (not jittery)
- Pitch trace remains visible after recording stops
- Pitch trace is visible in the recorded video playback

### Pitch Configuration
**Steps:**
1. Adjust the "Min Frequency" slider
2. Adjust the "Max Frequency" slider
3. Verify min cannot be >= max and vice versa
4. Adjust "Primary Threshold" slider
5. Adjust "Secondary Threshold" slider
6. Adjust "Pitch Smoothing" slider
7. Record or use test signal to observe changes

**Expected Results:**
- Sliders update the visualizer parameters in real-time
- Min/Max frequency constraints are enforced
- Changes affect pitch detection sensitivity
- Values are displayed next to each slider

### Browser Capabilities Check
**Steps:**
1. Open the voice recorder page
2. Expand the status details
3. Review the browser capabilities section

**Expected Results:**
- Shows checkmarks for getUserMedia, MediaRecorder, AudioContext
- Lists supported MIME types with checkmarks
- Shows user agent string
- Indicates if any features are unsupported

## Edge Cases

### Rapid Start/Stop
**Steps:**
1. Click Record
2. Immediately click Stop (within 1 second)
3. Verify recording completes

**Expected Results:**
- Very short recording is saved
- No errors occur
- Clip is playable (even if very short)

### No Microphone Permission
**Steps:**
1. Deny microphone permission
2. Click Record
3. Observe error message

**Expected Results:**
- Clear error message about microphone permission
- Instructions to check browser permissions
- No recording is created

### Multiple Playbacks
**Steps:**
1. Play a clip
2. While it's playing, click play on a different clip
3. Verify the first playback stops and second starts

**Expected Results:**
- Only one clip plays at a time
- Previous playback stops cleanly
- No audio overlap

### Delete While Playing
**Steps:**
1. Play a clip
2. While it's playing, click the delete button
3. Verify playback stops and clip is removed

**Expected Results:**
- Playback stops immediately
- Clip is removed from list
- No errors occur

## Performance Tests

### Long Recording
**Steps:**
1. Record for 60+ seconds
2. Stop recording
3. Play back the recording

**Expected Results:**
- Recording completes successfully
- File size is reported
- Playback works for entire duration

### Many Clips
**Steps:**
1. Record 10+ clips
2. Play each clip
3. Delete a few clips
4. Record more clips

**Expected Results:**
- All clips remain functional
- No performance degradation
- Memory usage stays reasonable (check browser dev tools)

## Browser Compatibility

Test on:
- ✓ Chrome/Edge (desktop)
- ✓ Firefox (desktop)
- ✓ Safari (desktop)
- ✓ Chrome (Android)
- ✓ Safari (iOS)

For each browser, run at minimum:
- Basic Recording
- Playback
- Multi-Clip Recording and Playback

## Regression Prevention

After any changes to `voice-recorder.js`, always run:
1. **Multi-Clip Recording and Playback** (critical for URL management bug)
2. **Basic Recording** (ensures core functionality)
3. **Playback** (ensures video rendering works)

## Notes

- Test signal is useful for testing without using the microphone
- Browser developer console may show additional helpful debug info
- Check browser console for any JavaScript errors during testing
- File sizes should be reasonable (a few KB per second for audio, larger for video)
