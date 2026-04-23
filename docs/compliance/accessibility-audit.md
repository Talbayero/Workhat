# Accessibility Audit: Work Hat CRM
**Standard:** WCAG 2.1 AA | **Date:** 2026-04-19 | **Auditor:** Static code analysis

---

## Summary

**Issues found:** 15 | **Critical:** 3 | **Major:** 7 | **Minor:** 5

This audit covered all primary UI surfaces: Login, Sidebar, Topbar, Inbox (list + thread workspace), Contacts, Companies, Knowledge, Settings, and the shared layout shell. The audit was conducted via static code analysis of all `.tsx` component files and `globals.css`.

The biggest risks are (a) a nearly-invisible text color used for error labels, (b) focus indicators stripped off the majority of interactive elements, and (c) loading/error state changes that are inaudible to screen readers. These three alone block assistive-technology users from using the product effectively. All three are fixable with targeted CSS changes.

---

## Findings

### Perceivable

| # | Issue | Location | WCAG Criterion | Severity | Recommendation |
|---|-------|----------|----------------|----------|----------------|
| P1 | `--rose` (`#49111c`) used as text color has a contrast ratio of **1.3:1** against the dark background (`#0a0908`). Used for "Generation failed" and "Risk flags" eyebrow labels in the AI Draft panel. | `thread-workspace.tsx` ln 991, 1036 | 1.4.3 Contrast (Min) | 🔴 Critical | Replace `text-[var(--rose)]` on visible text with a light color. For a dark-theme error label, use `#e57373` or similar; it reads as red but achieves 4.5:1+ on dark bg. |
| P2 | Status dot red (`#90323d`) achieves only **2.4:1** contrast against panel backgrounds (`#141416`). Non-text UI components require 3:1 minimum. Status dots are the sole indicator of risk level for keyboard/color-blind users. | `globals.css` (`.status-dot-red`), `inbox-workspace.tsx`, `thread-workspace.tsx` | 1.4.11 Non-text Contrast | 🔴 Critical | Lighten `.status-dot-red` to `#d46774` (≈4:1) or add a shape distinction (e.g. hollow vs filled vs triangle) so risk isn't conveyed by color alone. |
| P3 | Eyebrow labels are rendered at `text-[9px]` and `text-[9px]` throughout the app (sidebar section headers, panel labels, confidence indicators). WCAG doesn't mandate a minimum size, but 9 CSS px (≈7pt) is well below any readability baseline and will cause issues at browser default zoom levels before 200% zoom. | Sidebar, thread-workspace, settings-shell, knowledge-shell | 1.4.4 Resize Text | 🟡 Major | Raise minimum label size to `text-[11px]` (which is already used in some places). Avoid going below 11px anywhere. |

### Operable

