# 01: The account lookup normalises the email

**What to build:** a user logs in with their email typed in any case and with stray spaces around it, exactly as today, but the forgiveness now comes from the account lookup itself: the lookup that compares an email with the stored form normalises what it is given, so no caller of the login flow has to normalise first. The service's pass-through that existed only for that purpose is gone, the login endpoint hands the email on as typed, and the two comments that claimed "the email must already be normalised" are replaced. Registration keeps normalising before it stores; the stored form does not change.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Logging in with the email in another case and with surrounding spaces succeeds, as before
- [x] The account lookup normalises its input with the same rule registration uses to store emails
- [x] The service no longer exposes an email-normalising pass-through
- [x] No comment claims that callers normalise the email before authentication
- [x] Every existing login, register and passwordless test passes unchanged; the backend build is green

## Comments

- No new test, as the spec says: `loginIsCaseInsensitiveOnEmail` is the guard. Checked that it
  guards the new home of the rule: with the lookup's normalisation removed (and the controller no
  longer normalising), it fails with `401` instead of `200`.
- Backend: `Tests run: 445, Failures: 0, Errors: 0, Skipped: 0`.
