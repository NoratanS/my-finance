# 03: The subscription form owns its state and is a real form

**What to build:** in the subscription form, pressing Enter in a text field adds (or saves) the subscription, clicking a billing period only selects it, Enter in Notes starts a new line, and "9,99" saves as "9.99". A server message about the name, price, next charge date or notes shows under that field. After an add the form empties itself and keeps focus; editing fills in the clicked subscription and goes back to the add form on save or Cancel, as today. Behind this, the form holds its own fields, messages, checks and saving, and the subscriptions screen only deals with the list and its row actions; the form's interface is the subscription being edited and a callback for when an edit ends.

**Blocked by:** 01 (The money module turns an entered amount into a money amount)

**Status:** done

- [x] The new tests are written first: Enter in the service name adds (fails today); "9,99" is sent as "9.99"; a billing-period click does not submit (passes today, and fails once the fields are in a form unless the buttons declare their type)
- [x] A server message for a field the form shows lands under that field
- [x] All existing subscriptions screen tests pass unchanged
- [x] The form resets by being re-rendered with a new key when the edited subscription changes, not by an effect
- [x] Every button in the form other than the submit button declares itself a plain button; a submit while a save is in flight is ignored
- [x] Lint, format check, unit tests, build and Storybook build are green

## Comments

- Of the new tests, Enter in the service name and the server message under Price failed first.
  "9,99" is sent as "9.99" passed before the change: the old screen already rewrote the first
  comma (only the budget dialog refused a comma). It stays as the proof that the form uses the
  shared amount rule.
- The billing-period test passes before and after; with the `type="button"` removed from those
  buttons it fails, so it guards the form change.
- Added one test beyond the spec's list: after an add the form empties itself (fails if the
  in-place reset is removed), since the reset moved from the screen into the form.
