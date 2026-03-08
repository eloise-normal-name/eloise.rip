# Site Theme Planning Doc

**Status**: Draft
**Date**: 2026-03-08
**Author**: Sable [cs46]

---

## Overview

This document lists every visual element that needs a decision for a new site theme. The goal is a complete specification before any CSS is written. Each section has space for a decision and rationale.

---

## 1. Typography

### Body Text
- **Font family**: _____
- **Weight(s) used**: _____
- **Size (base)**: _____
- **Line height**: _____
- **Letter spacing**: _____

### Headings (H1–H4)
- **Font family**: _____ (same or different from body?)
- **Weight(s) used**: _____
- **Size scale** (ratio between heading levels): _____
- **Text transform** (uppercase, title case, etc.): _____

### Accent / Display Text
- Used for: nav labels, badges, stat bars, pull-quotes
- **Font family**: _____
- **Style notes**: _____

### Code / Monospace
- **Font family**: _____
- **Background treatment**: _____

### Loading strategy
- Self-hosted vs. Google Fonts vs. system fonts: _____
- Variable font vs. static: _____

---

## 2. Color Palette

### Base Colors
| Role | Token Name | Value |
|---|---|---|
| Background | `--color-bg` | _____ |
| Surface (cards) | `--color-surface` | _____ |
| Surface raised | `--color-surface-raised` | _____ |
| Border / divider | `--color-border` | _____ |

### Text Colors
| Role | Token Name | Value |
|---|---|---|
| Body text | `--color-text` | _____ |
| Muted / secondary text | `--color-text-muted` | _____ |
| On-accent text | `--color-text-on-accent` | _____ |

### Accent Colors
| Role | Token Name | Value | Notes |
|---|---|---|---|
| Primary accent | `--color-accent-1` | _____ | Links, CTAs |
| Secondary accent | `--color-accent-2` | _____ | Tags, badges |
| Tertiary accent | `--color-accent-3` | _____ | Highlights |
| Success | `--color-success` | _____ | |
| Warning / error | `--color-warning` | _____ | |

### Dark / Light Mode
- **Support both modes?** _____
- **Toggle mechanism** (system preference only vs. manual switch): _____
- Dark mode surface: _____
- Dark mode text: _____

### Gradient Usage
- **Use gradients?** _____
- Preferred direction (angle): _____
- Gradient stop colors: _____
- Elements that get gradients (borders, backgrounds, text, buttons): _____

---

## 3. Material / Surface Aesthetic

These decisions define the physical "feel" of the UI.

### Surface Treatment
- [ ] Flat (solid fills, minimal shadow)
- [ ] Glass / frosted (backdrop-filter blur + translucent bg)
- [ ] Neumorphism (inset/outset soft shadows)
- [ ] Layered paper (z-depth with drop shadows)
- [ ] None / other: _____

### Background
- **Main page background**: _____
- **Texture / pattern?** (noise, grain, dot grid, stripes, animated): _____
- **Animated background?** If yes, describe: _____

### Card / Panel Style
- **Border-radius**: _____
- **Border**: (none / 1px solid / accent-colored / gradient): _____
- **Shadow**: _____
- **Shadow on hover**: _____
- **Hover animation** (lift, glow, border change): _____

### Interactive States
- **Focus ring style** (outline, glow, inset): _____
- **Active / pressed feel**: _____

---

## 4. Layout — Desktop

### Content Column
- **Max-width**: _____
- **Horizontal padding**: _____
- **Sidebar?** (none / left / right / collapsible): _____

### Navigation
- **Position** (top bar / side rail / floating): _____
- **Sticky?** _____
- **Style** (minimal text links / pill tabs / icon+label / full-width bar): _____
- **Logo position** (left / centered / hidden): _____

### Homepage
- **Article grid** (single column / 2-col / 3-col / masonry): _____
- **Article card anatomy** (thumbnail placement, metadata position): _____
- **Hero / featured post section?** _____

### Article Page
- **Reading width**: _____
- **Metadata placement** (above title / below title / sidebar): _____
- **Table of contents?** _____
- **Related posts section?** _____

