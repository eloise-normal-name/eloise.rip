# Article Generation Style Plan

Last updated: March 17, 2026

## Goal

Make generated article text sound more like the existing site voice instead of generic lifestyle-blog copy.

## Observed Style Traits

Based on recent articles such as:

- [bungle-babes.md](/C:/Users/Admin/eloise.rip/eloise.rip/content/articles/2026/03/bungle-babes.md)
- [flying-angle.md](/C:/Users/Admin/eloise.rip/eloise.rip/content/articles/2026/03/flying-angle.md)
- [l3-is-hard.md](/C:/Users/Admin/eloise.rip/eloise.rip/content/articles/2026/03/l3-is-hard.md)
- [pole-babes.md](/C:/Users/Admin/eloise.rip/eloise.rip/content/articles/2025/11/pole-babes.md)

Common traits:

- first-person voice
- short paragraphs
- direct and personal phrasing
- specific feelings about effort, progress, difficulty, pride, or fun
- occasional playful or emotional tone
- little to no broad exposition about the topic category itself
- references to recurring people/entities like Catgirl, instructors, or named moves when relevant

## Proposed Implementation

### Style Corpus

- Build a lightweight article sampler from existing markdown under `content/articles/`
- Prefer recent posts from the same category first
- Fall back to recent site-wide posts if category-specific examples are sparse

### Prompt Additions

- Include 2-4 short style excerpts or a compact style summary derived from the corpus
- Explicitly instruct the model to:
  - avoid generic introductions about the subject as a whole
  - write like a personal post, not an explainer
  - keep paragraphs short
  - prefer concrete reactions over abstract commentary

### Safety Rails

- Never copy long phrases from existing posts
- Use style examples as tone guidance only
- Cap excerpt length so prompts stay compact and copyright-safe

## Planned Tests

- Compare old/new output for the same media input
- Verify new output avoids generic “X has evolved over the years” phrasing
- Verify output stays first-person for personal posts
- Verify same-category examples improve relevance without leaking repeated sentences

## Default Rollout

1. Add style-sampler helper
2. Feed same-category excerpts into generation prompt
3. Re-test on `bungle-babes-duo-choreo.mp4`
4. Refine excerpt selection and prompt wording based on output quality
