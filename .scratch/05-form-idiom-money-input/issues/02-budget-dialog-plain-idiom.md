# 02: The budget dialog in the plain form idiom; the form library is removed

**What to build:** the budget dialog accepts the same amounts as the transaction dialog — "12,50" saves as a budget — and shows a server message about the category, limit, currency or dates under that field. It keeps refusing, before anything is sent, a period that ends before it starts, a currency that is not a three-letter code and an empty date; with no category at all it says "Create a category first — every budget needs one." Editing shows the limit without trailing zeros. The dialog is written with plain state like every other form, and the form and schema libraries leave the app. The architecture document says why there is no form library.

**Blocked by:** 01 (The money module turns an entered amount into a money amount)

**Status:** done

- [x] The budget dialog's new tests are written first: "12,50" is sent as "12.50" (fails today); an end date before the start date is refused under Period end before any request; a server field message appears under its field; editing shows "1500.5" for "1500.5000"
- [x] The dialog's existing tests (zero limit refused and nothing sent; the limit sent as the string "1500.50") pass unchanged
- [x] The dialog still renders through the shared dialog module, with the category select as its first control; it adds no focus, Escape or backdrop code
- [x] The schema module is deleted; the form library, its resolvers and the schema library are uninstalled with the package manager; the manifest lists none of the three and no source file imports them
- [x] The form library and its resolvers are gone from the lockfile; the schema library stays there only as a development dependency of the React hooks lint plugin
- [x] The architecture document's frontend section gains the "why plain form state, no form library" paragraph and names the other runtime dependencies in the Recharts paragraph
- [x] Lint, format check, unit tests, build and Storybook build are green

## Comments

- Of the four new tests, the comma amount and the server message under Currency failed first.
  The period-end refusal and the edit prefill passed before the rewrite too (the schema's
  cross-field rule and the old trailing-zero trim already did both); they pin that the rewrite
  keeps them.
- The dialog builds its request body without naming the generated request type, so a rename of
  that alias (spec 15, or spec 04's merged budget request) does not touch this file.
