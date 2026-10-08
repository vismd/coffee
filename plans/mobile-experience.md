# Mobile Experience Improvements

## Context

Coffee is used primarily on phones, but several workflows rely on browser prompts, alerts, and full-page reloads. The application also lacks recovery for accidental coffee registrations and cannot be installed as an app.

## Goal

Provide consistent touch-friendly forms and feedback, refresh balances and activity without navigation, allow a short undo window after registering coffee, and make both entrypoints installable as a mobile PWA.

## Non-goals

- Redesigning Appwrite permissions or the identity claim flow
- Replacing the existing visual identity or application framework
- Adding offline writes or background synchronization

## Phases

### Phase 1 - Forms and feedback

- [x] Add shared mobile modal, validation, loading, and toast primitives
- [x] Replace prompt-based top-ups and alert-based action feedback
- [x] Validate UI integration with static checks (`node` is unavailable in the local environment)

### Phase 2 - Live dashboard updates

- [x] Refresh member balance, collective pot, and activity without reloading
- [x] Update successful admin actions in place
- [x] Validate dashboard rendering and data flow with focused static checks

### Phase 3 - Coffee undo

- [x] Return sufficient transaction data from coffee registration
- [x] Add a time-limited toast action that reverses the registration
- [x] Validate successful, expired, repeated, and changed-balance undo guards

### Phase 4 - Installable PWA

- [x] Add manifest, icons, metadata, and service worker
- [x] Cache the application shell while keeping Appwrite data network-driven
- [x] Add a mobile install affordance and validate PWA assets

## Decisions

- **Delivery order** (locked 2026-06-19): Implement and validate each requested feature sequentially.
- **Mobile interaction model** (locked 2026-06-19): Use bottom-sheet-style forms and bottom toasts with at least 48px touch targets.
- **Offline scope** (locked 2026-06-19): Cache only the application shell; mutations continue to require a network connection.

## Test Plan

- Run JavaScript syntax checks with `node --check` for every changed script.
- Verify that no application workflow still calls `prompt()` and action feedback no longer depends on `alert()`.
- Use focused static checks for live-refresh and undo call paths.
- Parse the web manifest, verify every referenced asset exists, and inspect service-worker cache paths.
- Run `git diff --check` after every phase and at completion.

## Progress

- [x] Phase 1 complete
- [x] Phase 2 complete
- [x] Phase 3 complete
- [x] Phase 4 complete
- [x] Static validation passes (Node/browser runtime unavailable locally)
- [x] TODO.md updated
- [x] AGENTS.md Conventions updated
