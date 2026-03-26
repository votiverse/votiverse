# App Design System — "Accessible Civic"

**Design Document — v1.0**
**March 2026**

---

## 1. Purpose

This document defines the visual design system for the Votiverse web application (authenticated app mode). It serves as the single reference for all UI decisions: color, typography, layout, spacing, shape, interaction, and component styling. Every page and component in `platform/web/` must conform to this guide.

The design system has three goals:

1. **Brand continuity** with the marketing site (votiverse.app / votiverse.org) while acknowledging that an everyday governance tool has different ergonomic needs than a landing page.
2. **Accessible Civic** aesthetic — as authoritative as a municipal ballot box, as intuitive as a modern consumer app. The app must reduce cognitive load and screen fatigue for users who read proposals, analyze data, and cast votes regularly.
3. **Systematic tokens** that make dark mode, future theming, and consistent component styling automatic rather than ad-hoc.

### What This Document Covers

- Brand palette (the "Teal Transition" from the original blue)
- 3-layer token architecture (primitives → semantics → Tailwind utilities)
- Typography (dual-font system, text hierarchy, rendering)
- Shape, elevation, and surface treatment
- Layout architecture (desktop sidebar, mobile bottom tabs)
- Component guidelines (buttons, cards, badges, inputs, tally bars)
- Mobile-first and touch interaction rules
- Dark mode token mapping
- Animation and transition patterns

### What This Document Does Not Cover

- Governance logic, data models, or API contracts (see `docs/architecture.md`)
- i18n strategy (see `docs/design/i18n-architecture.md`)
- Content architecture (see `docs/design/content-architecture.md`)

---

## 2. Brand Palette — The Teal Transition

The original app used `#185FA5` ("SaaS Blue") as its primary brand color. To align with the Votiverse brand identity established on the marketing site, the primary color shifts to **Diplomatic Teal** (`#006B5F`).

### Teal Primitive Scale

```css
--primitive-brand-50:  #F0FDFB;
--primitive-brand-100: #CCFBF1;
--primitive-brand-200: #99F6E4;
--primitive-brand-300: #5EEAD4;
--primitive-brand-400: #2DD4BF;
--primitive-brand-500: #006B5F;  /* Primary brand color */
--primitive-brand-600: #005A50;
--primitive-brand-700: #004D44;
--primitive-brand-800: #115E59;
--primitive-brand-900: #134E4A;
--primitive-brand-950: #0A302D;
```

All other primitive scales (gray, red, green, amber, blue, purple) remain unchanged. The semantic layer maps the brand primitives to accent tokens — swapping the brand scale is the only change needed to rebrand the entire app.

---

## 3. The 3-Layer Token Architecture

The app uses a 3-layer CSS custom property system defined in `platform/web/src/index.css`.

### Layer 1: Primitives

Literal color values organized by hue and lightness. **Never reference primitives directly in component code.** They exist only to be consumed by semantic tokens.

```css
--primitive-brand-500: #006B5F;
--primitive-gray-900:  #0F172A;
--primitive-red-600:   #DC2626;
/* etc. */
```

### Layer 2: Semantic Tokens

Contextual variables that map primitives to UI purposes. These are defined twice — once in `:root` (light theme) and once in `.dark` (dark theme). Components reference only semantic tokens, so theme switching is automatic.

