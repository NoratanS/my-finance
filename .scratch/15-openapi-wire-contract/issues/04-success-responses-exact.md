# 04: Success responses stated exactly

**What to build:** in the OpenAPI document every field of a success response is required
(always present), the fields that can be `null` say so, and responses are documented as JSON.
Request bodies keep the required fields Bean Validation gives them. The generated response types
become accurate enough to derive from.

**Blocked by:** 03 (Plans, `viz` and execution bodies stated as free-form JSON objects)

**Status:** done

- [x] Tests (red first) assert: every property of a Transaction response is required, with description, merchant and subscription id nullable and amount not; every property of a Category node is required, with parent id and colour nullable and children a list of Category nodes; the session's active profile id is nullable; the Transaction request's required list is exactly its Bean Validation set; response content is JSON
- [x] One rule marks every property of every schema reachable from a success response as required, and terminates on the self-referencing Category tree
- [x] The nullable success-response fields (including the matching backup-file fields) are marked with the existing nullable convention
- [x] The committed document and the generated declarations are regenerated, and the frontend compiles with its types unchanged
- [x] No API response changes
- [x] ARCHITECTURE.md and docs/API.md state the required/nullable rule and its dependency on Jackson writing every record component

## Comments

- Inferred claim confirmed: `springdoc.default-produces-media-type=application/json` replaced `*/*`
  on all 38 success responses that carry content. The document diff touched only response
  components (required lists and the 13 nullable fields); no request component changed.
