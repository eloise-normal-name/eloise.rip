# GitHub Project Setup Guide

This guide explains how to set up and manage GitHub Project #3 for tracking voice recorder development sprints.

## Project Information

- **Project Number:** 3
- **Project ID:** PVT_kwHOCG6UpM4BPTIk
- **Owner:** eloise-normal-name
- **Repository:** eloise.rip

## Recommended Setup

### 1. Rename the Project

```bash
# Use GitHub web interface to rename project to "Voice Recorder Development"
# Navigate to: https://github.com/users/eloise-normal-name/projects/3/settings
```

### 2. Configure Iteration Field

Set up sprint iterations in the project settings:

**Suggested Sprints:**
- Sprint 1: UI/UX Improvements (Future)
- Sprint 2: Enhanced Visualizations (Future)
- Sprint 3: Audio Analysis Features (Future)
- Sprint 4: Sharing & Export (Future)

### 3. Create Draft Items

Since issues are disabled in the repository, use draft items for tracking work:

#### Sprint 1: UI/UX Improvements
- [ ] Add pitch range adjustment UI
- [ ] Toggle pitch trace visibility
- [ ] Add visualizer style selector
- [ ] Settings panel

#### Sprint 2: Enhanced Visualizations
- [ ] Circular waveform visualizer
- [ ] Spectrogram view
- [ ] 3D visualization experiment
- [ ] Multiple pitch trace styles

#### Sprint 3: Audio Analysis Features
- [ ] Volume meter
- [ ] Frequency analysis
- [ ] Pitch statistics
- [ ] Audio effects

#### Sprint 4: Sharing & Export
- [ ] Multiple export formats
- [ ] Custom filename generator
- [ ] Social media optimization
- [ ] Cloud storage integration

### 4. Set Up Custom Fields (Optional)

Consider adding these fields for better tracking:

- **Effort** (Single select): Small, Medium, Large
- **Type** (Single select): Feature, Enhancement, Bug, Docs
- **Sprint** (Iteration): Link to iteration field

## Using GitHub CLI

### List Projects
```bash
gh project list --owner eloise-normal-name
```

### View Project
```bash
gh project view 3 --owner eloise-normal-name
```

### List Fields
```bash
gh project field-list 3 --owner eloise-normal-name
```

### Create Draft Items (Requires Permissions)
```bash
# Note: May require additional permissions
gh project item-create 3 --owner eloise-normal-name \
  --title "Add pitch range adjustment UI" \
  --body "Add UI controls to adjust min/max Hz range for different voice types"
```

## Project Management Workflow

1. **Planning Phase**
   - Review roadmap document (docs/voice-recorder-roadmap.md)
   - Select items for next sprint
   - Add draft items to project

2. **Development Phase**
   - Move items to "In Progress" status
   - Update items as work progresses
   - Link PRs to draft items

3. **Review Phase**
   - Move completed items to "Done"
   - Update documentation
   - Prepare for next sprint

## Alternative: Manual Management

If automated tools aren't working, manage sprints via:

1. **Roadmap Document** (docs/voice-recorder-roadmap.md)
   - Mark items as complete with ✅
   - Track progress with checkboxes
   - Update status sections

2. **GitHub Project Board**
   - Use web interface to create draft items
   - Organize by iteration/sprint
   - Update status manually

3. **PR Descriptions**
   - Reference roadmap items in PR descriptions
   - Update roadmap when PRs merge
   - Keep documentation in sync

## Current Status

### Completed (Sprint 0)
- ✅ Core voice recorder features
- ✅ Pitch detection implementation
- ✅ Real-time visualization
- ✅ Documentation

### Next Steps
1. Rename Project #3 to "Voice Recorder Development"
2. Create draft items for Sprint 1 tasks
3. Set up iteration field with sprint dates (when ready to start)
4. Begin work on highest priority items

## Resources

- [Voice Recorder Roadmap](voice-recorder-roadmap.md)
- [Voice Recorder Docs](voice-recorder.md)
- [Pitch Detection Plan](voice-recorder-pitch-plan.md)
- [GitHub Projects Documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects)