| Category | Token | Light Value | Purpose |
|----------|-------|-------------|---------|
| **Surface** | `--surface` | gray-50 | Page background |
| | `--surface-raised` | `#FFFFFF` | Cards, modals, elevated elements |
| | `--surface-sunken` | gray-100 | Inset areas, nested containers, input backgrounds |
| | `--surface-overlay` | `#FFFFFF` | Dropdown menus, popovers |
| **Text** | `--text-primary` | gray-900 | Headlines, card titles, primary content |
| | `--text-secondary` | gray-700 | Body text, descriptions, supporting content |
| | `--text-muted` | gray-500 | Subtle labels, timestamps, helper text |
| | `--text-tertiary` | gray-400 | De-emphasized metadata, disabled text |
| | `--text-on-accent` | `#FFFFFF` | Text on accent-colored backgrounds |
| | `--text-inverted` | `#FFFFFF` | Text on dark surfaces |
| **Border** | `--border-default` | `rgb(15 23 42 / 0.10)` | Card borders, dividers (semi-transparent) |
| | `--border-strong` | `rgb(15 23 42 / 0.15)` | Input borders, emphasized dividers |
| | `--border-subtle` | `rgb(15 23 42 / 0.05)` | Faint separators within cards |
| **Accent** | `--accent` | brand-500 | Primary buttons, active states |
| | `--accent-hover` | brand-600 | Button hover |
| | `--accent-active` | brand-700 | Button press |
| | `--accent-emphasis` | brand-500 | Hero banners, strong emphasis backgrounds |
| | `--accent-subtle` | brand-50 | Light accent wash (backgrounds) |
| | `--accent-muted` | brand-100 | Medium accent wash (borders, hover states) |
| | `--accent-text` | brand-500 | Links, accent-colored text |
| | `--accent-strong-text` | brand-700 | Strong accent text (dark on light) |
| **Interactive** | `--interactive-hover` | gray-50 | Hover background for secondary/ghost buttons |
| | `--interactive-active` | gray-100 | Active/pressed background |
| | `--focus-ring` | brand-500 | Focus ring color |
| **Status** | `--error` | red-600 | Error states |
| | `--error-subtle` | red-50 | Error background |
| | `--error-text` | red-700 | Error text |
| | `--error-border` | red-200 | Error borders |
| | `--success` | green-600 | Success states |
| | `--success-subtle` | green-50 | Success background |
| | `--success-text` | green-700 | Success text |
| | `--success-border` | green-200 | Success borders |
| | `--warning` | amber-600 | Warning states |
| | `--warning-subtle` | amber-50 | Warning background |
| | `--warning-text` | amber-700 | Warning text |
| | `--warning-border` | amber-200 | Warning borders |
| | `--info` | blue-600 | Info states |
| | `--info-subtle` | blue-50 | Info background |
| | `--info-text` | blue-700 | Info text |
| | `--info-border` | blue-200 | Info borders |
| | `--neutral-subtle` | purple-50 | Neutral/survey states |
| | `--neutral-text` | purple-700 | Neutral text |

### Layer 3: Tailwind @theme Registration

Semantic tokens are exposed as Tailwind utilities via the `@theme` block in `index.css`. This enables semantic class names in JSX:

```tsx
// Correct — semantic utilities
<div className="bg-surface-raised text-text-primary border-border-default">

// Wrong — direct CSS variable references
<div className="bg-[var(--surface-raised)] text-[var(--text-primary)]">

// Wrong — hardcoded colors
<div className="bg-white text-gray-900 border-gray-200">
```

**Rule:** Never use hardcoded Tailwind color classes (`bg-gray-100`, `text-blue-500`) or direct `var()` references in components. Always use the semantic Tailwind utilities.

---

## 4. Typography

### Dual-Font System

The app uses two typefaces to separate data from narrative:

| Role | Font | Tailwind Class | Usage |
|------|------|---------------|-------|
| **Display / Headings** | Plus Jakarta Sans | `font-display` | Page titles, stat numbers, card headlines, empty-state titles |
| **UI / Body** | Inter (or system default) | `font-sans` (default) | Interactive elements, descriptions, dates, tables, body text |

Plus Jakarta Sans brings personality and authority to headlines without sacrificing the clean readability of Inter for body text.

### Adding the Display Font

Load Plus Jakarta Sans via Google Fonts (weights 500–900) and register it in `index.css`:

```css
@theme {
  --font-display: 'Plus Jakarta Sans', sans-serif;
}
```

### Text Hierarchy

Enforce a strict visual step-down within every page and card. If everything uses the same weight and color, the UI becomes a wall of undifferentiated text.

| Level | Usage | Classes |
|-------|-------|---------|
| **Page title** | Top-level heading | `text-xl sm:text-2xl font-bold font-display text-text-primary` |
| **Card title** | Primary text within a card | `text-base sm:text-lg font-semibold text-text-primary` |
| **Body text** | Descriptions, proposal abstracts | `text-sm font-medium text-text-secondary` |
| **Metadata** | Dates, authors, "Ends in 12h" | `text-xs font-medium text-text-muted` |
| **Section label** | Category headers above card groups | `text-xs font-semibold text-text-muted uppercase tracking-wide` |
| **Micro label** | Tiny structural labels (sidebar categories, stat card labels) | `text-[10px] font-bold text-text-tertiary uppercase tracking-widest` |

### Text Rendering

Add Tailwind's `antialiased` class to the `<html>` or `<body>` element. This sets `-webkit-font-smoothing: antialiased` and `-moz-osx-font-smoothing: grayscale`, which prevents fonts from looking artificially bold on high-DPI screens.

### The "No Pure Black" Rule

In app mode, users perform intensive reading tasks. **Never use pure black (`#000000`) for text.** The `--text-primary` token maps to gray-900 (`#0F172A` in Slate, `#111827` in the current gray scale) — a deep charcoal that passes WCAG AAA contrast standards but reduces halation (visual fuzziness caused by maximum-contrast text on white backgrounds).

---

## 5. Shape, Elevation & Surfaces

### Cards

Cards are the primary structural element — events, proposals, delegations, stat cards all live in cards.

