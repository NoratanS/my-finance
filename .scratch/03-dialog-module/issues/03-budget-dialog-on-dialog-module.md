# 03: The budget dialog renders through the dialog module

**What to build:** the add/edit Budget dialog renders its form inside the shared dialog module, with its title and its current width. A keyboard user can no longer Tab out of it onto the page behind the backdrop, and when it closes focus returns to the "New budget" or "Edit" button that opened it. The form library stays in place.

**Blocked by:** 01 — One dialog module, with the confirmation dialog built on it

**Status:** ready-for-agent

- [ ] The budget dialog renders through the dialog module, titled "Add budget" or "Edit budget", at its current width
- [ ] The Category field stays the first control, so it receives focus on open
- [ ] Its own shell markup, "focus the category field" handling and Escape handling are deleted, with the misleading "mirrors the transaction dialog" comment
- [ ] Its two tests and the Budgets screen tests that open it pass unchanged; no dialog-behaviour test is added for it
- [ ] The lessons entry is written: why the dialog is a React module and not the native element, and why the module rather than the caller moves focus in
- [ ] Lint, format check, unit tests, build and Storybook build are green
