---
name: 摸鱼阅读 (moyu-reader)
description: The browser new-tab page you cannot tell we built — white ground, one blue accent, system type.
colors:
  ground: "#ffffff"
  ground-hover: "#f3f4f6"
  ground-active: "#e8eaee"
  tile: "#f1f3f5"
  ink: "#111827"
  ink-secondary: "#5b6472"
  ink-tertiary: "#6f7683"
  divider: "#e5e7eb"
  divider-strong: "#d1d5db"
  accent: "#2563eb"
  accent-hover: "#1d4ed8"
  accent-soft: "rgba(37, 99, 235, 0.1)"
  danger: "#b91c1c"
typography:
  display:
    fontFamily: "Microsoft YaHei, PingFang SC, Segoe UI, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 500
    letterSpacing: "0.08em"
  title:
    fontFamily: "Microsoft YaHei, PingFang SC, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  body:
    fontFamily: "Microsoft YaHei, PingFang SC, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "Microsoft YaHei, PingFang SC, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
rounded:
  sm: "4px"
  md-chrome: "6px"
  md-page: "8px"
  pill: "999px"
spacing:
  "1": "1px"
  "2": "2px"
  "4": "4px"
  "6": "6px"
  "8": "8px"
  "10": "10px"
  "12": "12px"
components:
  search-field:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "46px"
  search-field-focus:
    backgroundColor: "{colors.ground}"
    rounded: "{rounded.pill}"
  site-tile:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md-page}"
    padding: "10px 4px"
  site-tile-hover:
    backgroundColor: "{colors.ground-hover}"
  site-tile-current:
    textColor: "{colors.accent}"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    padding: "0 6px"
    height: "26px"
  icon-button-hover:
    backgroundColor: "{colors.ground-hover}"
    textColor: "{colors.ink}"
  icon-button-on:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  text-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "26px"
  text-button-hover:
    backgroundColor: "{colors.ground-hover}"
    textColor: "{colors.ink}"
  address-input:
    backgroundColor: "{colors.ground-hover}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md-chrome}"
    padding: "0 12px"
    height: "26px"
  address-input-focus:
    backgroundColor: "{colors.ground}"
    rounded: "{rounded.md-chrome}"
  tab-chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    padding: "0 4px 0 9px"
    height: "26px"
  tab-chip-active:
    backgroundColor: "{colors.ground-active}"
    textColor: "{colors.ink}"
  segmented-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-tertiary}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  segmented-item-active:
    backgroundColor: "{colors.ground-active}"
    textColor: "{colors.accent}"
  opacity-slider:
    backgroundColor: "{colors.divider-strong}"
    width: "96px"
    height: "3px"
---

# Design System: 摸鱼阅读 (moyu-reader)

## Overview

**Creative North Star: "The Native New Tab."**

This is a surface that should look like it came with the browser — not like a product someone designed. The commitment, chosen by the user, is **canon: the category standard, executed impeccably, without irony or smuggled quirk**. The named craft reference is the **Chrome / Edge 新标签页 (browser new-tab page)**: a neutral ground, restrained dividers, a single accent, generous whitespace, an interface that steps back behind the content. Convention is the point, not a compromise — the page is meant to be unremarkable so that it survives being glanced at. At 25–45% opacity beside a Word window, nothing here should identify it as a reading tool (PRODUCT: concealment over beauty; familiarity over novelty).

Density is airy and single-column. A wordmark, one search field, one "continue last" line, a wrapped grid of site tiles, a footnote. The window is a 16:9 frame with two thin toolbars (38px top, 44px bottom) and a fully transparent middle; the chrome was re-skinned to the same palette as the page and recedes to content. The one doctrine: **the canon is the commitment — execute the category standard at full fidelity, with no ironic twists and no ornamental deviation.**

**Provenance note.** This world replaced an earlier draft in a different metaphor (a Chinese OMR answer-sheet: cool card stock, registration red, numbered ovals, a 黑体/宋体 split). That draft was abandoned when the user chose canon and is **not** part of this system. The ordinary look is deliberate, not defaulted-into.

**Key Characteristics:**
- White ground, cool near-black ink ramp, two hairline grays, exactly one blue accent.
- No gradients, no glass/blur, no decorative motion, no second accent, no third hue.
- System CJK type stack (Microsoft YaHei / PingFang SC / Segoe UI / system-ui); no display face, no webfont.
- Flat by default; depth appears only as a response to state (hover, focus, current).
- Two surfaces — page (`home.css`) and chrome (`tokens.css`) — share one palette and font by construction; they differ only in density (13px page vs 12px chrome base).

## Colors

A neutral white page lit by one cool blue. Everything that is not the accent is either ink (three steps) or a hairline/tile gray. There is no secondary and no tertiary accent.

