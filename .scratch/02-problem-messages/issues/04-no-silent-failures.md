# 04: Categories, the profile picker and the navigation show every failure

**What to build:** every error on the Categories screen — create, rename, move, delete, and a colour change that used to fail silently — shows its status and Problem type with the message. On the profile picker, a failed pick shows a message below the cards and stays on the picker, and a failed backup restore shows the detail and each entry of the Problem list as before; the "Could not …" fallbacks become the shared sentence. In the navigation, a failed profile switch or log-out shows a one-line message under the controls, announced as an alert and cleared when the next switch or log-out starts.

**Blocked by:** 01 (One module turns any failure into messages)

**Status:** ready-for-agent

- [ ] Categories tests — a failed colour change shows a message; a row error carries its Problem type — are written first and fail
- [ ] Profile picker tests — a failed pick shows the message and does not navigate (fails first); a backup-invalid restore shows the detail and each problem (characterisation, green before and after) — are written first
- [ ] Navigation tests — a failed switch shows the server's message; a failed log-out shows the fallback sentence — are written first and fail
- [ ] The existing Categories category-in-use test and the profile picker last-profile test pass unchanged
- [ ] The Categories create box still shows "409 category-name-taken — …", so the end-to-end collision assertion holds
- [ ] None of the three files reads the error object any more
- [ ] Lint, format check, unit tests, build and Storybook build are green
