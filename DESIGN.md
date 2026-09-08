# DESIGN.md

> Visual contract for project-manage — the Geist (Vercel) design system.
> Implemented in `frontend/src/index.css` (CSS custom properties + component
> classes) and `frontend/src/theme.ts` (AntD token mapping). Rewritten
> 2026-09-07; supersedes the teal/OKLCH scheme.

## Color

### Strategy

Pure-neutral grayscale surfaces with 1px hairline borders — no tinted hues,
no decorative shadows. One blue accent carries every interactive meaning
(primary actions, links, focus rings, selection). Status colors appear only
as dot + tinted pill, never as large fills. Dark mode is a first-class peer
of light mode, not an inversion hack: page background is true black (#000).

### Palette

| Role | Light | Dark | Usage |
|---|---|---|---|
| `--bg` | `#ffffff` | `#000000` | Page background |
| `--bg-subtle` | `#fafafa` | `#0a0a0a` | Sidebar rail, hover fills, card headers, input wells |
| `--surface-raised` | `#ffffff` | `#161616` | Dropdowns, popovers, modals, drawers, toasts |
| `--hairline` | `#eaeaea` | `#262626` | Dividers, card/table borders |
| `--hairline-strong` | `#c9c9c9` | `#3d3d3d` | Control borders (hover state) |
| `--ink` | `#171717` | `#ededed` | Primary text |
| `--ink-2` | `#666666` | `#a1a1a1` | Secondary text |
| `--ink-3` | `#888888` | `#6e6e6e` | Tertiary text, table headers, timestamps |
| `--blue` | `#0070f3` | `#3291ff` | The accent |
| `--green` | `#0e9f6e` | `#29d398` | Success / done |
| `--amber` | `#f5a623` | `#f5a623` | Warning / paused |
| `--red` | `#ee0000` | `#ff5f56` | Error / danger / overdue |
| `--purple` | `#7928ca` | `#9e7aff` | Categorical accent |
| `--teal` | `#0d9488` | `#50e3c2` | Categorical accent |

Pill text tones are AA-tuned darker/lighter variants of the dot color
(`.pill--blue` etc. in index.css). Tooltips and toasts are always inverted:
dark chip in light mode, light chip in dark mode.

### Shadows

Reserved for floating layers only — never on static cards.

| Layer | Token |
|---|---|
| Active sidebar card, segmented item | `--shadow-xs` |
| Dropdown, popover, select popup, toast | `--shadow-md` |
| Modal dialog | `--shadow-lg` |

## Typography

Script-split stacks (2026-09-08): Latin and CJK each get their own face,
routed by CSS fallback order — every stack leads with the Latin face, and
the first CJK-capable face downstream picks up Chinese glyphs.

- **JetBrains Mono** 400/500/600 (`@fontsource/jetbrains-mono`) — all Latin
  text, UI and data alike; the dev-tool voice of the product. Fallbacks:
  `ui-sans-serif`, `-apple-system`, CJK system faces.
- **霞鹭文楷 LXGW WenKai** regular + bold (`lxgw-wenkai-webfont`, ~97
  unicode-range subsets per weight, so browsers fetch only rendered
  slices) — all Chinese text. The mono stack uses the **LXGW WenKai Mono**
  sibling so Chinese inside code/dates/values keeps the same voice.

Stacks: `--font-sans = 'JetBrains Mono', 'LXGW WenKai', …`,
`--font-mono = 'JetBrains Mono', 'LXGW WenKai Mono', …` (mirrored in
`theme.ts` `FONT_SANS`/`FONT_MONO` for AntD). Mono is a signal: "this is
data, not prose" — dates, sizes, identifiers, counts, credential values.

Scale (px): 11 (section labels, uppercase + tracking) · 12 (meta, timestamps,
table headers) · 13 (secondary body, table cells, nav) · 14 (body, controls)
· 15/16 (modal titles, large controls) · 20 (page titles) · 24 (stat tile
values, tabular). Body line-height 1.5–1.75; headings -0.02em tracking.
Because JetBrains Mono is wider than the former Geist Sans (12px advance
7.2px vs ~6.2px), fixed text columns were re-measured headlessly after the
swap — e.g. the credential key column is 128px against the 122px
"Access Key Secret", and the credential drawer is 600px wide.

## Layout

- App shell: 240px sidebar (`--bg-subtle`, hairline right edge) + main
  column with a sticky 56px topbar (breadcrumbs · search · avatar menu).
- Sidebar active item is a raised surface card (white / #1f1f1f) with its
  own hairline — the Vercel nav pattern.
- Sidebar is collapsible: a footer toggle folds it to the 64px icon rail
  (Tooltips carry the labels); the state persists in localStorage.
- Breadcrumbs take all leftover topbar width — the current item (project
  name) never gets a fixed-width cap; the command search is a fixed 260px
  with its dropdown panel anchored to the right edge.
- Project list rows: the name owns the full first line; the meta line
  below carries status pill · client · phase with a right-aligned mono
  date — a status column must never squeeze the name.
- Content: max-width 1120px centered, 24px top / 32px side / 64px bottom
  padding; blocks sit 24px apart.
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48px.
- Responsive: ≤960px sidebar collapses to a 64px icon rail, topbar search
  hides; ≤640px slims further. `prefers-reduced-motion` disables animation.

## Components

- **Ant Design v5** as base, retuned via `theme.ts` tokens: 32px controls,
  6px radius (8px for cards/dialogs), no colored shadows, borderless
  in-cell enum selects that read as values until hovered.
- **Pills** (`ui/Pill`): dot + label on tone-tinted full-round chip; the
  only sanctioned way to render status/priority/type enums.
- **Empty states** (`ui/EmptyState`): glyph circle, one-line title, one-line
  secondary description, at most one action.
- **Tables** (`.table-card`): bordered rounded container, 12px ink-3 header
  row, hairline row dividers, hover fill `--bg-subtle`, mono numerics.
- **Cards** (`.card` + `.card__header`): hairline container; header strip
  `--bg-subtle` with 13px semibold title and mono count.
- **Auth pages**: centered 340px column on a masked dot-grid backdrop;
  brand mark (black square / white triangle, inverted in dark) above.
- **Loading**: skeleton placeholders in content areas, spinner only for the
  initial auth gate.

## Motion

- Durations: 120ms fast (hover, fill), 180ms normal (enter/exit).
- Easing: `cubic-bezier(0.25, 1, 0.5, 1)`.
- Purpose: state feedback only — never decoration.
