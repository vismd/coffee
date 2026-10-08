# Coffee Web Application

## Purpose

The browser application provides the member and administrator experience for the coffee co-op. It accepts user actions through the main and analytics pages, reads and writes co-op data through Appwrite, and invokes the claim-token function when a device follows a one-time identity-sharing link.

## Key Files

- `index.html` - main dashboard entrypoint and script load order
- `analytics.html` - analytics dashboard entrypoint
- `js/app.js` - application initialization and member/admin interactions
- `js/analytics.js` - analytics loading, calculations, and chart rendering
- `js/db.js` - shared Appwrite database and storage operations
- `js/auth.js` - session initialization and authorization helpers
- `js/config.js` - Appwrite project and resource configuration
- `js/ui.js` - reusable dashboard rendering helpers
- `js/mobile-ui.js` - shared mobile forms, inline validation, loading states, and toast feedback
- `js/pwa.js` - install prompt and service-worker registration
- `css/style.css` - shared layouts, components, and themes
- `manifest.webmanifest` - installable app metadata and icons
- `service-worker.js` - offline application-shell cache

## Open

_No tasks recorded._

## In Progress

_No tasks currently in progress._

## Done

- [x] Added a playful interactive 12-week Coffee Constellation using 30-minute coffee-buddy proximity (2026-06-19) -> [plans/coffee-constellation.md](plans/coffee-constellation.md)
- [x] Added an interactive 12-week group Coffee Orbit visualization (2026-06-19) -> [plans/coffee-orbit.md](plans/coffee-orbit.md)
- [x] Added editable `Cash` and `Paypal Pool` top-up note quick selections with dark-mode support (2026-06-19) -> [plans/topup-quick-select.md](plans/topup-quick-select.md)
- [x] Improved the mobile interaction loop with consistent forms, inline validation, toast feedback, live dashboard updates, coffee undo, and PWA installation support (2026-06-19) -> [plans/mobile-experience.md](plans/mobile-experience.md)
