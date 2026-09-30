# 03: One-line failure sites use the module

**What to build:** deleting a budget, deleting a transaction, applying a merchant backfill, saving a subscription and its row actions (pause, resume, cancel, restore, delete), and saving a budget all show the module's banner. A validation failure on these screens now shows each field's message with the field's name instead of "The request body has N invalid field(s).", and the "Could not …" fallbacks become the shared fallback sentence. The budget dialog keeps its single form-level box (field placement there is spec 05's).

**Blocked by:** 01 (One module turns any failure into messages)

**Status:** ready-for-agent

- [ ] The budget dialog's test — a server field message is visible — is written first and fails
- [ ] The subscriptions screen's test — a server field message from saving the form is visible — is written first
- [ ] Both tests assert only the message text, so they survive the move of those messages under their fields
- [ ] None of the five files reads the error object any more
- [ ] Lint, format check, unit tests, build and Storybook build are green
