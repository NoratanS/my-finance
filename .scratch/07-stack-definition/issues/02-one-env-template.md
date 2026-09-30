# 02: One env template — the bundle's

**What to build:** a developer who wants to change a setting finds one `.env` template, the release bundle's, instead of two near-identical ones. The root template is removed; the README's "Run the whole stack" tells developers to copy the bundle's template to `.env` and notes that its launcher remarks apply to the bundle, and the development defaults file's header says it is not a template and points at the same file. The bundle template's text, which already carries every setting including `TZ`, does not change, and nothing else reads the removed file.

**Blocked by:** 01 — The release compose file is the one stack definition, and development includes it

**Status:** ready-for-agent

- [ ] The root `.env.example` is gone and nothing in the repository refers to it any more
- [ ] Every setting and comment the root template carried (the `TZ` block included) is present in the bundle's template, which is unchanged
- [ ] The README's "Run the whole stack" points at the bundle's template and says its launcher notes apply to the release bundle
- [ ] The development defaults file's header says it is not a template and names the bundle's template
- [ ] `docker compose config` at the root still resolves exactly as after ticket 01