| Property | Value | Notes |
|----------|-------|-------|
| **Background** | `bg-surface-raised` | White in light mode, gray-900 in dark |
| **Border radius** | `rounded-2xl` | Softer, more tactile than `rounded-lg`. Applies uniformly to all structural cards. |
| **Border** | `border border-border-default` | Always use a 1px border. Do not rely on shadow alone for card edges. |
| **Shadow** | `shadow-sm` | Subtle base elevation |
| **Hover** (interactive cards) | `hover:-translate-y-0.5 hover:shadow-md hover:border-accent-muted transition-all duration-200` | Lift effect + accent border for clickable cards |

Nested or secondary grouping elements within a card should use `bg-surface-sunken` to create visual depth without adding another card border.

**Do not use `rounded-md` or `rounded-lg` for structural cards.** Reserve smaller radii for inline elements like badges, inputs, and small buttons.

#### Semi-Transparent Borders ("The Secret Sauce")

A common UI mistake is pairing a solid gray border with a drop shadow. A solid hex border acts like flat paint — at the bottom edge of a card, it "fights" the shadow beneath it, creating visual mud. Semi-transparent borders act like tinted glass: they blend with the shadow, making the card feel physically grounded.

**Rule:** Structural borders use alpha-channel washes of the text color, not solid gray hex codes. This is implemented in the border tokens:

```css
/* LIGHT MODE: 5-15% opacity of Deep Slate (#0F172A) */
:root {
  --border-default: rgb(15 23 42 / 0.10);
  --border-strong: rgb(15 23 42 / 0.15);
  --border-subtle: rgb(15 23 42 / 0.05);
}

/* DARK MODE: 5-15% opacity of Frost White (#F8FAFC) */
.dark {
  --border-default: rgb(248 250 252 / 0.10);
  --border-strong: rgb(248 250 252 / 0.15);
  --border-subtle: rgb(248 250 252 / 0.05);
}
```

Because every component references `border-border-default`, this single token change upgraded the entire app's elevation system.

### Modals & Dialogs

- Border radius: `rounded-2xl` (matching cards, not larger)
- Entry animation: `animate-in slide-in-from-bottom-4 duration-300`
- Backdrop: `bg-overlay-backdrop` (semi-transparent)

### Elevation Hierarchy

```
Surface (page bg)  →  Surface-raised (cards)  →  Surface-overlay (dropdowns, modals)
         ↓                                              ↑
   Surface-sunken (inset areas within cards)          Shadow-lg
```

---

## 6. Layout Architecture

### Desktop (lg and above): Sidebar + Content

On screens ≥ 1024px, the app uses a persistent left sidebar with a scrollable content area:

```
┌──────────────────────────────────────────────────┐
│ Sidebar (w-64)  │  Content Area (flex-1)         │
│                 │                                │
│ ┌─────────────┐ │  ┌──────────────────────────┐  │
│ │ Logo        │ │  │ [Assembly Header + Tabs] │  │
│ ├─────────────┤ │  ├──────────────────────────┤  │
│ │ PERSONAL    │ │  │                          │  │
│ │  Dashboard  │ │  │  Page Content            │  │
│ │  Notifs     │ │  │  (max-w-5xl mx-auto)     │  │
│ │             │ │  │                          │  │
│ │ MY GROUPS   │ │  │                          │  │
│ │  Maple Hts  │ │  │                          │  │
│ │  Riverside  │ │  │                          │  │
│ │  Municipal  │ │  │                          │  │
│ ├─────────────┤ │  └──────────────────────────┘  │
│ │ User footer │ │                                │
│ └─────────────┘ │                                │
└──────────────────────────────────────────────────┘
```

**Sidebar structure:**
- **Logo area** (top): Votiverse logo + wordmark, links to dashboard
- **Personal section**: Dashboard, Notifications
- **My Groups section**: List of user's assemblies, each clickable to enter the assembly scope
- **User footer** (bottom): Avatar + @handle, clickable row linking to profile page

The sidebar uses `bg-surface-raised` with a right border (`border-r border-border-default`). The content area uses `bg-surface`.

When an assembly is selected, the content area shows the assembly header with a scrollable tab bar (Votes, Surveys, Delegates, Topics, Notes, Candidates — in that order). The tab bar is sticky below the assembly header.

### Mobile (below lg): Header + Bottom Tabs

On screens < 1024px, the sidebar is hidden. The app uses:

- **Top header**: Sticky, `h-14`, logo + avatar. Simplified — no full navigation in the header.
- **Bottom tab bar**: Fixed at screen bottom with safe-area padding for notched phones. Shows contextual tabs (global when at dashboard, assembly-scoped when inside an assembly).
- **Content area**: Full-width with `px-4 sm:px-6` horizontal padding and `pb-20` bottom padding (to clear the tab bar).