### Primary
- **Focus Blue** (`#2563eb`, `--accent` / `--moyu-accent`): the only chromatic color. Used for keyboard focus rings, the currently-open site tile, the active toolbar toggle, and the slider thumb — i.e. focus, current, and primary action, never decoration. Hover darkens it to **Focus Blue Deep** (`#1d4ed8`, `--accent-hover` / `--moyu-accent-hover`); its soft wash is **Focus Blue Wash** (`rgba(37, 99, 235, 0.1)`, `--accent-soft` / `--moyu-accent-soft`) used for text selection, the "continue last" lit state, and active toggles.
- **Danger Red** (`#b91c1c`, `--moyu-danger`): chrome-only. Appears solely as the hover fill of the window close button and the hover color of a tab's close glyph. It is a destructive-affordance signal, not a palette color.

### Neutral
- **Ground White** (`#ffffff`, `--ground` / `--moyu-surface`): the page and toolbar surface. The chrome's `--moyu-paper` (`#ffffff`) is a declared but unused alias of the same value.
- **Hover Gray** (`#f3f4f6`, `--ground-hover` / `--moyu-surface-hover`): every interactive hover fill, and the address field's resting fill.
- **Active Gray** (`#e8eaee`, `--ground-active` / `--moyu-surface-active`): pressed tiles, the active tab, the selected preset/zone, and the address field on hover.
- **Tile Gray** (`#f1f3f5`, `--tile`, page-only): the circular well behind a site's favicon.
- **Ink** (`#111827`, `--text` / `--moyu-ink` / `--moyu-text`): primary text and the darkest wordmark.
- **Ink Secondary** (`#5b6472`, `--text-secondary` / `--moyu-text-dim`): labels, tool glyphs, tile labels at rest. Declared to meet 4.5:1, so it stays legible when window opacity drops.
- **Ink Tertiary** (`#6f7683`, `--text-tertiary` / `--moyu-text-faint`): the least-prominent text — input placeholders, the footnote, inactive toggles, disabled glyphs.
- **Hairline** (`#e5e7eb`, `--divider` / `--moyu-hairline`): the 1px rule under the top bar and over the bottom bar, and the search field's resting border.
- **Hairline Strong** (`#d1d5db`, `--divider-strong` / `--moyu-border`): the search field border and the opacity slider track.

### Named Rules
**The One Accent Rule.** Exactly one chromatic accent exists. `#2563eb` is used on ≤10% of any given screen and only for focus, current state, and primary action. A second accent or a third hue is the fastest way to stop looking like the browser.

**The Neutral Ground Rule.** The page is white and stays white. No tinted canvas, no gradient, no tonal shift to signal depth — the accent is the only color event.

## Typography

**Display Font:** system CJK stack — Microsoft YaHei, PingFang SC, Segoe UI, system-ui (`--font` / `--moyu-font`)
**Body Font:** the same stack (there is only one family)
**Label/Mono Font:** none; all text runs in the system stack.

**Character:** deliberately invisible. This is the OS's own type, at the OS's usual sizes, so the surface reads as chrome rather than as a designed document. No display face, no webfont, no letterform personality. Letterspacing is used once — a widened 0.08em on the wordmark — and nowhere else.

### Hierarchy
- **Display** (500, 30px, letter-spacing 0.08em): the wordmark 摸鱼阅读, the page's only brand moment. Drops to 19px in the compact (≤400px-tall) layout.
- **Title** (400, 14px): the search field's input text — the largest reading text inside the page body.
- **Body** (400, 13px): the page's base size (`home.css` sets 13px on `html, body`); the footnote and tile labels step down from it.
- **Label** (400, 12px): the chrome's base size (`base.css` sets 12px), and the size of tile labels and the footnote on the page. Address bar, toolbar tools, tab titles, and toggles all inherit this.

### Named Rules
**The OS-Stack Rule.** Type is the operating system's. Never ship a display face or a webfont; the page must look like it was rendered by the browser's own engine, because it was.

## Layout

The window is a fixed 16:9 frame (default 960×540; presets mini 480×270, small 800×450, medium 960×540, large 1280×720). It is a single flex column: a 38px top bar, a flexible transparent middle (which the page view fills, or the desktop shows through), and a 44px bottom bar. A hidden region collapses to a 6px, no-fill reveal strip at the window edge.

The page itself is one centered column: `max-width: 760px`, 24px side padding, `padding-top: 6%`. Order is wordmark → search → "continue last" line → tile grid → footnote. Width is comfortable and height is scarce, so the layout is horizontal-first and never long-scrolls; the tile grid itself is the only scrolling region.

Spacing is hand-set on an even 2px rhythm with no spacing-token file — the recurring stops are 4/6/8/10/12 px, and the block rhythm uses larger one-off margins: wordmark → search 26px, search → resume 14px, resume → grid 26px, grid → footnote 18px, and a 20px inset inside the search field. The search field is 46px tall; toolbar controls are 26px tall.

