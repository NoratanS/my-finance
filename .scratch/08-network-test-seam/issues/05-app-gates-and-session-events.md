# 05: The route gates and the Session events are covered

**What to build:** `App` is tested at the network seam: the loading splash while the Session is pending; signed-out visitors land on the sign-in screen; a Session without an Active profile lands on the profile picker and, after the user picks a Profile, returns to where it was going; a signed-in visitor at the sign-in route goes on to the picker or the app; a Session that expires mid-use lands on the sign-in screen; losing the Active profile mid-use lands on the picker; "Log out" signs out and shows the sign-in screen.

**Blocked by:** 01 — A shared test server answers every request, and nothing reaches a socket

**Status:** done

- [x] Every gate branch, both Session-event branches and sign-out have a test
- [x] The profile switch is asserted to carry `profileId` on the wire
- [x] Removing the listener's `409` branch, then its `401` branch, fails the named tests (planted once each, reverted)
- [x] Making the app layout ignore a missing Active profile fails the named test (planted once, reverted)
- [x] lint, format, test and build stay green

## Comments

- **Planted defects, each seen failing and reverted** (every one of the nine tests failed at least
  once): the listener's `409` branch removed ("losing the Active profile mid-use"), its `401`
  branch removed ("a Session that expires mid-use"), the app layout ignoring a missing Active
  profile and, separately, dropping the deep link (the pick-and-return test), no splash text
  (the splash test), the picker gate letting a signed-out visitor in (`/picker` case), the app
  layout rendering for a signed-out visitor (`/categories` case), the sign-in gate showing the
  sign-in screen to a Session without an Active profile, the sign-in gate always sending to the
  picker (the "shows the app" test), log-out not clearing the Session, and the nav not navigating
  after log-out (the log-out test).
- Two first plants were not defects a user could see: the app layout sending a signed-out visitor
  to `/picker` (the picker gate then sends them on to sign-in), and the sign-in gate always sending
  to `/` (the app layout then sends a Session without an Active profile on to the picker). The
  redirect chains still end on the right screen, so the tests rightly passed; sharper plants were
  used instead.
- **Rule of two.** The client tests and the `App` tests both declare a Category, so the Category
  tree builder (parentId and depth derived from nesting, roots at depth 1) entered the wire
  fixtures here, with its own small test (seen failing with roots at depth 0 and with parentId
  not derived).