```
┌─────────────────────────┐
│ Header (sticky, h-14)   │
├─────────────────────────┤
│                         │
│  Page Content           │
│  (px-4, pb-20)          │
│                         │
│                         │
├─────────────────────────┤
│ Bottom Tabs (fixed)     │
│ [Home] [Groups] [Notif] │
└─────────────────────────┘
```

### Assembly Tab Order

Within an assembly, tabs appear in this order (conditionally based on governance config):

1. **Votes** (always present, default landing tab)
2. **Surveys** (if `features.surveys` enabled)
3. **Delegates** (if delegation enabled)
4. **Topics** (if delegation enabled)
5. **Notes** (if `features.communityNotes` enabled)
6. **Candidates** (if `delegation.candidacy` enabled)

Votes is the default tab because it's the most common action. There is no "Overview" tab — the assembly's profile/settings are accessible via the assembly name link in the header or sidebar.

### Content Width Constraints

| Context | Max Width | Usage |
|---------|-----------|-------|
| Page content (standard) | `max-w-3xl` (48rem) | Most pages: events, delegations, surveys |
| Page content (wide) | `max-w-4xl` (56rem) | Dashboard, pages with grids |
| Assembly content area | `max-w-5xl` (64rem) | Assembly-scoped pages (allows tab bar + content) |
| Header container | `max-w-7xl` (80rem) | Header content centering |

All use `mx-auto` for centering.

---

## 7. Component Guidelines

### Buttons

| Variant | Classes | Usage |
|---------|---------|-------|
| **Primary** | `bg-accent text-text-on-accent font-medium rounded-xl hover:bg-accent-hover active:scale-[0.97] transition-all` | Primary actions: "Vote Now", "Submit", "Accept" |
| **Secondary** | `bg-surface-raised text-text-secondary border border-border-strong rounded-xl hover:bg-interactive-hover active:scale-[0.97] transition-all` | Secondary actions: "Cancel", "Filter", "Decline" |
| **Danger** | `bg-error text-text-on-accent rounded-xl hover:bg-error-hover active:scale-[0.97] transition-all` | Destructive actions: "Delete", "Revoke" |
| **Ghost** | `text-text-secondary hover:text-text-primary hover:bg-interactive-active rounded-xl active:scale-[0.97] transition-all` | Tertiary actions, inline links |

**Sizes:**

| Size | Classes | Touch Target |
|------|---------|--------------|
| **sm** | `px-3 py-2 text-sm min-h-[36px] sm:min-h-0 sm:py-1.5` | 36px mobile, auto desktop |
| **md** | `px-4 py-2.5 text-sm min-h-[44px] sm:min-h-0 sm:py-2` | 44px mobile, auto desktop |
| **lg** | `px-6 py-3 text-base min-h-[48px]` | 48px always |

**Notes:**
- All buttons use `rounded-xl` (not `rounded-md`).
- All buttons include `active:scale-[0.97]` for tactile press feedback on touch devices.
- On mobile, primary actions at the bottom of cards (e.g., "Vote Now") should be `w-full`. On desktop, `sm:w-auto`.

### Badges

Badges represent status. They use semantic `-subtle` backgrounds paired with status text colors.

| Status | Color | Usage |
|--------|-------|-------|
| Active / Voting / Open | `green` | Events in voting phase, completed items |
| Pending / Action Needed | `yellow` | Curation phase, awaiting review, needs vote |
| Delegated / Info | `blue` | Delegation status, informational |
| Survey / Neutral | `purple` | Survey states |
| Closed / Draft | `gray` | Completed, inactive, draft items |
| Error / Urgent | `red` | Pending counts, urgent items |

**Badge styling:** `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium`

Badge color classes reference the badge-specific tokens (`bg-badge-green-bg text-badge-green-text`) so they work correctly in both light and dark themes.

### Cards

See Section 5 for shape and elevation. Additional patterns:

**Card with clickable rows** (e.g., delegation list, member list):
```tsx
<Card>
  <CardBody className="p-0 divide-y divide-border-subtle">
    {items.map(item => (
      <div className="p-4 sm:p-5 hover:bg-surface-sunken transition-colors">
        {/* row content */}
      </div>
    ))}
  </CardBody>
</Card>
```

**Card with header:**
```tsx
<Card>
  <CardHeader>
    <h3 className="font-semibold text-text-primary">Title</h3>
  </CardHeader>
  <CardBody>
    {/* content */}
  </CardBody>
</Card>
```

### Inputs & Selects

```
rounded-xl border border-border-strong bg-surface-raised
px-3 py-2.5 text-base sm:text-sm
min-h-[44px] sm:min-h-0 sm:py-2
focus:border-accent focus:ring-1 focus:ring-focus-ring
```

On mobile (< 640px), inputs use `font-size: 16px` to prevent iOS auto-zoom on focus.

### Avatars

DiceBear-generated SVG avatars with deterministic seeds based on participant names. Sizes: xs (20px), sm (28px), md (36px), lg (48px), xl (64px).

