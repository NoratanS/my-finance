# 01: One module turns any failure into messages

**What to build:** a single function in the API layer that turns whatever a failed request threw — a Problem, a response that is not a Problem, a network failure, anything else — into what a screen can show: a one-line banner, messages for the fields the screen displays, the Problem list when the Problem carries one, and the Problem type. No screen uses it yet; every screen behaves as before. The unused per-field helper on the error object is deleted, and the API document stops promising a dialog for domain-rule failures and stops listing category-in-use as a 422.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The module's table test is written first and fails for want of the module
- [x] A failure that is not an API error yields the single fallback sentence "Something went wrong — is the backend running?"
- [x] A response that is not a Problem yields the fallback sentence at status 500 and above, and "Request failed with status N." below 500, with no Problem type
- [x] Field violations for listed fields are placed at those fields, several for one field joined with " · "; every other violation becomes a banner line "field: message"; the "N invalid field(s)" detail is never shown
- [x] The three pseudo-fields a form can trigger are translated to their real field before placement, listed or not
- [x] Any other Problem yields its detail; with the code option a non-empty banner from a Problem reads "status type — banner"
- [x] The Problem list is filled from any Problem that carries one
- [x] The doc comment states the rules, that every mutation call handles its own failure, and why screens may branch on the Problem type
- [x] The unused per-field helper on the error object is deleted
- [x] The API document's 400/422 paragraph matches the code
- [x] Lint, format check, unit tests, build and Storybook build are green
