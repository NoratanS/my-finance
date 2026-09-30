# 02: Forms that place messages at fields use the module

**What to build:** the transaction dialog, the sign-in/register screen and the set-password screen get their failure messages from the module, listing the fields they show. Their hand-written pseudo-field translations go. A server message for a field the transaction dialog does not show (the description) now reaches its banner instead of being dropped; the other two screens look the same as before.

**Blocked by:** 01 (One module turns any failure into messages)

**Status:** ready-for-agent

- [ ] The transaction dialog's test — a server message for the description reaches the banner — is written first and fails
- [ ] The sign-in/register screen's test — a bcrypt-limit violation shows under Password — is written first
- [ ] The set-password screen's existing field-message test passes unchanged as its placement test
- [ ] None of the three screens translates a pseudo-field or reads the error object any more
- [ ] Lint, format check, unit tests, build and Storybook build are green
