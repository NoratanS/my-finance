# 01: Every response record is built by its own `from()` factory

**What to build:** a Transaction response is built by a static `from` factory on its own record, the
same way every other response record is built, and the backend no longer carries MapStruct: no
dependency, no annotation processor, no mapper package and no mapper unit test. Every transaction
endpoint returns exactly the same JSON as before, and ARCHITECTURE.md records one mapping idiom
with the real reason it is safe (the record's canonical constructor is the compile-time field
check) and why MapStruct was tried and removed. Code and document change in one commit.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The backend suite's result is recorded before the change
- [ ] The Transaction response record has a static factory that passes every component in the record's order, reads the subscription id without loading the Subscription and copies the amount as stored
- [ ] Create, get, update and list of Transactions build their responses with that factory, inside the service's transactions, and the service no longer depends on a mapper
- [ ] The backend build declares no MapStruct dependency, version property or annotation processor, and adds no replacement compiler configuration
- [ ] The mapper and its unit test are deleted; no other test is edited
- [ ] The committed OpenAPI document is unchanged and its drift check passes
- [ ] The full backend build is green with the same results as before minus exactly the two deleted mapper tests
- [ ] ARCHITECTURE.md's stack line, package layout and mapping paragraph describe one `from()` idiom and why MapStruct was removed; the record's Javadoc says it is built by `from`