The tile grid is `repeat(auto-fill, 84px)`, center-justified, with `8px 4px` gaps, so tiles stay evenly spaced at any width (18 tiles maximum). Below 400px of height the page compacts: the column's top inset drops to 14px, the wordmark to 19px, the search field to 36px, tiles shrink to a 68px track with 32px favicon wells, and the footnote is dropped.

### Named Rules
**The One-Column Rule.** One centered column, one grid, no long vertical scroll. Height is the scarce axis in a 16:9 stealth window; content grows sideways, never downward.

## Elevation & Depth

**Flat by default; depth is state.** There are no resting shadows and no tonal layering to imply height. A surface is flat until it is hovered or focused, and then a single soft shadow (or a 1.5–2px focus ring) appears to acknowledge the pointer or the keyboard. There is no blur or glass anywhere: `backdrop-filter` cannot blur the desktop behind a transparent window — it would only smear the window's own contents — so the mechanism is banned, not merely unused.

### Shadow Vocabulary
- **Search Hover** (`box-shadow: 0 1px 4px rgba(17, 24, 39, 0.1)`): the start-page search field on hover.
- **Search Focus** (`box-shadow: 0 1px 6px rgba(17, 24, 39, 0.16)`): the focused search field; paired with `border-color: transparent` and a 2px accent outline.
- **Current-Tile Ring** (`box-shadow: inset 0 0 0 1.5px #2563eb`): the inset ring on the favicon well of the currently-open site.
- **Address Focus Ring** (`box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1)`): the soft halo added to the chrome address field on focus (alongside its accent border and the shared 2px focus outline).
- **Focus Outline** (`outline: 2px solid #2563eb`, offset 2px on the page / 1px in the chrome): the keyboard focus indicator everywhere, in addition to any state fill.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. A shadow is always a response to state (hover, focus), never a standing decoration.

**The No-Glass Rule.** No `backdrop-filter`, no blur, no translucency on any painted layer. The window is transparent by construction; an opaque or frosted layer would break the product.

## Shapes

Restrained and slightly soft, never playful. The radius scale is small: **4px** for toolbar controls and tab chips (`--radius-sm` / `--moyu-radius-sm`), **6px** for the chrome address field and popover surfaces (`--moyu-radius`), **8px** for page tiles and the "continue last" row (`--radius`, page), and a **999px pill** reserved for two things only — the search field and the circular favicon well. Note the deliberate-but-real split at the medium step: the page's medium radius is 8px while the chrome's is 6px (see the drift note below).

Separation is done with 1px hairlines (`#e5e7eb` / `#d1d5db`); nothing is heavier than 1px except the 1.5–2px focus ring. The favicon well is a perfect circle; toolbar buttons are small rounded rectangles (4px). There is no clipping, no clipping-mask, and no ornamental geometry — every shape is the plainest form that carries its function.

### Named Rules
**The Hairline Rule.** All separation is a 1px line or a tonal fill. The only strokes thicker than a hairline are focus rings, and those exist for accessibility under low opacity, not for looks.

## Components

Every control is quiet at rest and answers on hover/focus with a background or outline change. All transitions are `120ms` (fields `140ms`) `ease-out`; nothing moves, scales, or bounces.

### Buttons
- **Shape:** small rounded rectangles, 4px radius (`--radius-sm` / `--moyu-radius-sm`); 26px tall.
- **Icon button (chrome):** 26px square-ish, 0 6px padding, glyph drawn in `currentColor` from the authored icon set. At rest ink-secondary; on hover it takes the hover-gray fill and ink; in the `on` state it takes the Focus Blue Wash fill and Focus Blue text. The close glyph is the lone danger exception (red fill on hover).
- **Text button (chrome, 站点 / 历史 / 书签 / 收藏 / 设置):** same box, 0 8px padding, same rest/hover progression.
- **Hover / Focus:** background `120ms ease-out`; keyboard focus gets the shared 2px accent outline.
- **Segmented item (透明度 presets, 区域 toggles):** a 4px-radius chip, 2px 6px padding, ink-tertiary at rest; hover fills hover-gray with ink; the active one takes active-gray with Focus Blue text. A hidden zone additionally strikes its label through — a shape cue, not a color cue, so it survives low opacity.

### Chips
- **Tab chip (chrome):** 26px tall, `max-width: 130px`, radius 4px; ink-secondary at rest, hover-gray on hover, active-gray + ink when active. Its close glyph is hidden (`opacity: 0`) until hover or active, then dims in at 0.75 and goes danger-red on its own hover.

### Cards / Containers
There are no cards. The nearest container is the **site tile**: an 84px grid cell, transparent at rest, 8px radius, `10px 4px` padding, stacking a 40px circular favicon well (Tile Gray fill) over a 12px label. Hover fills it hover-gray and darkens the label to ink; the currently-open tile is marked by the Focus Blue Wash on its well, a 1.5px inset accent ring, and accent-colored initial. Tiles do not lift, shadow, or scale.