Avatar containers use: `rounded-full bg-surface-sunken border border-border-default shadow-sm`

### Tally Bars (Vote Results)

**Critical governance design rule: never map "For" to green and "Against" to red.** Color-coding options introduces visual bias. Instead, use a neutral rotating color palette:

```css
--tally-color-1: #3B82F6; /* Blue */
--tally-color-2: #F59E0B; /* Amber */
--tally-color-3: #10B981; /* Emerald */
--tally-color-4: #8B5CF6; /* Purple */
```

Options are assigned colors by position (first option gets color 1, second gets color 2, etc.), not by semantic meaning.

Tally bar tracks use `bg-surface-sunken rounded-full` and fills use `rounded-full` with the assigned tally color.

### Tooltips

CSS-only tooltips using `group-hover`:
```
bg-tooltip-bg text-tooltip-text rounded-md text-xs px-2.5 py-1.5
```

---

## 8. Mobile-First & Touch Interactions

### The 44px Rule

Any clickable element (buttons, select inputs, toggles, nav items) must have a minimum touch target of 44px on mobile to meet Apple's Human Interface Guidelines.

Implementation: `min-h-[44px] sm:min-h-0` — 44px floor on mobile, natural height on desktop.

### Bottom Navigation

On mobile, core routing uses a fixed bottom tab bar — not a hamburger menu. The tab bar includes safe-area padding for notched phones:

```css
.safe-bottom {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
```

Content area adds `pb-20 lg:pb-8` to prevent content from scrolling under the tab bar.

### Tap Highlights

Disable the default mobile web tap highlight globally:
```css
-webkit-tap-highlight-color: transparent;
```

### Active States

Buttons use `active:scale-[0.97]` for tactile press feedback. Combined with background color transitions, this makes the interface feel responsive to touch input.

### iOS Zoom Prevention

On mobile, input fields must use `font-size: 16px` to prevent iOS Safari from auto-zooming on focus:
```css
@media (max-width: 639px) {
  input, select, textarea {
    font-size: 16px !important;
  }
}
```

---

## 9. Dark Mode

### Implementation

Dark mode uses a class-based approach (`.dark` on `<html>`), persisted to `localStorage` under `votiverse:theme`. Three modes are available: `"light"`, `"dark"`, `"system"` (follows OS preference).

A synchronous `bootstrapTheme()` call runs before React mounts to prevent flash of unstyled content (FOUC). The `@custom-variant dark (&:where(.dark, .dark *))` declaration enables Tailwind v4's class-based dark mode.

### Dark Theme Token Mapping

The dark theme follows these principles:

1. **Surfaces** use deep slates, never pure black. Physical depth is preserved (raised > base > sunken).
2. **Text** is dialed back from pure white to prevent eye fatigue. `--text-primary` is gray-50, not `#FFFFFF`.
3. **Borders** are extremely subtle to avoid a wireframed look.
4. **Accent** shifts to a lighter teal (brand-400/300) for adequate contrast on dark surfaces.
5. **Status colors** use low-opacity washes (`rgb(... / 0.1)`) instead of solid backgrounds, which look oversaturated on dark surfaces.
6. **Text on accent buttons** uses dark teal (`--text-on-accent: brand-950`, `#0A302D`) instead of white. White text on the light teal accent (`#2DD4BF`) has only 1.9:1 contrast — unreadable. Dark teal achieves 7.6:1, passing WCAG AAA. This was verified visually and is implemented.

The full dark token set in `index.css`:

