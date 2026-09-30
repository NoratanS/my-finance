# 03: The budget dialog renders through the dialog module

**What to build:** the add/edit Budget dialog renders its form inside the shared dialog module, with its title and its current width. A keyboard user can no longer Tab out of it onto the page behind the backdrop, and when it closes focus returns to the "New budget" or "Edit" button that opened it. The form library stays in place.

**Blocked by:** 01 — One dialog module, with the confirmation dialog built on it

**Status:** done

- [x] The budget dialog renders through the dialog module, titled "Add budget" or "Edit budget", at its current width
- [x] The Category field stays the first control, so it receives focus on open
- [x] Its own shell markup, "focus the category field" handling and Escape handling are deleted, with the misleading "mirrors the transaction dialog" comment
- [x] Its two tests and the Budgets screen tests that open it pass unchanged; no dialog-behaviour test is added for it
- [x] The lessons entry is written: why the dialog is a React module and not the native element, and why the module rather than the caller moves focus in
- [x] Lint, format check, unit tests, build and Storybook build are green

## Comments

- The lessons entry is in the orchestrator's scratchpad (`impl/lessons/03.md`), since
  `docs/LESSONS.md` is git-ignored.
- The fix was checked once with a throwaway Budgets screen test (open with "New budget", focus
  on Category, Shift+Tab and Tab wrap, Escape returns focus to "New budget"): it passed on this
  branch and failed on the previous `BudgetForm`. It was deleted, not committed, per the spec's
  "no dialog-behaviour test for `BudgetForm`".
