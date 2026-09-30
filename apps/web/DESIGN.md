---
name: MailPocket
description: A calm, self-hosted mail workbench for developers, gray surfaces, one indigo voice, status carried by text and tone.
colors:
  primary: "#4f46e5"
  primary-deep: "#4338ca"
  primary-tint: "#eef2ff"
  primary-on-dark: "#818cf8"
  canvas: "#f9fafb"
  surface: "#ffffff"
  hairline: "#e5e7eb"
  control-border: "#6b7280"
  ink: "#1f2937"
  ink-soft: "#4b5563"
  ink-muted: "#6b7280"
  canvas-dark: "#111827"
  surface-dark: "#1f2937"
  surface-raised-dark: "#374151"
  hairline-dark: "#374151"
  ink-dark: "#f3f4f6"
  ink-soft-dark: "#d1d5db"
  danger: "#dc2626"
  danger-deep: "#b91c1c"
  success-ink: "#166534"
  warning-ink: "#713f12"
  info-ink: "#1e40af"
  upcoming-ink: "#6b21a8"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: "2rem"
    letterSpacing: "normal"
  stat:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: "2.25rem"
    letterSpacing: "normal"
  headline:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.75rem"
    letterSpacing: "normal"
  title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.25rem"
    letterSpacing: "normal"
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
    letterSpacing: "normal"
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: "1rem"
    letterSpacing: "0.05em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
    letterSpacing: "normal"
rounded:
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.title}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  button-danger-filled:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    typography: "{typography.title}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  button-danger-filled-hover:
    backgroundColor: "{colors.danger-deep}"
  nav-link:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "12px"
  nav-link-active:
    backgroundColor: "{colors.primary-tint}"
    textColor: "{colors.primary-deep}"
    typography: "{typography.title}"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
    height: "40px"
  badge:
    backgroundColor: "{colors.hairline}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  modal:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "24px"
---

# Design System: MailPocket

## Overview

**Creative North Star: "The Quiet Instrument"**

MailPocket's dashboard is a workbench for people who already know what they are looking for: a developer checking what their app actually sent, or a team confirming a domain is verified. The interface stays out of the way. Surfaces are gray and white (or gray-800 and gray-900 in dark mode), text is small and dense, and a single indigo accent marks the few places where action or current state lives. The product's job is to make what the system did legible, so state is stated in words and tone, never left to color alone.

The system extends stock Tailwind rather than overriding it: the default gray scale, the default indigo, the system font stack, and a handful of shared primitives (`UBtn`, `Badge`, `Modal`, `.field`, `.chip`, `.icon-btn`) that every page reuses. Light and dark themes are equal citizens, chosen by `light`, `dark`, or `system`, and every color pair is written with its dark counterpart at the same site. There is no logo art beyond the pocket-and-envelope favicon on an indigo tile.

It refuses decoration. No gradients, no hero imagery, no glow. Empty states are a centered icon and a plain sentence. Density is a feature: 14px body text, table-based lists with a right-aligned actions column.

**Key Characteristics:**
- Gray neutral surfaces, one indigo accent, semantic tones only for status
- Flat by default: depth is tonal layering and 1px hairlines; shadows only on overlays
- 14px working type; labels in small uppercase with wide tracking
- Every interactive element has a visible indigo focus ring and a tap target padded toward 44px
- Dark mode is first-class and built into every rule

## Colors

A gray-dominant palette with one accent. Indigo carries action and selection; red, green, yellow, blue, and purple appear only as badge and status tones.

