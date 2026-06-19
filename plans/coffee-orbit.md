# Group Coffee Orbit

## Context

The analytics page already includes conventional comparison, timeline, scatter, and category charts. It does not offer a compact visualization of the group's repeating weekly rhythm across both weekday and hour of day.

## Goal

Add a mobile-first circular heatmap covering the last 12 weeks: seven concentric weekday rings, 24 hourly segments, color intensity by coffee count, and tap/keyboard details for each segment.

## Non-goals

- Adding a new charting dependency
- Changing analytics queries or stored data
- Replacing existing charts

## Phases

### Phase 1 - Visualization
- [x] Add the Coffee Orbit section to the analytics layout
- [x] Aggregate filtered group coffee logs by weekday and hour
- [x] Render a responsive, accessible SVG orbit
- [x] Add touch and keyboard segment details

### Phase 2 - Mobile styling and validation
- [x] Add light/dark mobile styling and an intensity legend
- [x] Validate aggregation, 168 segments, interaction wiring, and empty data
- [x] Validate documentation and diff

## Decisions

- **Time window** (locked 2026-06-19): Use the most recent 12 weeks so the pattern stays current while retaining enough observations.
- **Rendering** (locked 2026-06-19): Use dependency-free SVG for crisp responsive rendering and per-segment accessibility.
- **Ring order** (locked 2026-06-19): Monday is the innermost ring and Sunday the outermost ring.

## Test Plan

- Confirm the renderer creates 7 × 24 segments.
- Confirm only valid `COFFEE` logs from the last 12 weeks are counted.
- Confirm segments expose labels and respond to click, Enter, and Space.
- Confirm empty data produces a useful message.
- Run structural checks and `git diff --check`.

## Progress

- [x] Phase 1 complete
- [x] Phase 2 complete
- [x] Tests pass
- [x] TODO.md updated