```css
.dark {
  /* Surfaces */
  --surface: var(--primitive-gray-950);
  --surface-raised: var(--primitive-gray-900);
  --surface-sunken: var(--primitive-gray-800);
  --surface-overlay: var(--primitive-gray-800);

  /* Text */
  --text-primary: var(--primitive-gray-50);
  --text-secondary: var(--primitive-gray-300);
  --text-muted: var(--primitive-gray-400);
  --text-tertiary: var(--primitive-gray-500);
  --text-on-accent: var(--primitive-brand-950); /* Dark text on light teal — 7.6:1 contrast */
  --text-inverted: var(--primitive-gray-900);

  /* Borders — semi-transparent for natural shadow blending */
  --border-default: rgb(248 250 252 / 0.10);
  --border-strong: rgb(248 250 252 / 0.15);
  --border-subtle: rgb(248 250 252 / 0.05);

  /* Accent (shifted lighter for contrast) */
  --accent: var(--primitive-brand-400);
  --accent-hover: var(--primitive-brand-300);
  --accent-active: var(--primitive-brand-500);
  --accent-emphasis: var(--primitive-brand-400);
  --accent-subtle: rgb(45 212 191 / 0.1);
  --accent-muted: rgb(45 212 191 / 0.2);
  --accent-text: var(--primitive-brand-300);
  --accent-strong-text: var(--primitive-brand-200);

  /* Interactive */
  --interactive-hover: var(--primitive-gray-800);
  --interactive-active: var(--primitive-gray-700);
  --focus-ring: var(--primitive-brand-400);

  /* Status — low-opacity washes */
  --error: var(--primitive-red-400);
  --error-subtle: rgb(239 68 68 / 0.1);
  --error-text: var(--primitive-red-300);
  --error-border: rgb(239 68 68 / 0.2);
  --error-hover: var(--primitive-red-500);
  --error-active: var(--primitive-red-600);

  --success: var(--primitive-green-400);
  --success-subtle: rgb(34 197 94 / 0.1);
  --success-text: var(--primitive-green-300);
  --success-border: rgb(34 197 94 / 0.2);

  --warning: var(--primitive-amber-400);
  --warning-subtle: rgb(245 158 11 / 0.1);
  --warning-text: var(--primitive-amber-300);
  --warning-border: rgb(245 158 11 / 0.2);

  --info: var(--primitive-blue-400);
  --info-subtle: rgb(59 130 246 / 0.1);
  --info-text: var(--primitive-blue-300);
  --info-border: rgb(59 130 246 / 0.2);

  --neutral-subtle: rgb(126 34 206 / 0.15);
  --neutral-text: var(--primitive-purple-400);

  /* Badges */
  --badge-gray-bg: var(--primitive-gray-800);
  --badge-gray-text: var(--primitive-gray-300);
  --badge-green-bg: rgb(34 197 94 / 0.15);
  --badge-green-text: var(--primitive-green-300);
  --badge-blue-bg: rgb(59 130 246 / 0.15);
  --badge-blue-text: var(--primitive-blue-300);
  --badge-yellow-bg: rgb(245 158 11 / 0.15);
  --badge-yellow-text: var(--primitive-amber-300);
  --badge-red-bg: rgb(239 68 68 / 0.15);
  --badge-red-text: var(--primitive-red-300);

  /* Miscellaneous */
  --skeleton: var(--primitive-gray-700);
  --overlay-backdrop: rgb(0 0 0 / 0.5);
  --tooltip-bg: var(--primitive-gray-100);
  --tooltip-text: var(--primitive-gray-900);
  --notification-dot: var(--primitive-red-400);
}
```

**`--text-on-accent` is resolved:** Dark text (`brand-950`, `#0A302D`) is used on accent buttons in dark mode, achieving 7.6:1 contrast (WCAG AAA). White text on `#2DD4BF` was only 1.9:1 — confirmed unreadable during visual QA.

---

## 10. Animation & Transitions

### Page Transitions

Pages animate in on mount to communicate navigation:

```tsx
<div className="animate-in fade-in duration-200">
  {/* page content */}
</div>
```

For assembly tab transitions (lateral navigation): `animate-in fade-in slide-in-from-bottom-2 duration-200`

Keep animations fast (200–300ms) and subtle. The app is a daily tool — showy animations become annoying with repeated use.

### Interactive Transitions

All interactive elements use `transition-colors` or `transition-all` with `duration-200` for smooth hover/focus state changes. Cards that lift on hover use `duration-200` (not 300ms — faster feels more responsive).

### Scrollbar Styling

Custom scrollbars for sidebar and overflow containers:

```css
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: var(--border-strong); border-radius: 10px; }
```

Use `.hide-scrollbar` for horizontal scroll containers where scrollbar chrome is unwanted (e.g., tab bars, badge filters).

### Header Backdrop Blur

The mobile header and bottom tab bar use `backdrop-blur-md` combined with a semi-transparent background for a frosted-glass effect:

```tsx
<header className="bg-surface-raised/90 backdrop-blur-md">
```

This allows content to scroll visibly behind the header while maintaining readability.

---

## 11. Implementation Workstreams

The transition from the current UI to this design system is organized into three workstreams, ordered by risk and dependency.

### Workstream A: Token Evolution (Low Risk, High Impact)

Changes that propagate through the entire app via the token system. No structural code changes.

1. Swap `--primitive-brand-*` scale from blue to teal in `index.css` (both `:root` and `.dark`)
2. Add Plus Jakarta Sans as `font-display` (Google Fonts import + `@theme` registration)
3. Add `antialiased` class to `<html>` element in `index.html`
4. Update Card component radius from `rounded-lg` to `rounded-2xl`
5. Update Button component radius from `rounded-md` to `rounded-xl`, add `active:scale-[0.97]`
6. Update Input/Select radius from `rounded-md` to `rounded-xl`
7. Add tally bar color variables (`--tally-color-1` through `--tally-color-4`)
8. Update dark mode accent tokens to use new teal brand scale
9. Verify `--text-on-accent` contrast in dark mode and adjust if needed
10. Add `--primitive-brand-950` value (`#0A302D`)

