# 06: The YAML form of the OpenAPI document readable like the JSON form

**What to build:** an anonymous reader gets the OpenAPI document as YAML under the same security
rule as the JSON form, instead of being asked to sign in.

**Blocked by:** 01 (The OpenAPI document becomes the checked wire contract)

**Status:** ready-for-agent

- [ ] A security test (red first) shows an anonymous request reads the document as JSON and as YAML
- [ ] The YAML path is permitted by the same rule that permits the JSON document and Swagger UI
