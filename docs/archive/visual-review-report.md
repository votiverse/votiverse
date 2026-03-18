# Visual Review Report

**Date:** 2026-03-15
**Viewport tested:** Desktop (1440px) and Mobile (393px, iPhone 14 Pro equivalent)
**Browser:** Chrome

---

## Summary

The web client is in good shape for both desktop and mobile. The responsive work done by the CLI-based agent was well-executed — layouts stack correctly, touch targets are mostly appropriate, and there is no horizontal overflow on any page. Four issues were found and fixed during this review.

---

## Issues Fixed

### 1. Participant selector touch target too small on mobile

**File:** `platform/web/src/components/layout.tsx` (ParticipantSelector)
**Problem:** The select element had `min-h-[36px]`, below the 44px minimum recommended for mobile touch targets.
**Fix:** Changed to `min-h-[44px] sm:min-h-[36px]` so mobile gets 44px while desktop stays compact at 36px.

### 2. Hamburger menu button touch target too small

**File:** `platform/web/src/components/layout.tsx` (Header)
**Problem:** The hamburger button only had `p-2` on a 20px icon, giving approximately 36px total hit area.
**Fix:** Added `min-h-[44px] min-w-[44px] flex items-center justify-center` for a reliable 44px tap target.

### 3. Mobile menu lacked backdrop overlay

**File:** `platform/web/src/components/layout.tsx` (Header)
**Problem:** The mobile dropdown menu rendered inline without any visual separation from the page content behind it. Users could see and interact with content below the menu.
**Fix:** Added a semi-transparent backdrop (`bg-black/20`) that covers the viewport below the header. The menu now renders as an absolutely-positioned panel with `shadow-lg` above the backdrop.

### 4. Mobile menu did not close on outside tap

**File:** `platform/web/src/components/layout.tsx` (Header)
**Problem:** Related to the missing backdrop — there was no mechanism to dismiss the menu by tapping outside it.
**Fix:** The backdrop element has an `onClick` handler that closes the menu when tapped.

---

## What Works Well

### Desktop (1440px)
- **Assembly list:** Clean card layout with Active badge and date. Create Assembly form renders inline.
- **Assembly dashboard:** 4-column stats grid, 2-column config/features layout, Recent Events section.
- **Events list:** Proper card layout with issue count badge.
- **Event detail:** Voting buttons (For/Against/Abstain) properly sized. Tally bars render cleanly. Weight distribution in a 3-column grid.
- **Delegations:** 2-column layout — Active Delegations on left, Chain Resolver on right. Chain visualization shows horizontal arrows.
- **Polls:** Create Poll form is clean. Response buttons appropriately sized.
- **Awareness:** 2-column layout — Concentration Metrics and Delegate Profile side by side. Voting History spans full width below.
- **Navigation:** Desktop nav links in header. Participant selector with "Acting as [Name]" label.

### Mobile (393px)
- **Navigation:** Bottom tab bar with 5 tabs (Home, Events, Delegate, Polls, Aware). 52px min-height — well above 44px minimum. Hamburger menu for secondary navigation (Members).
- **Assembly list:** Single-column cards. Create Assembly form stacks properly.
- **Assembly dashboard:** 2x2 stats grid. Config/Features cards stack vertically. All content accessible via scrolling.
- **Event detail:** Vote buttons fill width with `flex-1`. Tally bars render at full width. Weight distribution stacks to single column. No horizontal overflow.
- **Delegations:** Both panels stack vertically. Chain visualization shows vertical arrows on mobile, horizontal on desktop. All chain nodes are full-width on mobile.
- **Polls:** Response buttons (Yes/No, Likert 1-5, Support/Oppose) properly sized with large touch targets.
- **Awareness:** All three panels stack vertically. Load buttons are full-width on mobile. Voting history uses card layout on mobile (instead of table on desktop).
- **Forms:** All input fields have `min-h-[44px]` and `text-base` (16px) on mobile — prevents iOS zoom-on-focus.
- **No horizontal overflow:** Verified programmatically on all pages (`document.body.scrollWidth === document.documentElement.clientWidth`).

---

## Notes for Future Work

These are not bugs but opportunities for improvement identified during the review:

1. **Issue selector UX:** The issue dropdowns in Awareness and Delegation Chain show truncated UUIDs (e.g., `a57636f1... (Q1 Budget)`). Consider showing issue titles instead of IDs.
2. **Participant state persistence:** The selected participant resets on page navigation. Consider persisting it in `localStorage` so users don't need to re-select after each page load.
3. **Polls state persistence:** Created polls are stored in component state and lost on navigation. This is a limitation of the current client-side-only poll management.
4. **Empty states consistency:** Some pages (Polls, Members) have good empty states with action buttons. Others (Awareness panels before data loads) could benefit from similar guidance.
