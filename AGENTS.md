# AGENTS.md

## Project Scope
- Repository: `eloise.rip`
- Purpose: Build and publish the static site content and assets.

## Working Rules
- Prefer minimal, targeted changes over broad refactors.
- Keep edits consistent with existing file structure and naming.
- Do not introduce new build tools unless explicitly requested.

## Content and Theme
- Site content lives in `content/`.
- Theme-related files are under `themes/`.
- Generated site output is written to `output/`.
- Source media is in `media-source/`.

## Python Environment
- Use the existing virtual environment at `.venv` when running scripts.
- Install dependencies from `requirements.txt`.

## Common Commands
- Local build: `pelican content -o output -s pelicanconf.py`
- Validate output: `python validate_output.py`
- Style analysis: `python analyze_styles.py`

## Pull Request Expectations
- Explain what changed and why.
- Include validation steps performed.
- Keep diffs focused and avoid unrelated changes.

## Safety
- Never commit secrets or credentials.
- Do not delete user content without explicit instruction.

## Voice Recorder
- Reference doc: docs/voice-recorder.md
