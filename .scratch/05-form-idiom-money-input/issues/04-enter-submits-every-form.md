# 04: Enter submits the category, profile and insight-name forms

**What to build:** pressing Enter in the add-category name, the new-profile name, a profile's rename field and the insight name submits that form, as it already does in the transaction and budget dialogs. Clicking a colour swatch, Cancel or "New insight" never submits. Labels and button names do not change.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The new tests are written first: Enter in the category name creates, Enter creates a profile, Enter saves a rename, Enter in the insight name saves (each fails today); a swatch click does not create and Cancel on the new-profile form creates nothing (both pass today, and fail once the fields are in a form unless the buttons declare their type)
- [x] Each of the four is a real form whose submit button has no click handler; every other button in it declares itself a plain button
- [x] A submit while that form's save is in flight is ignored
- [x] Every existing categories, profile picker and insights test passes unchanged
- [x] Lint, format check, unit tests, build and Storybook build are green

## Comments

- The four Enter tests failed first. The swatch and new-profile Cancel tests passed before the
  change; with the `type="button"` removed from the palette swatches, or from that Cancel, each
  fails, so they guard the change.
- Two test files mocked the create hook with an anonymous function; each now names it (same
  hook-mocked seam) so the Enter test can inspect the call.
- The rename card's outer element became the form itself, keeping its card class, so the layout
  and the end-to-end locator for a profile card are unchanged.
