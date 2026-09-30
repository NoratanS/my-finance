# 08: Document the Instance time zone

**What to build:** a self-hosting user can find `TZ`: the README, both env templates and the release bundle's README say it is optional, defaults to UTC, takes an IANA zone name, governs Insights' date windows, and that the subscription charge job, the subscriptions screen's dates and backup restore's re-basing stay UTC; that transaction dates are accepted up to UTC today + 1 in every zone; what a misspelled zone does; and that a shell-exported `TZ` wins over `.env`. The design documents stop implying the backend follows `TZ`, and "make the backend follow `TZ`" is recorded as an open question with a trigger. No behaviour changes.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] INSIGHTS.md's "Today" bullet says the executor shares the backend's injectable-clock pattern but not its zone
- [ ] API.md's open questions carry "Backend clock and the instance time zone" with its trigger
- [ ] README, both env templates and the release README document `TZ` as above; the templates' value equals the compose default
- [ ] Unverifiable here, recorded for the owner: on a real stack with `TZ=Europe/Warsaw` a plan executes, and a misspelled zone shows the documented message