### Primary
- **Signal Indigo** (#4f46e5): primary buttons, the favicon tile, focus rings (as `indigo-500` #6366f1), active tab underline. The only saturated color on most screens.
- **Deep Indigo** (#4338ca): primary-button hover and active nav text on light surfaces.
- **Indigo Mist** (#eef2ff): active nav row and bulk-selection bar on light; the dark counterpart is indigo-900 at 20-30% opacity.
- **Indigo Glow-on-Dark** (#818cf8): brand icon, active tab, and links on dark surfaces where Signal Indigo would lose contrast.

### Neutral
- **Paper Gray** (#f9fafb): app canvas in light mode.
- **Plain White** (#ffffff): cards, sidebar, modals, table bodies.
- **Hairline Gray** (#e5e7eb): borders, dividers (`divide-y`), sidebar edge.
- **Control Edge** (#6b7280): input borders, deliberately darker than a hairline so fields meet the 3:1 non-text contrast floor.
- **Ink** (#1f2937): headings and primary text. **Soft Ink** (#4b5563): body and secondary controls. **Muted Ink** (#6b7280): metadata, timestamps, placeholders (placeholders use gray-500 light / gray-300 dark, the AA fix documented in `tailwind.css`).
- **Night Canvas** (#111827), **Night Surface** (#1f2937), **Night Raised** (#374151): the three dark-mode layers (canvas, cards and sidebar, inputs and hover). **Night Hairline** (#374151) for dividers; **Night Ink** (#f3f4f6) and **Night Soft Ink** (#d1d5db) for text.

### Status tones (badges only)
Success `#166534` on green-100, danger red-800 on red-100, warning `#713f12` on yellow-100, info `#1e40af` on blue-100, purple `#6b21a8` (used for "upcoming" features), indigo, and neutral gray. Each is an AA pair at 12px in both themes; dark mode uses the 300/200 shade on the 900 shade at 40% opacity. Destructive actions use red-600 (#dc2626) filled or an outlined red-200 border.

### Named Rules
**The One Voice Rule.** Indigo is the only accent. It marks action, selection, and focus. Rarity keeps it legible; do not add a second brand color.

**The Words-Plus-Tone Rule.** A status is always its label in text. Color reinforces it, never replaces it. Tones come from `BADGE_TONES`; do not hand-color a status.

**The Both-Themes Rule.** A color is never written without its `dark:` partner at the same site.

## Typography

**Display Font:** the system UI stack (`ui-sans-serif, system-ui, sans-serif`)
**Body Font:** the same stack
**Label/Mono Font:** `ui-monospace, SFMono-Regular, Menlo, monospace` for SMTP hosts and ports, API keys, DNS records, headers, and addresses.

**Character:** Native and unadorned. One family, hierarchy carried by size and weight rather than by a second typeface. The working size is small (14px) and stays small.

### Hierarchy
- **Display** (700, 1.5rem/24px, 2rem): page titles (`text-2xl font-bold`).
- **Stat** (700, 1.875rem/30px, 2.25rem): dashboard counts, tinted green/red only when the number is itself a status.
- **Headline** (600, 1.125rem/18px, 1.75rem): modal and section titles. The sidebar wordmark is 1.25rem bold.
- **Title** (500, 0.875rem/14px, 1.25rem): row names, active nav, button labels.
- **Body** (400, 0.875rem/14px, 1.25rem): everything else. Long prose is capped by container width, not by a line-length token.
- **Label** (600, 0.75rem/12px, 0.05em, uppercase): sidebar group headings. Table headers are the same size and case but regular weight without tracking. Badges and chips are 12px medium (500), sentence case.

### Named Rules
**The Small-Type Rule.** Body stays 14px. Emphasis comes from weight and tone, not from size jumps.

**The Monospace-For-Machine-Text Rule.** Anything the user will copy into a config or DNS panel is monospace.

**The Tabular Counts Rule.** Unread counts, badges with numbers, and stats use `tabular-nums`.

## Layout

An app shell: a fixed 288px (`w-72`) left sidebar, static at `lg` (1024px) and above and a slide-over drawer with a black/40 scrim below it. The main column holds a page header bar (`px-6 py-3`, min-height 80px, hairline bottom border, title left and actions right, stacking on small screens) above a scrolling content area. Content is full-width tables and stacked sections; centered `max-w-*` containers appear only on auth screens and forms.

Spacing follows Tailwind's 4px scale: 4/8/12/16/24. Sidebar rows use 12px padding with `space-y-1`; tables use `px-4 py-3` cells; page gutters are 24px. Lists are tables with a right-aligned Actions column, not card grids.

### Named Rules
**The Tap-Target Rule.** Visible size stays compact, but hit areas reach toward 44px through pseudo-element padding or `min-w-9/min-h-9` (36px) minimums. Never widen the hit area sideways in a tight button cluster.

## Elevation & Depth

Flat by default. Depth is tonal: Paper Gray canvas, white cards, and hairline borders separate regions. Dark mode stacks Night Canvas, Night Surface, and Night Raised. Shadows are reserved for things that float above the page.

### Shadow Vocabulary
- **Overlay** (`shadow-lg`): modals, action menus, toasts.
- **Selected segment** (`shadow-sm`): the active item in the segmented control, lifting it off its gray track.
- **Backdrop** (`bg-black/40`): behind modals and the mobile drawer.

### Named Rules
**The Flat-At-Rest Rule.** A surface at rest has a border, not a shadow. Shadow means "this floats".

## Shapes

Softly rounded, never pill-shaped except for status. Controls and cards use `rounded-lg` (8px); modals `rounded-xl` (12px); icon buttons and segmented items `rounded-md` (6px); badges and filter chips `rounded-full`. Borders are 1px. The segmented control sits in a gray-200 track with 2px inset padding. The focus ring is 2px indigo-500, with a 2px offset (gray-800 in dark mode) on buttons and nav links, inset on tabs.

## Components

Restrained and legible: components stay quiet, and state (focus ring, tone, selection) carries the emphasis.

### Buttons (`UBtn`)
- **Shape:** rounded-lg (8px), sizes xs/sm/md with padding 8px/10px/12px vertical.
- **Primary:** Signal Indigo fill, white text, weight 500; hover Deep Indigo.
- **Secondary:** transparent, 1px gray-200 border, Soft Ink text; hover gray-50.
- **Danger / Warning:** outlined red-200 / orange-200 with matching text; `danger-filled` is solid red-600, reserved for confirming a destructive action.
- **Ghost:** text only, darkens on hover; used for low-priority actions like "Clear".
- **Loading:** spinner replaces the icon, button is disabled and `aria-busy`; the spinner stops under `prefers-reduced-motion`.
- **Focus:** 2px indigo ring with 2px offset.

### Fields (`.field`)
- **Style:** full width, min-height 40px, `px-3 py-2`, 1px Control Edge border, rounded-lg, 14px text; dark uses gray-700 fill and gray-400 border.
- **Focus:** 2px indigo-500 ring, border goes transparent.
- **Placeholder:** gray-500 (gray-300 dark), full opacity.

### Badges and Chips
- **Badge:** rounded-full, `px-2 py-0.5`, 12px medium, tone from the shared palette, label always text.
- **Chip (`.chip`):** rounded-full filter toggle, `px-3 py-1.5`, min-height 32px; selected chips use the indigo (or rule color) tint with a darker border.

### Navigation
- **Sidebar link (`NavLink`):** `px-3 py-3`, rounded-lg, 14px. Inactive: Soft Ink, gray-100 hover. Active: Indigo Mist fill, Deep Indigo text, weight 500. Group headings are Label style in Muted Ink. Counts are tabular and paired with `sr-only` text.
- **Tabs (`TabBar`):** text with a 2px bottom border; active is indigo-600 (indigo-400 dark) with weight 500; optional count badge.
- **Mobile:** sidebar becomes a 288px drawer that slides in over a scrim.

### Modal (`Modal`)
Centered, white (gray-800 dark), rounded-xl, `p-6`, `shadow-lg`, over `bg-black/40`. Title is Headline; a lucide `x` icon button closes it. Focus is trapped and Escape closes; height is capped to the viewport.

### Empty state
Centered lucide icon at 60% opacity (48px, or 32px compact), one medium-weight sentence in Ink, an optional line in Soft Ink, and an optional action beneath.

### Inline error
A red icon and sentence (red-700 / red-400), announced with `role="alert"`, optionally with an underlined Retry; the block variant is a full-width red-50 bar.

### Tables
Wrapped in a 1px hairline border with rounded-lg corners and horizontal overflow. Header row is 12px uppercase Muted Ink on gray-50 (gray-800 dark), regular weight, no extra tracking; rows are separated by `divide-y` hairlines; cells `px-4 py-3`; the last column is right-aligned actions.

## Do's and Don'ts

### Do:
- **Do** use indigo only for primary action, selection, and focus; everything else stays gray.
- **Do** reuse `UBtn`, `Badge`, `StatusBadge`, `Modal`, `EmptyState`, `InlineError`, `.field`, `.chip`, and `.icon-btn` before writing new markup.
- **Do** pair every light color with its `dark:` counterpart and verify AA contrast (4.5:1 for text, 3:1 for control borders) in both themes.
- **Do** show state as words plus tone, and give every icon-only control an accessible name.
- **Do** put machine text (hosts, ports, keys, DNS records) in monospace with a copy affordance.
- **Do** show wait states honestly, for example DNS verification pending, with retry.

### Don't:
- **Don't** add a second accent color or use red/green as the only signal of state.
- **Don't** add gradients, glows, hero imagery, or decorative illustration.
- **Don't** put shadows on resting cards; reserve them for overlays.
- **Don't** hand-write status colors; add a tone to `BADGE_TONES` if a new one is genuinely needed.
- **Don't** replace tables with card grids for lists.
- **Don't** design controls for DKIM rotation, multiple selectors, or custom selectors; they are not product decisions yet.
- **Don't** expose private key material in any client-side UI.
