# 02: Setting a password refuses in sign-in mode password by itself

**What to build:** on an instance in sign-in mode `password`, setting a password without the old one is refused by the sign-in module itself, not only by the endpoint in front of it — so any future caller (another endpoint, a job, a test) gets the same `404` `/errors/passwordless-only` answer and the stored hash stays unchanged. The rule is the first statement of the operation and is stated in its documentation. The set-password endpoint becomes a single delegation. The switch-back test no longer relies on calling the operation in the wrong mode: it gives the local account a hash produced by the application's password encoder (the same encoding the none-mode endpoint performs, which the passwordless tests prove) and then logs in over HTTP.

**Blocked by:** 01 (The account lookup normalises the email) — ordering only, both edit the sign-in module

**Status:** ready-for-agent

- [ ] A new test calls the set-password operation directly in sign-in mode `password` with an authenticated principal; it is seen failing before the change (the hash is silently changed)
- [ ] After the change that test passes: the passwordless-only problem is raised and the stored hash is unchanged
- [ ] The switch-back test is rewritten to set the hash with the password encoder and still logs in over HTTP in sign-in mode `password`
- [ ] `PUT /api/auth/password` answers exactly as before in both sign-in modes (`404 passwordless-only` with passwords, `204` without, `400` for a malformed body in either)
- [ ] The operation's documentation states its mode rule instead of saying the endpoint guards it
- [ ] Every other existing test passes unchanged; the backend build is green
