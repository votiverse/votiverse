# Mobile Responsive — Implementation Report

**Date:** 2026-03-14
**Status:** Complete — builds cleanly, all views responsive

---

## Summary

Made the Votiverse web client fully responsive for mobile viewports (375px-428px). The same SPA will run inside a Tauri mobile WebView — every responsive change carries directly into the native app.

---

## Structural changes

### Bottom tab bar

Added a persistent bottom tab bar on mobile (`< lg` breakpoint) with 5 core sections: Home, Events, Delegate, Polls, Aware. Each tab has an icon and label. The active tab is highlighted in brand blue. The tab bar uses `position: fixed` and accounts for safe-area insets on notched phones.

The desktop horizontal nav in the header remains unchanged — it's hidden on mobile (`hidden lg:flex`), and the bottom tabs are hidden on desktop (`lg:hidden`).

### Compact header

- Logo text ("Votiverse") hidden on mobile (`hidden sm:inline`), icon-only remains
- Participant selector truncated on mobile (`max-w-[140px]`) with shorter placeholder text
- "Acting as" text hidden on mobile (`hidden sm:block`)
- Hamburger menu added for secondary navigation (Members, full link list)

### Main content padding

- Bottom padding increased to `pb-20` on mobile to clear the bottom tab bar, normal `lg:pb-8` on desktop
- Vertical padding reduced slightly on mobile (`py-6` vs `py-8`)

---

## Component-level changes

### UI primitives (ui.tsx)

| Component | Change |
|-----------|--------|
| `Button` | Added `size="lg"` (48px min-height). All sizes enforce `min-h-[44px]` on mobile via `sm:min-h-0` pattern. Added `active:` states for touch feedback. |
| `Input` | Min-height 44px on mobile, `text-base` on mobile (prevents iOS zoom), `sm:text-sm` on desktop |
| `Select` | Same treatment as Input — 44px min-height, 16px font on mobile |
| `CardHeader`/`CardBody` | Reduced padding on mobile (`px-4 py-3` vs `sm:px-6 sm:py-4`) |
| `ErrorBox` | Retry button has 44px min-height on mobile |

### Assembly Dashboard

- Stats grid: `grid-cols-2 sm:grid-cols-4` (2 columns on mobile, 4 on desktop)
- Config cards: `grid-cols-1 md:grid-cols-2` (stacked on mobile)
- Stat numbers: slightly smaller on mobile (`text-2xl sm:text-3xl`)
- Event list items: 44px min-height touch targets with `active:` states

### Event Detail

- Vote buttons: `size="lg"` (48px height), `flex-1` on mobile for full-width, normal size on desktop
- "Cast vote" label stacks above buttons on mobile (`flex-col sm:flex-row`)
- Tally bars: taller on mobile (`h-4 sm:h-3`) for visibility
- Tally metadata: stacks vertically on mobile (`flex-col sm:flex-row`)
- Weight distribution: single column on mobile (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`)
- Weight items: 44px min-height on mobile
- Timeline dates: use `toLocaleDateString()` instead of `toLocaleString()` to save space

### Delegations

- **Chain visualization**: vertical layout on mobile (down-arrows between nodes) vs horizontal on desktop (right-arrows). Chain nodes are full-width on mobile for easy tapping.
- Delegation form selectors: stacked on mobile (`grid-cols-1 sm:grid-cols-2`)
- Chain resolver selectors: stacked on mobile
- "Resolve Chain" button: full-width on mobile (`w-full sm:w-auto`)
- Delegation list items: wrap text, min-height 52px

### Polls

- Poll response buttons: `size="lg"` (48px), `flex-1` on mobile for full-width
- Likert scale buttons: each is `flex-1 min-w-[48px] min-h-[48px]` — large enough to tap
- View Results button: full-width on mobile
- Poll question padding: increased on mobile

### Awareness

- Buttons: full-width on mobile (`w-full sm:w-auto`)
- Concentration bar: taller on mobile (`h-5 sm:h-4`)
- Voting history: **card layout on mobile** (choice + date + issue ID in a compact card), **table layout on desktop** (traditional columns). Uses `sm:hidden` / `hidden sm:block` to switch.
- History load: select + button stack vertically on mobile
- Delegator tags: increased padding (`py-1.5`, `min-h-[32px]`) for touch

### Members

- Member rows: stack vertically on mobile (`flex-col sm:flex-row`)
- Action links (Profile, History, Remove): 44px min-height on mobile
- Member ID: truncated with `truncate` class

### Events List

- Issue inputs in create form: stack vertically on mobile (`flex-col sm:flex-row`)
- "Add another issue" link: 44px min-height on mobile
- Event card dates: hidden on mobile (`hidden sm:inline`)

### Assembly List

- Heading: `text-xl sm:text-2xl` (slightly smaller on mobile)

---

## CSS additions

```css
/* Safe area for notched phones */
.safe-bottom {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

/* Prevent iOS zoom on input focus */
@media (max-width: 639px) {
  input, select, textarea {
    font-size: 16px !important;
  }
}
```

---

## Touch target compliance

All interactive elements meet Apple's 44px minimum recommended touch target on mobile viewports:

- Buttons: 44-48px min-height depending on size
- Inputs and selects: 44px min-height
- List items and links: 44px min-height or larger
- Bottom tab bar items: 52px min-height
- Vote buttons: 48px height, full-width on mobile

---

## What was NOT changed

- No new JavaScript frameworks or dependencies added
- No separate mobile codebase or components
- Desktop layout is unchanged — all changes use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`)
- No dark mode changes