| # | Issue | Location | WCAG Criterion | Severity | Recommendation |
|---|-------|----------|----------------|----------|----------------|
| O1 | **~55 instances of `outline-none`** with no replacement focus style. Affects: status dropdown, both composer textareas, topbar search, inline intent/assignee edit inputs, multiple settings inputs, and more. Keyboard users lose all visible indication of which element is focused. | `thread-workspace.tsx`, `topbar.tsx`, `settings-shell.tsx`, `contacts-shell.tsx`, `companies-shell.tsx`, `knowledge-shell.tsx`, `login/page.tsx` | 2.4.7 Focus Visible | 🔴 Critical | Remove `outline-none` globally via `globals.css` or Tailwind config, replacing it with a styled focus ring: `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]`. The settings toggle already does this correctly — apply that pattern everywhere. |
| O2 | No **skip navigation link** exists. Every page load requires keyboard users to tab through the entire 6-item sidebar before reaching main content. | `app-shell.tsx`, `sidebar.tsx` | 2.4.1 Bypass Blocks | 🟡 Major | Add a visually hidden "Skip to main content" link as the first focusable element in `app-shell.tsx`. Make it visible on focus: `sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 ...`. |
| O3 | Touch targets below 44×44 CSS px: sign-out button (`p-1` = ~16px), conversation filter pills (`px-3 py-2` is borderline), inbox badge pills (`px-1.5 py-0.5`), and most action buttons in the thread header (`px-2.5 py-1`). | `sidebar.tsx` ln 251–260, `thread-workspace.tsx` (header row), `inbox-workspace.tsx` | 2.5.5 Target Size | 🟡 Major | Increase touch targets to at least 44×44px. For small pill buttons, add invisible tap area via `min-h-[44px] min-w-[44px]` or use negative margin/padding tricks that expand the hit area without changing visual size. |
| O4 | Settings tab navigation renders as `<button>` elements inside `<nav>` but lacks ARIA tab semantics. Without `role="tablist"`, `role="tab"`, `aria-selected`, and `role="tabpanel"`, screen reader users cannot understand this is a tab interface and cannot navigate it with the standard Arrow-key tab shortcut. | `settings-shell.tsx` ln 2246–2260 | 4.1.2 Name, Role, Value | 🟡 Major | Add `role="tablist"` to the `<nav>`, `role="tab"` + `aria-selected={activeTab === tab.id}` to each button, and `role="tabpanel"` + `aria-labelledby` to the content pane. Implement Left/Right arrow key navigation per the ARIA Authoring Practices pattern. |

### Understandable

| # | Issue | Location | WCAG Criterion | Severity | Recommendation |
|---|-------|----------|----------------|----------|----------------|
| U1 | **No `aria-live` regions anywhere** in the app. When loading states start/finish, errors appear, drafts are generated, corrections are saved, or status changes succeed, screen readers receive no notification. The "Drafting…" spinner, "All changes saved." bar, and correction-saved banner are all invisible to AT. | `thread-workspace.tsx`, `settings-shell.tsx`, `knowledge-shell.tsx`, all shells | 4.1.3 Status Messages | 🟡 Major | Add `aria-live="polite"` to status message containers (save bar, send notice, edit-logged banner). Add `aria-live="assertive"` to error containers. For the draft loading spinner, add `role="status"` with a visually hidden text node: `<span className="sr-only">Generating draft…</span>`. |
| U2 | Form labels in Settings, Contacts, Companies, Knowledge, and Intents use `<label>` elements but **none have `htmlFor` attributes** that match an `id` on the associated input. Screen readers cannot programmatically associate labels with fields, so AT users hear field values without knowing what the field is for. | `settings-shell.tsx`, `contacts-shell.tsx`, `companies-shell.tsx`, `knowledge-shell.tsx` | 3.3.2 Labels or Instructions | 🟡 Major | Add matching `htmlFor`/`id` pairs to every label/input pair. Since these are in dynamic forms, use stable IDs like `id="intent-name-input"` or prefix with a component identifier. |
| U3 | Search inputs (topbar search, inbox search bar) have no accessible label. They have placeholder text only. Placeholders disappear on input and are not read by all screen readers as labels. | `topbar.tsx` ln 111–118, `inbox-workspace.tsx` ln 107–113 | 3.3.2 Labels or Instructions | 🟡 Major | Add `aria-label="Search records, threads, and knowledge"` to the topbar input and `aria-label="Search conversations"` to the inbox input. |
| U4 | Error messages on the Login page appear as a bare `<p>` element with no programmatic relationship to the form fields that caused them, and no `role="alert"`. Errors from validation (e.g. "Passwords do not match") aren't announced to screen readers. | `login/page.tsx` ln 256–259 | 3.3.1 Error Identification | 🟠 Minor | Add `role="alert"` to the error paragraph so it's announced automatically. Optionally add `aria-describedby` on the relevant input pointing to the error element. |

### Robust

