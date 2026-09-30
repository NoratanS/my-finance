# 03: The login sequence lives in the sign-in module

**What to build:** logging in behaves exactly as today in both sign-in modes — the session response with no active profile and the sign-in mode, the indistinguishable `401` for a wrong password or an unknown email, no session after a failed login, a rotated session id and a cleared planted active profile after a successful one, `404 auth-disabled` in sign-in mode `none`, `400` for a malformed body in either mode — but the whole sequence (the mode rule, authentication and binding to the session, the session response) now runs in the sign-in module, outside any database transaction so the deliberately slow password check holds no pooled connection. The part that touches the servlet request and response stays in the security package and reaches the current request and response the way the active profile already reaches the request, so no servlet type enters the service layer; a new structural rule fails the build if a service ever depends on servlet types. The auth endpoint class becomes as thin as its siblings: one collaborator, one delegation per endpoint, no servlet parameters. The architecture document says where the sign-in rules live, that the local account is resolved on every request without a logged-in session, and lists the new structural rule.

**Blocked by:** 02 (Setting a password refuses in sign-in mode password by itself)

**Status:** ready-for-agent

- [ ] Every existing login test passes unchanged in sign-in mode `password` (session response, case-insensitive email, session carried across requests, session id rotated and stale active profile cleared, indistinguishable `401`s with no session created, blank fields `400`)
- [ ] Every existing passwordless test passes unchanged (login and register `404 auth-disabled`, set-password, cookieless requests leave no session)
- [ ] The login operation runs outside any database transaction, and its documentation says why
- [ ] The session-binding component takes only the email and password, obtains the current request and response itself, and is documented as request-thread only
- [ ] The auth endpoint class has one collaborator and reads the sign-in mode nowhere
- [ ] A structural test asserts that no service depends on servlet types, and it passes
- [ ] The committed OpenAPI document is unchanged (its drift test passes)
- [ ] The architecture document's passwordless bullet and structural-tests paragraph are updated
- [ ] The backend build is green
