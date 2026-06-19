# AGENTS.md

## Project

Coffee is a small browser-based coffee co-op application. It tracks member balances and coffee consumption, records shared purchases and maintenance, provides an analytics dashboard, and uses Appwrite for authentication, data, storage, and a one-time QR claim flow.

## Repository Layout

```text
.
|-- index.html                     # Main member and administrator dashboard
|-- analytics.html                 # Coffee and spending analytics dashboard
|-- css/style.css                  # Shared application styling and themes
|-- js/
|   |-- config.js                  # Appwrite client, resource IDs, and SDK services
|   |-- auth.js                    # Anonymous sessions, identity linking, and admin checks
|   |-- db.js                      # Appwrite database and storage operations
|   |-- ui.js                      # HTML render helpers for the main dashboard
|   |-- mobile-ui.js               # Shared mobile sheets, validation, and toasts
|   |-- pwa.js                     # Service-worker registration and install flow
|   |-- app.js                     # Main dashboard initialization and interactions
|   `-- analytics.js               # Analytics queries, calculations, and charts
|-- icons/                         # Installable app icons
|-- manifest.webmanifest           # PWA identity, scope, display, and icons
|-- service-worker.js              # Same-origin application-shell cache
|-- functions/claim-token/         # Appwrite function for one-time identity claims
|   |-- index.js                   # Claim validation, member linking, and token response
|   |-- package.json               # Function runtime dependencies and start command
|   `-- README.md                  # Function configuration and deployment guide
|-- TODO.md                        # Web application overview and task tracker
`-- plans/                         # Web application implementation plans
```

## Environment

The web application has no local package installation step. It loads the Appwrite browser SDK, QRCode.js, and Chart.js from CDNs.

- Serve the web application: `python -m http.server 8000`
- Open it: `http://localhost:8000/`
- Install function dependencies: `npm install --prefix functions/claim-token`
- Run the function entrypoint locally: `npm start --prefix functions/claim-token`
- Tests: no automated test suite is currently configured; perform browser smoke tests for both `index.html` and `analytics.html`.

The claim function also requires the Appwrite environment variables documented in `functions/claim-token/README.md`.

## Architecture

Both HTML entrypoints load shared Appwrite configuration, authentication, database helpers, and UI helpers as browser globals. `app.js` coordinates the member/admin dashboard, while `analytics.js` loads activity data and renders Chart.js visualizations. Browser actions read and update Appwrite member, log, global configuration, and storage resources.

Identity sharing crosses the module boundary: the browser creates a short-lived claim record and QR link, then invokes the `claim-token` Appwrite function. The function validates and consumes the claim, associates the scanning Appwrite user with the member when needed, and returns session/JWT information to the browser.

## Conventions

- Keep browser scripts framework-free and preserve their current load order because later files depend on globals created by earlier files.
- Route Appwrite data access through `DB` where an appropriate helper exists.
- Never expose the claim function's `APPWRITE_API_KEY` in browser code.
- Treat claim records as short-lived and single-use.
- Use `MobileUI` for forms, inline errors, loading states, and transient feedback instead of browser prompts or alerts.
- After successful mutations, call `App.refreshCurrentView()` rather than reloading the document.
- Keep the service worker limited to same-origin application-shell assets; Appwrite data and mutations remain network-driven.

## Documentation System

This repository follows the standard docs blueprint:

**Tier: 2 (Multi-module)**

- `TODO.md` - web application overview and task tracker
- `plans/<feature>.md` - web application feature plans
- `functions/claim-token/TODO.md` - claim-function overview and task tracker
- `functions/claim-token/plans/<feature>.md` - claim-function feature plans

### Lifecycle Rules

**Before starting a feature:**

1. Read `AGENTS.md` and the relevant `TODO.md`.
2. Check whether a plan file already exists for the feature.
3. If not, create the plan file before writing code.
4. Add an entry under **In Progress** in the relevant `TODO.md`.

**During implementation:**

- After each phase completes, check off its items in the plan file.
- After locking a decision, add it to the plan's Decisions section.

**After completing a feature:**

1. Run the available checks and smoke tests.
2. Move the entry from **In Progress** to **Done** in the relevant `TODO.md`.
3. Mark all plan checklist items complete.
4. Add newly established conventions to the Conventions section above.
5. Update the relevant TODO Purpose or Key Files section if module behavior changed.

**When starting work in a folder with no `TODO.md`:** ask the user, "This folder doesn't have a TODO.md yet - want me to generate one before we start?"
