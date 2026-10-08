# Coffee Constellation

## Context

Coffee logs contain member identity and exact timestamps. Beyond consumption totals, those fields can reveal playful social proximity: members whose coffee registrations repeatedly occur near each other in time.

## Goal

Render an entertaining mobile constellation for the last 12 weeks. Members appear as stars sized by coffee count, and glowing beams connect pairs whose coffee logs occur within 30 minutes. Stars and beams expose playful details when tapped or focused.

## Non-goals

- Claiming that nearby timestamps prove people drank together
- Adding a graph-layout dependency
- Replacing existing analytical charts

## Phases

### Phase 1 - Relationship model
- [x] Filter valid recent coffee logs
- [x] Count member activity and near-in-time cross-member pairs
- [x] Derive each member's strongest coffee-buddy connection

### Phase 2 - Constellation experience
- [x] Render a responsive accessible SVG star field, nodes, and beams
- [x] Add tap and keyboard details for stars and relationships
- [x] Add playful light/dark styling with reduced-motion support
- [x] Validate model, interaction paths, empty states, cache, and docs

### Phase 3 - Time-window tuning
- [x] Expand the constellation history to 12 weeks
- [x] Tighten nearby coffee moments to 30 minutes
- [x] Update visible, accessible, and planning descriptions

## Decisions

- **Window** (revised 2026-06-19): Use 12 recent weeks to align with the Coffee Orbit and provide a broader constellation history.
- **Proximity** (revised 2026-06-19): Count coffees from different members within 30 minutes as a “shared coffee moment,” phrased playfully rather than as a factual meeting.
- **Layout** (locked 2026-06-19): Use a deterministic circular layout so the visualization remains stable and readable on phones.

## Test Plan

- Confirm only valid `COFFEE` logs within 12 weeks participate.
- Confirm same-user timestamps never create beams.
- Confirm the time-window loop stops after 30 minutes.
- Confirm member stars and relationship beams are keyboard accessible.
- Confirm one-member/no-relationship states remain useful.
- Run structural checks and `git diff --check`.

## Progress

- [x] Phase 1 complete
- [x] Phase 2 complete
- [x] Phase 3 complete
- [x] Tests pass
- [x] TODO.md updated