**Outcome:** The entire app visually transforms — new brand color, softer shape language, display font on headings — with no page-level code changes.

### Workstream B: Component & Typography Refinement (Medium Risk)

Updates to shared UI components and page-level typography patterns.

1. Add card hover lift effect to Card component: `hover:-translate-y-0.5 hover:shadow-md hover:border-accent-muted` (only when `onClick` or wrapping a `<Link>`)
2. Apply `font-display` to page titles across all pages
3. Apply strict text hierarchy: section labels use micro-label pattern, card titles use semibold, body uses medium text-secondary
4. Update Badge sizing and styling to match spec (uppercase tracking adjustments if needed)
5. Add page transition animations (`animate-in fade-in`)
6. Replace biased vote tally colors (green=yes, red=no) with neutral rotating palette
7. Add custom scrollbar styles
8. Add backdrop blur to mobile header and bottom tabs
9. Add `-webkit-tap-highlight-color: transparent` to global styles
10. Add `overscroll-behavior-y: none` to body for native-app scroll feel

**Outcome:** Polished, professional component library with consistent typography and tactile interactions.

### Workstream C: Sidebar Layout (Higher Risk)

Structural change from top-nav to sidebar on desktop.

1. Create new `AppShell` component with `flex h-screen` layout
2. Build desktop sidebar component (logo, personal nav, assembly list, user footer)
3. Rework Header for mobile-only use (hide on `lg:` and above)
4. Update content area to use `flex-1 overflow-y-auto` pattern
5. Build assembly-scoped sticky header with scrollable tab bar
6. Ensure all existing routes work (topics, predictions, awareness, settings, profile pages)
7. Handle assembly switching from sidebar (highlight active assembly)
8. Test responsive breakpoint transition (sidebar appears/disappears at `lg`)
9. Adjust content width constraints for sidebar layout (content area is narrower)

**Outcome:** Desktop experience transforms from a narrow-content web app to a proper multi-panel application.

### Execution Order

**A → B → C.** Each workstream is independently shippable. Stopping after A gives a refreshed brand. Stopping after B gives a polished product. C is transformative but higher risk.

---

## 12. Rules for New Pages & Components

When adding new pages or components to the app, follow these rules to stay aligned with the design system:

1. **Use semantic tokens, not colors.** `bg-surface-raised` not `bg-white`. `text-text-primary` not `text-gray-900`. No exceptions.
2. **Apply the text hierarchy.** Every page needs a clear title (font-display), and every card needs visual step-down from title → body → metadata.
3. **Cards are rounded-2xl.** Not rounded-lg, not rounded-md.
4. **Buttons are rounded-xl** with `active:scale-[0.97]`.
5. **44px touch targets on mobile.** Every interactive element: `min-h-[44px] sm:min-h-0`.
6. **Tally bars use neutral colors.** Never green=yes, red=no.
7. **Test in both light and dark mode.** If you add a new color, add both `:root` and `.dark` values.
8. **Section labels** for groups of cards use the micro-label pattern: `text-xs font-semibold text-text-muted uppercase tracking-wide`.
9. **Don't add raw CSS or inline styles.** Everything goes through Tailwind utilities mapped to semantic tokens.
10. **Respect the layout.** On desktop, your page renders inside the sidebar layout's content area. Don't set full-viewport widths or fixed positions that break the sidebar context.

---

## 13. Navigation Patterns & Page Structure

### List–Detail Pattern

Most assembly pages follow a **list–detail** structure: a list view showing cards, and a detail view showing the full entity. These are implemented as in-page state machines (not separate routes), with consistent navigation affordances.

**State machine pattern:**
```tsx
type ViewState = "list" | "detail" | "create" | "form";
const [view, setView] = useState<ViewState>("list");
```

**List view:**
- Page heading: `text-xl sm:text-2xl font-bold font-display text-text-primary`
- Subtitle: `text-sm text-text-muted mt-1`
- Action button (top-right): `<Button>` for primary action (e.g., "New Survey", "Find a Delegate")
- Card grid: `grid grid-cols-1 sm:grid-cols-2 gap-4` for entity cards, or `space-y-3` for stacked cards
- Cards are fully clickable (`cursor-pointer`, `hover:border-accent-border`)

**Detail view:**
- Always starts with a **back link**: `< Back to [List Name]`
- Content constrained to `max-w-3xl mx-auto` (detail views should not be too wide)
- Slide-in animation: `animate-in fade-in slide-in-from-right-2 duration-300` (or from-bottom for first load)

### Back Navigation

Every detail or sub-page **must** include a back link as its first element. This provides predictable navigation without relying on the browser back button.

