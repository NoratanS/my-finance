# 01: One dialog module, with the confirmation dialog built on it

**What to build:** a shared dialog module that owns the dialog shell and its keyboard behaviour — the design-system markup and corners, the stacking order, focus moved to the first focusable element on open, Escape and backdrop-click dismissal, the Tab trap, focus returned to the opener on close, and the accessible name from the title. The confirmation dialog renders through it with its interface unchanged, so every confirmation behaves as before and anything focusable in its body is now reachable by Tab. The dialog behaviour is tested once, at the module; the confirmation dialog's own focus-return and Tab tests are replaced by the module's tests.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The module's tests are written first and fail before the module exists
- [x] A dialog is a modal dialog named by its title, with a title id generated per instance
- [x] On open, focus moves to the first focusable element
- [x] Escape calls the close handler; a backdrop click calls it, a click inside the dialog does not
- [x] Tab from the last focusable element wraps to the first; Shift+Tab from the first wraps to the last; a disabled control is skipped by the wrap
- [x] Closing returns focus to the element focused before opening
- [x] The module's doc comment records the caller rules and why it is not the native dialog element
- [x] The confirmation dialog keeps its interface; its seven call sites are unchanged
- [x] The confirmation dialog's focus-return and Tab tests are deleted, each mapped to the module test that replaces it; its other tests and every screen test that opens a confirmation pass unchanged
- [x] Lint, format check, unit tests, build and Storybook build are green

## Comments

- The width is optional and, when omitted, the module sets no inline width at all, so the
  design-system stylesheet's 440 applies. This reads the spec's "default: the design system's
  dialog width, 440" literally: the design token stays authoritative, and the confirmation
  dialog's markup is unchanged (it had no inline width before either).
- Each new test was seen to fail: the first three for want of the module and its behaviour, the
  Tab tests with focus escaping onto a button outside the dialog; the backdrop, focus-return and
  disabled-skip tests were checked by breaking the module (no stopPropagation, no backdrop
  handler, no restore, opener captured after focus, disabled buttons in the selector), each
  turning exactly its own test red.
