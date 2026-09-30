# 03: Backup restore reads the value rules' parameters from their one home

**What to build:** backup restore checks money amounts, currency codes and category colours with the same limits, regular expressions and messages as the write endpoints, read from the one home of each value rule rather than from its own copies. Every problem string a restore returns stays exactly as it is. The API document's backup paragraph says restore reads the same parameters, that a test holds restore and the write endpoints to one table of values, and names the known date differences.

**Blocked by:** 02 (Each value rule has one home the request bodies use by name)

**Status:** ready-for-agent

- [ ] Backup restore holds no copy of the currency or colour regular expression or message, nor of the money amount digit limits
- [ ] Every existing backup restore test passes unchanged, and so does the agreement test
- [ ] Backup restore's name and text length limits stay its own
- [ ] The API document's backup paragraph describes the shared parameters, the agreement test and the known date differences