```tsx
<button
  onClick={onBack}
  className="flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text-primary transition-colors min-h-[36px]"
>
  <ChevronLeft size={16} />
  Back to Surveys
</button>
```

**Rules:**
- Always use `ChevronLeft` icon (from lucide-react), not an arrow or custom icon
- Label format: "Back to [Parent Page Name]" — not "Go back" or just "Back"
- `min-h-[36px]` for touch-friendly tap target
- `text-text-muted` default, `hover:text-text-primary` on hover
- `font-medium` weight (not bold — it's a navigation affordance, not a heading)

### Assembly Tabs

Assembly tabs use text-only labels (no icons) with bold weight and generous spacing:

```tsx
<div className="flex overflow-x-auto hide-scrollbar gap-2 sm:gap-5">
  <Link
    to={tab.to}
    className={`pb-3 text-sm font-bold whitespace-nowrap border-b-2 transition-colors min-h-[44px] ${
      active
        ? "border-accent text-accent-text"
        : "border-transparent text-text-muted hover:text-text-primary hover:border-border-strong"
    }`}
  >
    {tab.label}
  </Link>
</div>
```

**Sub-tabs** within a page (e.g., Open/Closed filter) follow the same style but with `gap-4` and `border-b border-border-default` on the container.

### Card Design

Cards follow the component guidelines from Section 7, with these content conventions:

**Entity cards** (candidates, surveys, proposals):
- Avatar + name/title as header row
- Badge for status/type (top-right)
- Key metadata in the body (truncated with `line-clamp-2` or `line-clamp-4`)
- Footer: tags/badges on the left, score/action on the right, separated by `border-t border-border-subtle`
- Whole card is clickable (no separate "View" button)

**Note cards** (community notes):
- White background (`bg-surface-raised`) with `shadow-sm`
- Colored left border (`border-l-[3px]`): green for visible, amber for rated, gray for unrated
- Avatar + author name header
- Note text shown directly (no expand click) with `line-clamp-4` for long content
- Footer: stats on left, evaluation buttons on right

### Content Area Max Widths

| Context | Class | Pixels | When to use |
|---------|-------|--------|-------------|
| Detail views | `max-w-3xl mx-auto` | 768px | Candidate profile, survey detail, delegation config |
| List views | `max-w-3xl mx-auto` | 768px | Most list pages within assemblies |
| Wide lists | `max-w-4xl mx-auto` | 896px | Dashboard, notes list with filters |
| Assembly header | `max-w-5xl mx-auto` | 1024px | Tab bar container |

Always include `mx-auto` for centering.

### Sticky Footers

Action-heavy detail pages (candidate profile, delegation config) use a sticky footer for primary actions:

```tsx
<div className="fixed bottom-0 left-0 lg:left-64 right-0 p-4 bg-surface-raised/95 backdrop-blur-md border-t border-border-default z-40">
  <div className="max-w-3xl mx-auto flex items-center gap-3">
    {/* Actions */}
  </div>
</div>
```

**Rules:**
- `lg:left-64` accounts for the desktop sidebar width
- `bg-surface-raised/95 backdrop-blur-md` for frosted-glass effect
- Content inside must respect the same `max-w` as the page content
- Add `pb-20` or a spacer `<div className="h-16" />` at the bottom of the page to prevent content from being hidden behind the footer

### Inline Forms

Forms that replace content (e.g., quick delegation replacing voting buttons) use a sunken container to visually distinguish them from the surrounding content:

```tsx
<div className="bg-surface-sunken p-4 sm:p-6 rounded-2xl border border-border-strong animate-in fade-in slide-in-from-top-2 duration-300 shadow-inner">
  {/* Form content */}
</div>
```

**Stepped forms** use numbered step labels:
```tsx
<span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-2.5 block">
  1. What are you delegating?
</span>
```

### Scope/Option Cards

Radio-based selections (delegation scope, survey question options) use card-style radio buttons:

```tsx
<label className={`flex flex-col gap-1 p-3.5 rounded-xl border cursor-pointer transition-all ${
  selected
    ? "border-accent bg-surface-raised shadow-sm ring-1 ring-accent"
    : "border-border-default bg-surface-raised hover:border-border-strong"
}`}>
  <input type="radio" className="sr-only" />
  <span className="text-sm font-semibold text-text-primary">Option title</span>
  <span className="text-xs text-text-muted leading-snug">Description</span>
</label>
```

The `sr-only` radio input is hidden visually but remains accessible. The card border and ring provide the selected state feedback.

### Endorsement Pattern

Entities that support community endorsement (candidacies, proposals) show:
- **On cards** (read-only): net score with `ThumbsUp` icon — `EndorseScore` component
- **On profile pages** (interactive): `EndorseButton` component with "Endorse?" label, thumbs up/down buttons with counts, active state highlighting

Endorsement is a user-level signal. Community notes are the group-level deliberation layer on top.