| # | Issue | Location | WCAG Criterion | Severity | Recommendation |
|---|-------|----------|----------------|----------|----------------|
| R1 | Multiple `<aside>` and `<nav>` landmark elements exist on the same page with no `aria-label` to distinguish them. The app shell has both a main sidebar `<aside>` and an inbox list `<aside>`. Topbar has a search form. Screen reader users who navigate by landmarks cannot tell them apart. | `sidebar.tsx` ln 167, `inbox-workspace.tsx` ln 66, `topbar.tsx` | 4.1.2 Name, Role, Value | 🟠 Minor | Add distinguishing `aria-label` attributes: `<aside aria-label="Main navigation">`, `<aside aria-label="Conversation list">`, and wrap the topbar search in `<form role="search" aria-label="Global search">`. |
| R2 | Status dots (`.status-dot-green`, `.status-dot-yellow`, `.status-dot-red`) are pure CSS-colored `<span>` elements with no text alternative. Risk level ("green / yellow / red") is communicated only through color, which fails for color-blind users and screen reader users. | `inbox-workspace.tsx` ln 192–195, `thread-workspace.tsx` ln 582–587 | 1.4.1 Use of Color | 🟠 Minor | Add visually hidden text beside each dot: `<span className="sr-only">{conversation.riskLevel} risk</span>`. The text label already exists next to the dot in some places (`<span className="capitalize">{conversation.riskLevel}</span>`) but not everywhere, and the dot should have `aria-hidden="true"`. |
| R3 | Page `<title>` is always "Work Hat CRM" regardless of the current route. Screen reader users navigating between tabs cannot identify the page from the window title. | `layout.tsx` ln 5–9 | 2.4.2 Page Titled | 🟠 Minor | Use Next.js per-page `export const metadata` or `generateMetadata` to produce route-specific titles like "Inbox — Work Hat CRM", "Contacts — Work Hat CRM", etc. |
| R4 | Loading spinners (AI draft generation, save state) are pure CSS animations with no accessible text. `role="status"` is absent; the spinning div is completely transparent to screen readers. | `thread-workspace.tsx` ln 981–985 | 4.1.3 Status Messages | 🟠 Minor | Add `role="status"` and a `<span className="sr-only">` sibling: `<span className="sr-only">Generating draft, please wait…</span>`. |
| R5 | The pencil emoji `✎` used inside the intent edit button and the assignee button is a raw Unicode character with no `aria-label` on the parent button beyond the intent value text itself. AT announces "pencil" or nothing predictable. | `thread-workspace.tsx` ln 536 | 4.1.2 Name, Role, Value | 🟢 Minor | Wrap the emoji in `<span aria-hidden="true">✎</span>` (already partly done) and verify the parent button's accessible name includes "edit" — e.g. `aria-label={\`Edit intent: ${intentValue}\`}`. |

---

## Color Contrast Analysis

| Element | Foreground | Background | Ratio | Required | Pass? |
|---------|-----------|------------|-------|----------|-------|
| Body text (`--foreground`) | `#f2f4f3` | `#0a0908` | 21:1 | 4.5:1 | ✅ |
| Muted text (`--muted` ~`#9b9d9b`) | `rgba(242,244,243,0.62)` | `#0a0908` | 7.9:1 | 4.5:1 | ✅ |
| Muted text on panel (`--panel-strong`) | `rgba(242,244,243,0.62)` | `#141416` | 7.0:1 | 4.5:1 | ✅ |
| Error label text (`--rose`) | `#49111c` | `#0a0908` | **1.3:1** | 4.5:1 | ❌ |
| Error label on panel | `#49111c` | `#141416` | **1.2:1** | 4.5:1 | ❌ |
| White on active nav (`--moss`) | `#ffffff` | `#90323d` | 10.7:1 | 4.5:1 | ✅ |
| Amber text (`--amber`) | `#a9927d` | `#0a0908` | 7.4:1 | 4.5:1 | ✅ |
| Status dot red (non-text) | `#90323d` | `#141416` | **2.4:1** | 3:1 | ❌ |
| Status dot green (non-text) | `#78a17a` | `#141416` | 4.5:1 | 3:1 | ✅ |
| Status dot yellow (non-text) | `#a9927d` | `#141416` | 7.4:1 | 3:1 | ✅ |
| Moss button border on dark bg | `#90323d` | `#0a0908` | 1.9:1 | 3:1 non-text | ❌ (border) |

