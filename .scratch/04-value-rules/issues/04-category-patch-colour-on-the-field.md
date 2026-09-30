# 04: A bad colour on the Category update is reported on the colour field

**What to build:** a user who changes a Category's colour to an invalid value gets the error under `color` — as the create endpoint and the API document already say — instead of under the undocumented pseudo-field `colorValid`. An absent colour and an explicit `null` stay valid, and a present value must still be a lowercase hex colour, exactly as before. The OpenAPI document shows the colour pattern on the update body too. The API document lists the complete set of pseudo-fields the API can return, and its Category update prose says the colour is validated on the field.

**Blocked by:** 02 (Each value rule has one home the request bodies use by name)

**Status:** ready-for-agent

- [ ] A malformed colour on the Category update yields one field violation `color` with the category colour message
- [ ] An absent colour and an explicit `null` colour are still valid; the other update rules (`anyFieldSet`, `nameValid`) are unchanged
- [ ] The value-rule test covers the update body's colour as its thirteenth site
- [ ] The two tests that pinned `colorValid` now expect `color`
- [ ] The committed OpenAPI document gains only the colour pattern on the update body, and the generated frontend types are current
- [ ] The API document lists every pseudo-field with the field it belongs to, and its Category update prose and example detail match the code
