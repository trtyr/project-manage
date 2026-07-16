# DESIGN.md

## Color

### Strategy

Restrained — pure white surface, oxidized teal primary, warm amber accent ≤10%.

### Palette (OKLCH)

| Role | Value | Usage |
|---|---|---|
| `--bg` | `oklch(0.985 0.003 180)` | Near-white teal tint — page background, lets white cards float |
| `--surface` | `oklch(0.975 0.004 180)` | Near-white, faint teal tint — cards, panels |
| `--ink` | `oklch(0.200 0.010 180)` | Near-black, faint teal — body text (≥7:1 vs bg) |
| `--primary` | `oklch(0.550 0.095 180)` | Oxidized teal — brand anchor, primary actions, selection |
| `--accent` | `oklch(0.680 0.130 55)` | Warm amber — badges, status pills, cold/warm contrast |
| `--muted` | `oklch(0.500 0.008 180)` | Teal-tinted gray — secondary text (≥3.5:1 vs bg) |

### Semantic States

| State | Color | Value |
|---|---|---|
| success | green | `oklch(0.600 0.120 145)` |
| warning | amber | `oklch(0.700 0.140 65)` |
| error | red | `oklch(0.550 0.180 25)` |
| info | teal | `oklch(0.600 0.080 200)` |

Text on primary/accent fills: white. Text on pale fills (L > 0.85): ink.

## Typography

### Family

Single sans-serif: **Inter** (system-ui fallback). No display font — product UI doesn't need one.

### Scale (fixed rem, ratio 1.125)

| Token | Size | Usage |
|---|---|---|
| `--text-xs` | 0.75rem (12px) | Labels, captions, metadata |
| `--text-sm` | 0.875rem (14px) | Secondary text, table cells |
| `--text-base` | 1rem (16px) | Body text, inputs |
| `--text-lg` | 1.125rem (18px) | Section headings |
| `--text-xl` | 1.25rem (20px) | Page headings |
| `--text-2xl` | 1.5rem (24px) | Hero numbers |

Line-height: 1.5 for body, 1.25 for headings. Letter-spacing: -0.01em for headings, 0 for body.

## Layout

- App shell: sticky dark top bar (60px) with logo + inline text nav + content area
- Content max-width: 1280px, centered with 32px padding
- Responsive: board grid collapses to single column at <768px
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48px

## Components

- **Ant Design v5** as base, customized via theme tokens to match palette
- Buttons: primary (teal fill, white text), default (outline), text (no border)
- Tables: compact density, sticky headers, row hover highlight
- Forms: labeled inputs, inline validation, skeleton loading
- Empty states: illustrative + actionable ("还没有客户，点击创建第一个")
- Loading: skeleton placeholders, not spinners

## Motion

- Duration: 150–250ms
- Easing: `cubic-bezier(0.25, 1, 0.5, 1)` (ease-out-quart)
- Purpose: state transitions, feedback, reveal — never decoration
- `prefers-reduced-motion`: crossfade or instant