### Footer
- **Height / density**: _____
- **Contents**: _____

---

## 5. Layout — Mobile / Responsive

- **Breakpoints**: _____
- **Navigation on mobile** (hamburger / bottom bar / drawer): _____
- **Article card on mobile** (stack thumbnail above text, or hide thumbnail): _____
- **Font size scaling strategy**: _____

---

## 6. Component Specifications

### Tags & Badges
- **Shape** (pill / square / underline only): _____
- **Fill** (solid / outline / ghost): _____
- **Size**: _____

### Buttons / CTAs
- **Primary button style**: _____
- **Secondary / ghost button style**: _____
- **Border-radius**: _____
- **Hover behavior**: _____

### Code Blocks
- **Theme name** (Dracula, Monokai, GitHub, custom): _____
- **Line numbers?** _____
- **Copy button?** _____

### Blockquotes
- **Style** (left border / full background / italic only): _____

### Media (Images / Video Embeds)
- **Border-radius on images**: _____
- **Caption style**: _____
- **Figure/video container style**: _____

### Carousels
- **Navigation controls style** (arrows / dots / both): _____
- **Active indicator style**: _____

---

## 7. Iconography

Icons needed across the site — specify set and individual icons required.

### Icon Set
- **Library / system**: _____ (e.g., Lucide, Phosphor, Heroicons, Feather, custom SVG)
- **Style** (outline / solid / duotone / hand-drawn): _____
- **Size scale** (sm / md / lg in px): _____
- **Color treatment** (inherits text color / fixed accent): _____

### Required Icons

| Location | Purpose | Icon name / description |
|---|---|---|
| Nav | Home link | _____ |
| Nav | Archives link | _____ |
| Nav | RSS / feed | _____ |
| Nav | External links (if any) | _____ |
| Article meta | Calendar / date | _____ |
| Article meta | Category | _____ |
| Article meta | Tags | _____ |
| Article meta | Reading time | _____ |
| Article card | Video indicator badge | _____ |
| Pagination | Previous page | _____ |
| Pagination | Next page | _____ |
| Voice page | Play / pause | _____ |
| Voice page | Download | _____ |
| 404 page | Error / lost | _____ |
| Footer | Social links (list each) | _____ |
| Theme toggle | Light mode | _____ |
| Theme toggle | Dark mode | _____ |

---

## 8. Motion & Animation

- **Reduce-motion respected?** _____
- **Default transition duration**: _____
- **Easing curve**: _____
- **Hover animations** (scale / translateY / color shift / glow): _____
- **Page load animations?** _____
- **Background animation** (none / snow / particles / shimmer / other): _____

---

## 9. Design Inspirations

Add URLs and notes on what to borrow from each.

| URL | What to borrow |
|---|---|
| _____ | _____ |
| _____ | _____ |
| _____ | _____ |
| _____ | _____ |
| _____ | _____ |

### Mood / Keywords

Words that describe the desired feel (pick 4–6):

- _____
- _____
- _____
- _____
- _____
- _____

### What to Keep from Current Theme

From the existing `cute-theme` — note anything worth carrying forward:

- [ ] Card hover lift effect
- [ ] Frosted-glass nav
- [ ] Snowfall background
- [ ] 20px card border-radius
- [ ] Character stats page style
- [ ] Press Start 2P accent font
- [ ] Other: _____

### What to Change

Explicitly list anything that should NOT carry forward:

- _____
- _____
- _____

---

## 10. Decisions Log

Record choices as they're made.

| Date | Element | Decision | Rationale |
|---|---|---|---|
| | | | |

---

## Implementation Notes

Once decisions are filled in, the implementation order should be:

1. CSS custom properties (tokens) — colors, typography, spacing
2. Base layout (body, main container, nav, footer)
3. Typography scale
4. Cards and article summaries
5. Article page
6. Tags, badges, buttons
7. Code blocks
8. Carousels and media
9. Icons
10. Motion / animation
11. Dark mode (if applicable)
12. Mobile responsive pass
13. Character stats page re-skin
14. Validate output (`python validate_output.py`)
