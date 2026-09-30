# 06: The YAML form of the OpenAPI document readable like the JSON form

**What to build:** an anonymous reader gets the OpenAPI document as YAML under the same security
rule as the JSON form, instead of being asked to sign in.

**Blocked by:** 01 (The OpenAPI document becomes the checked wire contract)

**Status:** done

- [x] A security test (red first) shows an anonymous request reads the document as JSON and as YAML
- [x] The YAML path is permitted by the same rule that permits the JSON document and Swagger UI

## Comments

- The YAML path sits in the same `permitAll` rule as the JSON document, but that rule is now two
  matcher entries (document: `/v3/api-docs/**`, `/v3/api-docs.yaml`; Swagger UI: `/swagger-ui/**`,
  `/swagger-ui.html`) instead of one four-path list. The one-list form pushed the line past
  Spotless's width, and palantir-java-format then re-indented the whole `authorizeHttpRequests`
  chain; two entries keep the diff to the lines that changed. Same behaviour.
- The first test run confirmed the grilling's inference: `/v3/api-docs.yaml` answered `401` anonymously.
