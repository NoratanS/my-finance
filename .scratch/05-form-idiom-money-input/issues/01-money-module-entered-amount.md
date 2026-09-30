# 01: The money module turns an entered amount into a money amount; the transaction dialog uses it

**What to build:** one rule for every amount a user types. The money module gains two conversions: from an entered amount to the money amount sent on the wire (a comma or a dot accepted, a dot always sent, the digits kept exactly as typed) or the message to show under the field; and from a stored money amount to input text without trailing zeros. The transaction dialog uses both: it prefills an edited amount without trailing zeros, and a malformed amount ("1,234,56", "-5", "12 zł") shows its message under Amount and nothing is sent, instead of drawing a whole-body "request body is missing or malformed" answer from the server.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The money module's table test is written first and fails for want of the two functions
- [x] The table covers every row of the spec's `parseAmount` table (empty, plain, comma, too many decimals, zero, the malformed shapes including non-ASCII digits, 16 integer digits, 15 + 4 digits, leading zeros) and every `editableAmount` case
- [x] No floating-point conversion is made by either function
- [x] The money module's header says it holds display formatting and entry parsing
- [x] The transaction dialog's malformed-amount test is written first and fails (the amount is sent today)
- [x] The transaction dialog's existing tests, and the transactions screen's edit tests (prefill "10" from "10.0000", "12.50" sent, merchant cleared), pass unchanged
- [x] Lint, format check, unit tests, build and Storybook build are green
