# Top-up Payment Quick Select

## Context

Administrators repeatedly enter the payment source when topping up a member. The note should remain editable while making the two common values available with one tap.

## Goal

Default the top-up note to `Paypal Pool` and add touch-friendly `Cash` and `Paypal Pool` buttons that populate the editable note field.

## Non-goals

- Changing top-up accounting or Appwrite data
- Restricting notes to predefined values

## Phases

### Phase 1 - Form interaction
- [x] Change the default note
- [x] Add quick-select controls
- [x] Preserve custom note editing and inline validation

### Phase 2 - Dark-mode regression
- [x] Prevent generic modal styles from overriding mobile-sheet theme colors
- [x] Validate sheet, input, and action contrast in dark mode

## Decisions

- **Typo normalization** (locked 2026-06-19): Use `Cash` as the intended spelling of the requested `Cach` option.

## Test Plan

- Verify the default input value is `Paypal Pool`.
- Verify both quick-select buttons target the note field.
- Verify the note remains an ordinary editable text input.
- Run `git diff --check`.

## Progress

- [x] Phase 1 complete
- [x] Phase 2 complete
- [x] Tests pass
- [x] TODO.md updated
