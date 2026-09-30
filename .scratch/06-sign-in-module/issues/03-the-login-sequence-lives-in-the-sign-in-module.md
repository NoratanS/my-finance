# 03: The login sequence lives in the sign-in module

**What to build:** logging in behaves exactly as today in both sign-in modes — the session response with no active profile and the sign-in mode, the indistinguishable `401` for a wrong password or an unknown email, no session after a failed login, a rotated session id and a cleared planted active profile after a successful one, `404 auth-disabled` in sign-in mode `none`, `400` for a malformed body in either mode — but the whole sequence (the mode rule, authentication and binding to the session, the session response) now runs in the sign-in module, outside any database transaction so the deliberately slow password check holds no pooled connection. The part that touches the servlet request and response stays in the security package and reaches the current request and response the way the active profile already reaches the request, so no servlet type enters the service layer; a new structural rule fails the build if a service ever depends on servlet types. The auth endpoint class becomes as thin as its siblings: one collaborator, one delegation per endpoint, no servlet parameters. The architecture document says where the sign-in rules live, that the local account is resolved on every request without a logged-in session, and lists the new structural rule.

**Blocked by:** 02 (Setting a password refuses in sign-in mode password by itself)

**Status:** done

- [x] Every existing login test passes unchanged in sign-in mode `password` (session response, case-insensitive email, session carried across requests, session id rotated and stale active profile cleared, indistinguishable `401`s with no session created, blank fields `400`)
- [x] Every existing passwordless test passes unchanged (login and register `404 auth-disabled`, set-password, cookieless requests leave no session)
- [x] The login operation runs outside any database transaction, and its documentation says why
- [x] The session-binding component takes only the email and password, obtains the current request and response itself, and is documented as request-thread only
- [x] The auth endpoint class has one collaborator and reads the sign-in mode nowhere
- [x] A structural test asserts that no service depends on servlet types, and it passes
- [x] The committed OpenAPI document is unchanged (its drift test passes)
- [x] The architecture document's passwordless bullet and structural-tests paragraph are updated
- [x] The backend build is green

## Comments

- Unverified fact 1 of the spec is confirmed: `HttpServletResponse` is injectable as a
  request-aware proxy into a singleton — the context starts, and every HTTP login test in both
  sign-in modes passes unchanged (`loginSessionCarriesAuthenticationAcrossRequests` proves the
  context is saved to the real session, `loginRotatesSessionIdAndClearsStaleActiveProfile` that
  the real request's id is rotated). No fallback was needed.
- Unverified fact 2: in Spring Security 7.1.0 (bytecode of the cached jar),
  `HttpSessionSecurityContextRepository.saveContext` uses the response only to look for a
  `SaveContextOnUpdateOrErrorResponseWrapper`; a proxy is never one (and `SecurityContextHolderFilter`
  does not wrap), so it saves straight into the request's session — the same path as before.
- Unverified fact 3 (springdoc ignores servlet parameters): confirmed, `OpenApiDocumentTest` passes
  and `docs/openapi.json` is unchanged.
- The new ArchUnit rule was checked to fail on a service holding an `HttpServletRequest` field.
- The ARCHITECTURE.md proposals were wrapped to the file's width; the bullet's "Redis" lines were
  left as they are (spec 13's edit).
- Backend: `Tests run: 447, Failures: 0, Errors: 0, Skipped: 0` (446 before, +1 ArchUnit rule).
