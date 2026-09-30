# 13: One display helper for the profile-currency tile totals

**What to build:** the Dashboard and Transactions tiles compute the profile currency's expense, income, net and count, and the count of transactions in other currencies, through one display helper in the money module, and format the signed net through one formatter beside `formatSigned`. Every number and disclosure the user reads stays the same.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] One money-module helper takes the per-currency summary rows and the profile currency and returns the tile numbers and the foreign count
- [ ] A signed-net formatter sits beside `formatSigned`; both screens use both
- [ ] The existing Dashboard and Transactions screen tests are unchanged and green
- [ ] Lint, format check, tests, build and the Storybook build are green
