# 06: A lint rule keeps screens off the error object

**What to build:** a lint rule fails when any frontend source file outside the API layer and the tests imports the error object from the client, pointing the author at the module instead. The architecture document says, in one sentence, where a failed request becomes text and what keeps it there.

**Blocked by:** 02, 03, 04, 05 (every screen must have stopped importing the error object)

**Status:** ready-for-agent

- [ ] Importing the error object in a screen makes lint fail with a message naming the module (proved once, then reverted)
- [ ] The API layer and the test files may still import it
- [ ] The architecture document's frontend section carries the sentence
- [ ] Lint, format check, unit tests, build and Storybook build are green
