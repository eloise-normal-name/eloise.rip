# AGENTS.md

## Project Scope
- Repository: `eloise.rip`
- Purpose: Build and publish the static site content and assets.

## Working Rules
- Prefer minimal, targeted changes over broad refactors.
- Keep edits consistent with existing file structure and naming.
- Do not introduce new build tools unless explicitly requested.

## Advice for Future Projects
- Keep environment/setup guidance generic unless the tooling is guaranteed across all repos.
- Prefer documenting reproducible commands and expected outputs over machine-specific paths.
- Capture project-specific assumptions in a clearly labeled section so they can be reviewed and updated quickly during onboarding.

## Content and Theme
- Site content lives in `content/`.
- Theme-related files are under `themes/`.
- Generated site output is written to `output/`.

## Common Commands
- Local build: `pelican content -o output -s pelicanconf.py`
- Validate output: `python validate_output.py`
- Style analysis: `python analyze_styles.py`

## Pull Request Expectations
- Explain what changed and why.
- Include validation steps performed.
- Keep diffs focused and avoid unrelated changes.

## PR Review Comment Resolution
When addressing review comments from automated or human reviewers:

1. **Fix the issues** in code/docs systematically (do not make one-off fixes for each comment separately)
2. **Commit with clear message** referencing the issues resolved (e.g., "fix: resolve PR #46 review comments")
3. **Push the commit** to update the PR
4. **Add a review comment** on the PR summarizing:
   - Each review issue and its current status (FIXED, ALREADY CORRECT, VERIFIED, etc.)
   - Reference the commit hash that fixed the issue
   - Include validation results (build passing, no broken links, errors = 0)
   - Mark PR as ready for merge when all issues are resolved

**Example format:**
```
## Review Resolution Summary

All critical issues from review have been resolved in commit `abc123`:

### ✅ Issue 1: [Description]
**Status: FIXED**
- Line XX: [What was changed and why]

### ✅ Issue 2: [Description]  
**Status: ALREADY CORRECT**
- [Explanation of why no change was needed]

**Validation Results:**
- ✅ Build successful
- ✅ Zero broken links
- ✅ No code errors
```

This creates an audit trail for reviewers and prevents outdated comments from becoming stale or misleading.

## Safety
- Never commit secrets or credentials.
- Do not delete user content without explicit instruction.

## Voice Recorder
- Reference doc: docs/voice-recorder.md

## Custom Agents
- **gh-project-manager**: Specialized agent for managing GitHub Projects using the GitHub CLI. Located at `.github/agents/gh-project-manager.md`.