---

## Keyboard Navigation

| Element | Tab Reachable | Enter/Space | Arrow Keys | Focus Ring |
|---------|--------------|-------------|------------|------------|
| Sidebar nav links | ✅ | ✅ (links) | ❌ no arrow nav | ❌ `outline-none` stripped |
| Settings tabs | ✅ | ✅ | ❌ not implemented | ❌ stripped |
| Status dropdown | ✅ | ✅ | ✅ native select | ❌ stripped |
| Composer textarea | ✅ | ✅ (text insert) | ✅ cursor nav | ❌ stripped |
| Inline intent edit | ✅ (autoFocus) | ✅ (Enter = save) | ✅ cursor | ❌ stripped |
| AI Draft panel close | ✅ | ✅ | n/a | ✅ implied |
| Settings toggle switch | ✅ | ✅ | n/a | ✅ `focus-visible:outline` |
| Topbar search | ✅ | ✅ (submit) | ✅ cursor | ❌ stripped |
| Sign-out button | ✅ | ✅ | n/a | ❌ stripped |

---

## Priority Fixes

**1. 🔴 Fix `--rose` text color** — affects any user relying on color vision or screen contrast. One-line CSS change: replace `text-[var(--rose)]` on text nodes with a light error red (e.g. `text-[#e57373]`). The `--rose` variable is fine as a background tint, just not as a text color.

**2. 🔴 Restore focus indicators globally** — add to `globals.css`:
```css
:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 2px;
}
```
Then audit each `outline-none` instance and keep only those where an explicit `focus-visible:` replacement is in place (like the toggle). This is the single highest-leverage change — it restores keyboard usability across the entire app.

**3. 🔴 Lighten status-dot-red** — change `.status-dot-red { background: #90323d }` to `.status-dot-red { background: #c9606a }` (≈4:1 on panel-strong). This also makes the risk indicator more legible for all users in low-light or low-contrast display conditions.

**4. 🟡 Add `aria-live` to status zones** — wrap save bars, error containers, and the draft loading zone with `aria-live="polite"`. The correction banner and "All changes saved" message should announce themselves without user action.

**5. 🟡 Associate form labels with inputs (`htmlFor`/`id`)** — affects Settings, Contacts, Companies, Knowledge, Intents forms. Systematic change: for each `<label>` add `htmlFor="field-id"` and add the matching `id` to the input. Prevents screen reader users from hearing unlabeled fields.

**6. 🟡 Label search inputs** — add `aria-label` to both search inputs (topbar + inbox sidebar). Two-line change.

**7. 🟡 Add ARIA tab pattern to Settings** — `role="tablist"` on the nav, `role="tab"` + `aria-selected` on each button, `role="tabpanel"` on the content pane, and Left/Right arrow key navigation. Medium effort but high impact for power users.

**8. 🟡 Add a skip navigation link** — single visually-hidden `<a>` at the top of `app-shell.tsx` pointing to `#main-content`, visible on focus. Prevents forcing keyboard users to tab through the full sidebar on every page.

**9. 🟠 Per-route `<title>` tags** — add `export const metadata` to each page file (inbox, contacts, companies, etc.) so the browser tab and screen reader announce the current section.

**10. 🟠 Landmark `aria-label` attributes** — two `<aside>` elements and multiple `<nav>` elements need distinguishing labels so screen reader users can jump to the right one by landmark.

---

## Notes for Remediation

- The app already does several things correctly: `aria-hidden="true"` on all decorative SVG icons, `aria-label` on close buttons and the customer profile trigger, `lang="en"` on the root HTML element, and semantic `<article>` elements for messages. These are good foundations to build on.
- The settings toggle component (`role="switch"` + `aria-checked` + `focus-visible:outline`) is a perfect template for the focus ring pattern — apply it everywhere.
- All issues above are code-level fixes with no design changes required. The visual design is sound; the gap is entirely in ARIA markup and CSS focus state management.
