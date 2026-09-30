# 14: Verify the three findings added at the cross-check

**What to build:** the three findings reported by candidate 4 are verified by reading the code and the design documents. One that the documents settle is fixed; the others are recorded with the open decision for the owner.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Backup restore's year range (1-9999) versus the write endpoints: verified, decision recorded
- [x] Backup restore skipping a Transaction date's not-in-the-future rule: verified, decision recorded
- [x] The API document's validation-failure example ("fields" versus the backend's "field(s)"): verified and corrected to match the tested backend wording

## Comments

Verified by reading the code and the design documents. Only the third finding is settled by the
documents; the first two are left in the code and recorded as open decisions for the owner.

1. **Year range — confirmed, left open.** Restore's date check rejects any year outside 1–9999,
   while the Budget and Subscription write endpoints bind plain dates with no year bound, and
   Postgres `DATE` stores far larger years. So a Budget created with a period ending
   `+10000-01-01` exports and then fails to restore with a 422 "year must be between 1 and 9999".
   Neither API.md nor SCHEMA.md states a year bound for the write endpoints, and the two possible
   fixes point in opposite directions (loosen restore, or bound the write endpoints — the latter is
   value-rule territory, spec 04). Spec 04's documentation proposal already records it in API.md
   as a known difference "recorded rather than intended".
2. **Not-in-the-future rule on restore — confirmed, left open.** Restore checks a Transaction's
   `occurredOn` only for being a valid date; the write endpoint's "not after UTC today + 1" rule is
   not applied, so a hand-edited backup can restore a future-dated Transaction that a later `PUT`
   would reject. API.md's restore section says content is validated "with the same rules as the
   normal write endpoints" but its list of those rules does not include the date rule, so the
   intended behaviour is not clearly stated. Applying it would also give the restore validator a
   clock it does not have today (it is static and clock-free), which is a design change, not
   housekeeping. Spec 04 records it the same way as item 1. An exported file cannot trip it: every
   exported date was accepted when written and time only moves forward.
3. **"fields" versus "field(s)" — confirmed, fixed.** The backend writes "The request body has 2
   invalid field(s)." and its exception-handler test pins that text; API.md's validation-failure
   example said "invalid fields.". The example now matches the tested wording, byte-identical to
   spec 04's proposed edit of the same line, so that edit becomes a no-op when spec 04 lands.
