# Voice Recorder Documentation Index

## Quick Start

New to the voice recorder? Start here:
- **[Voice Recorder Overview](voice-recorder.md)** - Architecture, features, and usage guide

## For Developers

### Core Documentation
- **[Voice Recorder Overview](voice-recorder.md)** - Main documentation covering architecture, data flow, and API reference
- **[DOM Elements Reference](voice-recorder-dom-elements.md)** - Critical mapping of HTML elements to JavaScript references
- **[Test Scenarios](voice-recorder-test-scenarios.md)** - Manual test checklist for regression testing

### Implementation Details
- **[Pitch Detection Algorithm](voice-recorder-pitch-algorithm.md)** - Deep dive into autocorrelation-based pitch detection
- **[Known Bugs](voice-recorder-bugs.md)** - Tracking active and resolved bugs with solutions

### Planning & Future Work
- **[Roadmap](voice-recorder-roadmap.md)** - Completed features and planned sprints
- **[Archive](archive/)** - Completed implementation plans (historical reference)

## File Map

### Implementation Files
```
content/pages/voice-recorder/
├── voice-recorder.md         # Jinja template with embedded HTML
├── voice-recorder.js          # Main VoiceRecorderApp class (1162 lines)
├── audio-visualizer.js        # Canvas rendering engine (980 lines)
├── pitch-detector.js          # Autocorrelation pitch detection (141 lines)
└── voice-recorder.css         # Styles (11510 bytes)
```

### Documentation Files
```
docs/
├── voice-recorder-README.md            # This file - documentation index
├── voice-recorder.md                   # Main technical documentation
├── voice-recorder-dom-elements.md      # DOM element safety guide
├── voice-recorder-pitch-algorithm.md   # Pitch detection deep dive
├── voice-recorder-bugs.md              # Bug tracking
├── voice-recorder-test-scenarios.md    # Test procedures
├── voice-recorder-roadmap.md           # Feature planning
└── archive/
    ├── voice-recorder-pitch-plan.md    # Completed: Pitch visualization plan
    └── voice-recorder-pitchy-integration-plan.md  # Completed: Pitchy integration
```

## Common Tasks

### Making UI Changes
1. Read [DOM Elements Reference](voice-recorder-dom-elements.md) first
2. Update HTML in `content/pages/voice-recorder/voice-recorder.md`
3. Update JavaScript references in `voice-recorder.js`
4. Update validation check in constructor
5. Run build and test

### Fixing Bugs
1. Check [Known Bugs](voice-recorder-bugs.md) to avoid duplicates
2. Implement fix
3. Run [Test Scenarios](voice-recorder-test-scenarios.md)
4. Document the bug and fix in `voice-recorder-bugs.md`

### Adding Features
1. Review [Roadmap](voice-recorder-roadmap.md) for planned work
2. Update roadmap with implementation status
3. Add tests to [Test Scenarios](voice-recorder-test-scenarios.md)
4. Update [Overview](voice-recorder.md) with new features

## Maintenance Notes

### Documentation Principles
- **One source of truth**: Avoid duplicating information across docs
- **Up-to-date**: Update docs with code changes in the same PR
- **Discoverable**: Link between related docs
- **Tested**: Run test scenarios after significant changes

### Code Review Checklist
- [ ] DOM elements match between HTML and JavaScript
- [ ] Pitch detection parameters are tuned correctly
- [ ] Canvas rendering is efficient (no unnecessary redraws)
- [ ] Multi-clip recording works (common regression)
- [ ] Mobile/touch events work correctly
- [ ] Accessibility (ARIA labels, keyboard navigation)

## Questions?

For questions or issues, check the [main documentation](voice-recorder.md) first, then the specialized docs linked above.
