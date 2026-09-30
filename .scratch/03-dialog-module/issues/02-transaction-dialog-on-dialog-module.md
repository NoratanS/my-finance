# 02: The transaction dialog renders through the dialog module

**What to build:** the add/edit Transaction dialog renders its form inside the shared dialog module, with its title and the wider width it uses today. Its hand-written shell, Escape handling, focus handling and Tab trap are gone; for the user it looks and behaves exactly as before, with focus landing on the Amount field.

**Blocked by:** 01 — One dialog module, with the confirmation dialog built on it

**Status:** done

- [x] The transaction dialog renders through the dialog module, titled "Add transaction" or "Edit transaction", at its current width
- [x] The Amount field stays the first control, so it receives focus on open
- [x] Its own shell markup, focus handling, Escape handling and Tab trap are deleted; its form, fields and error handling are untouched
- [x] Its three dialog-behaviour tests (Tab wrap, Shift+Tab wrap, focus return) are deleted, each mapped to the module test that replaces it; its five form tests pass unchanged
- [x] Lint, format check, unit tests, build and Storybook build are green
