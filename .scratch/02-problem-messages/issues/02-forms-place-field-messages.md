# 02: Forms that place messages at fields use the module

**What to build:** the transaction dialog, the sign-in/register screen and the set-password screen get their failure messages from the module, listing the fields they show. Their hand-written pseudo-field translations go. A server message for a field the transaction dialog does not show (the description) now reaches its banner instead of being dropped; the other two screens look the same as before.

**Blocked by:** 01 (One module turns any failure into messages)

**Status:** done

- [x] The transaction dialog's test — a server message for the description reaches the banner — is written first and fails
- [x] The sign-in/register screen's test — a bcrypt-limit violation shows under Password — is written first
- [x] The set-password screen's existing field-message test passes unchanged as its placement test
- [x] None of the three screens translates a pseudo-field or reads the error object any more
- [x] Lint, format check, unit tests, build and Storybook build are green

## Comments

- The transaction dialog's test failed first (the description message was dropped). The
  sign-in/register test passes before and after — today's hand-written loop already moved the
  pseudo-field — so it was proved the other way: with `password` removed from the field list it
  fails, as does the set-password test with an empty field list.