### Inputs / Fields
- **Search field (page; the signature component):** a 46px pill, white on a hairline-strong border, with a 17px search glyph and a 20px horizontal inset. Hover casts the soft "Search Hover" shadow; focus drops the border to transparent, casts "Search Focus," and adds the 2px accent outline (the wrapper carries the ring; the input draws no second outline).
- **Address field (chrome):** a 26px rounded rectangle, resting fill hover-gray with ink text and no visible border; on hover it deepens to active-gray; on focus it turns white, gains an accent border and the 2px soft accent ring, plus the shared focus outline. Placeholder text is ink-tertiary.

### Navigation
The chrome's navigation is icon buttons (home / back / forward / reload) at the left of the top bar, with disabled arrow glyphs dropped to ink-tertiary and non-interactive. The page's navigation is the tile grid itself — sites open into a new tab; the page stays put.

### Signature Components
- **The icon set:** an authored line set, 24px viewBox, 1.6 stroke, round caps and joins, `currentColor` only (15px default, 11–17px by use). Glyph icons (Unicode characters as icons) are banned — a font decides their weight, baseline, and alignment, which varies per machine and cannot be tuned to the text scale.
- **The opacity slider:** a 96×3px track in hairline-strong with a 12px round Focus Blue thumb, plus four text presets (清晰 / 淡化 / 轻隐 / 几近无形). Its track is intentionally gray, not white, so it stays visible on the white bar.
- **The reveal strip:** a 6px, no-fill, draggable strip at the window edge that survives when a region is hidden; it carries a vertical-resize cursor on the top edge and reveals all regions when the (main-process) cursor poll enters it.

## Do's and Don'ts

### Do:
- **Do** keep the ground white and the accent singular: `#2563eb` for focus/current/primary only, on ≤10% of the screen (The One Accent Rule).
- **Do** use the OS CJK stack and only the sizes in the ramp: 12 / 13 / 14 / 30px (The OS-Stack Rule).
- **Do** express every state as a background or outline change at `120ms` (fields `140ms`) `ease-out`, in response to hover or focus (The Flat-By-Default Rule).
- **Do** keep the page and the chrome on one palette — they alias identical values by construction. When you touch one, touch the other.
- **Do** keep the chrome's middle fully transparent with `pointer-events: none` so the mouse reaches the page or the desktop.
- **Do** keep text at 12px or larger and give key controls a shape or position cue, not a color cue, so they stay distinguishable at 25–45% window opacity.

### Don't:
- **Don't** add a second accent or a third hue; the one blue is the whole system (The One Accent Rule).
- **Don't** use gradients, glass, `backdrop-filter`, or blur — the last is mechanically wrong on a transparent window (The No-Glass Rule).
- **Don't** add decorative motion; state changes are the only transitions, and they do not move anything.
- **Don't** use a display face, a webfont, or glyph/Unicode characters as icons; use the authored 24px / 1.6-stroke SVG set.
- **Don't** smuggle in quirk or irony — toolbars made to look like something else, ornamental asymmetry, or a "designed" flourish. The canon is the commitment.
- **Don't** reintroduce the abandoned OMR answer-sheet world (card stock, registration red, question numbers and ovals, a 黑体/宋体 split); it was replaced by canon and is out of this system.

---

## Recorded drift (not repaired; the build wins)

The page and chrome are one system by construction, and in the shipped code they **agree exactly on every color, on the font stack, and on the 4px small radius** — `home.css` and `tokens.css` define the same values under different names (e.g. `#2563eb` is both `--accent` and `--moyu-accent`). Three real drifts remain, recorded rather than papered over:

1. **Base size.** The page sets `html, body { font-size: 13px }`; the chrome sets `12px`. Both are inside the ≥12px accessibility floor; the chrome is the denser surface, so the split is defensible, but it is a split.
2. **Medium radius.** The page's default radius is `8px`; the chrome's is `6px` (the 4px small step matches). Recorded as `{rounded.md-page}` vs `{rounded.md-chrome}`.
3. **Scrollbars disagree.** The page's scrollbar thumb is the Hairline Strong gray (`#d1d5db`) with a 4px radius; the chrome's is a hard-coded `rgba(21, 23, 28, 0.42)` → `rgba(21, 23, 28, 0.72)` on hover, square, matching no declared chrome token. This is the `base.css` comment's "只用墨" scrollbar; its RGB value (`#15171c`) is unbacked by any token and coincides with the abandoned world's ink, so it is **not** canonized here as a system value — treat it as an in-flight literal, not a rule. `--moyu-paper` (`#ffffff`) is likewise a declared-but-unused alias of the surface color.
