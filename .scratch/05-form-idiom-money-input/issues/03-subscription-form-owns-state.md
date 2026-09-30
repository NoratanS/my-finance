# 03: The subscription form owns its state and is a real form

**What to build:** in the subscription form, pressing Enter in a text field adds (or saves) the subscription, clicking a billing period only selects it, Enter in Notes starts a new line, and "9,99" saves as "9.99". A server message about the name, price, next charge date or notes shows under that field. After an add the form empties itself and keeps focus; editing fills in the clicked subscription and goes back to the add form on save or Cancel, as today. Behind this, the form holds its own fields, messages, checks and saving, and the subscriptions screen only deals with the list and its row actions; the form's interface is the subscription being edited and a callback for when an edit ends.

**Blocked by:** 01 (The money module turns an entered amount into a money amount)

**Status:** ready-for-agent

- [ ] The new tests are written first: Enter in the service name adds and "9,99" is sent as "9.99" (both fail today); a billing-period click does not submit (passes today, and fails once the fields are in a form unless the buttons declare their type)
- [ ] A server message for a field the form shows lands under that field
- [ ] All existing subscriptions screen tests pass unchanged
- [ ] The form resets by being re-rendered with a new key when the edited subscription changes, not by an effect
- [ ] Every button in the form other than the submit button declares itself a plain button; a submit while a save is in flight is ignored
- [ ] Lint, format check, unit tests, build and Storybook build are green
