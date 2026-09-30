# 01: One dialog module, with the confirmation dialog built on it

**What to build:** a shared dialog module that owns the dialog shell and its keyboard behaviour — the design-system markup and corners, the stacking order, focus moved to the first focusable element on open, Escape and backdrop-click dismissal, the Tab trap, focus returned to the opener on close, and the accessible name from the title. The confirmation dialog renders through it with its interface unchanged, so every confirmation behaves as before and anything focusable in its body is now reachable by Tab. The dialog behaviour is tested once, at the module; the confirmation dialog's own focus-return and Tab tests are replaced by the module's tests.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The module's tests are written first and fail before the module exists
- [ ] A dialog is a modal dialog named by its title, with a title id generated per instance
- [ ] On open, focus moves to the first focusable element
- [ ] Escape calls the close handler; a backdrop click calls it, a click inside the dialog does not
- [ ] Tab from the last focusable element wraps to the first; Shift+Tab from the first wraps to the last; a disabled control is skipped by the wrap
- [ ] Closing returns focus to the element focused before opening
- [ ] The module's doc comment records the caller rules and why it is not the native dialog element
- [ ] The confirmation dialog keeps its interface; its seven call sites are unchanged
- [ ] The confirmation dialog's focus-return and Tab tests are deleted, each mapped to the module test that replaces it; its other tests and every screen test that opens a confirmation pass unchanged
- [ ] Lint, format check, unit tests, build and Storybook build are green
