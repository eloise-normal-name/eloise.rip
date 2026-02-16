# Voice Recorder Roadmap

## Completed (Sprint 0 - Feb 2026)

### Core Features
- [x] Microphone access via getUserMedia
- [x] Real-time waveform visualization
- [x] Audio recording (MP4 format)
- [x] Video recording (canvas + audio)
- [x] Playback functionality
- [x] Save/download with Web Share API fallback

### Advanced Features
- [x] Pitch detection using autocorrelation
- [x] Real-time pitch trace overlay (80-400 Hz)
- [x] Pitch smoothing to reduce jitter
- [x] Pitch history visualization

### Documentation
- [x] Technical documentation (voice-recorder.md)
- [x] Architecture diagrams
- [x] Pitch detection plan document
- [x] Blog post announcement

---

## Sprint 1: UI/UX Improvements (Future)

### Goals
Improve user experience and add configuration options

### Tasks
- [ ] Add pitch range adjustment UI
  - Sliders for min/max Hz
  - Presets for different voice types (bass, tenor, alto, soprano)
  - Real-time preview of range on canvas
- [ ] Toggle pitch trace visibility
  - Show/hide button
  - Remember preference in localStorage
- [ ] Add visualizer style selector
  - Current waveform + pitch style
  - Alternative visualization styles (bars, circular, etc.)
- [ ] Settings panel
  - Collapsible settings UI
  - Pitch smoothing adjustment
  - Color customization

### Acceptance Criteria
- All controls are accessible and labeled
- Settings persist across page reloads
- UI is responsive on mobile devices

---

## Sprint 2: Enhanced Visualizations (Future)

### Goals
Add more interesting visualizer options

### Tasks
- [ ] Circular waveform visualizer
  - Radial waveform display
  - Rotating pitch trace
- [ ] Spectrogram view
  - Frequency over time heatmap
  - Toggle between waveform and spectrogram
- [ ] 3D visualization experiment
  - WebGL-based 3D waveform
  - Performance optimization for recording
- [ ] Multiple pitch trace styles
  - Line graph (current)
  - Filled area chart
  - Note name labels (C4, D4, etc.)

### Acceptance Criteria
- Performance maintains 60fps during recording
- Video recording captures all visualizations
- User can switch between visualizers smoothly

---

## Sprint 3: Audio Analysis Features (Future)

### Goals
Add more audio analysis capabilities

### Tasks
- [ ] Volume meter
  - Visual dB indicator
  - Clipping detection/warning
- [ ] Frequency analysis
  - Real-time FFT display
  - Formant visualization
- [ ] Pitch statistics
  - Average pitch over recording
  - Pitch range (min/max)
  - Stability metrics
- [ ] Audio effects
  - Real-time reverb
  - Echo
  - Pitch shift (playback only)

### Acceptance Criteria
- Analysis doesn't impact recording quality
- Statistics are accurate
- Effects are preview-only (don't affect saved files)

---

## Sprint 4: Sharing & Export (Future)

### Goals
Improve sharing and export options

### Tasks
- [ ] Multiple export formats
  - WebM video option
  - WAV audio option
  - GIF export for silent clips
- [ ] Custom filename generator
  - Timestamp-based names
  - User-defined prefix
  - Sequential numbering
- [ ] Social media optimization
  - Square (1:1) canvas option
  - Vertical (9:16) option
  - Optimized file sizes
- [ ] Cloud storage integration
  - Google Drive upload
  - Dropbox upload
  - Optional server backend

### Acceptance Criteria
- All export formats maintain quality
- File sizes are reasonable
- Uploads are secure and private

---

## Backlog

### Ideas for Future Exploration
- Multi-track recording (record multiple takes, overlay them)
- Metronome/click track
- Pre-roll countdown before recording
- Keyboard shortcuts for all controls
- MIDI input support for pitch reference
- Recording templates/presets
- Batch processing of recordings
- Integration with voice practice page
- Accessibility improvements (screen reader support, high contrast mode)

---

## Technical Debt

### Code Quality
- Add comprehensive error handling
- Unit tests for pitch detection
- Integration tests for recording flow
- Performance profiling and optimization

### Testing
- [x] Manual test scenarios documented (see [voice-recorder-test-scenarios.md](voice-recorder-test-scenarios.md))
- [ ] Automated test infrastructure
- [ ] Browser compatibility testing matrix
- [ ] Performance benchmarks

### Browser Compatibility
- Test across all major browsers
- Polyfills for older browsers
- Progressive enhancement fallbacks
- Mobile-specific optimizations

### Documentation
- JSDoc comments for all methods
- Inline code documentation
- User guide/tutorial
- Troubleshooting guide

---

## Notes

### Sprint Planning Process
1. Review completed items from previous sprint
2. Select high-priority items from current sprint
3. Break down tasks into implementable chunks
4. Estimate effort and set realistic goals
5. Focus on one sprint at a time

### Definition of Done
- Code is implemented and tested
- Documentation is updated
- UI changes are responsive
- Performance is acceptable
- Changes are committed to repository
- Blog post is updated if significant

### Review Criteria
- Does it work as expected?
- Is the code maintainable?
- Are there any security concerns?
- Is performance acceptable?
- Is it accessible?
- Is it documented?
