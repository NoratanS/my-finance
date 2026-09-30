# 02: One env template — the bundle's

**What to build:** a developer who wants to change a setting finds one `.env` template, the release bundle's, instead of two near-identical ones. The root template is removed; the README's "Run the whole stack" tells developers to copy the bundle's template to `.env` and notes that its launcher remarks apply to the bundle, and the development defaults file's header says it is not a template and points at the same file. The bundle template's text, which already carries every setting including `TZ`, does not change, and nothing else reads the removed file.

**Blocked by:** 01 — The release compose file is the one stack definition, and development includes it

**Status:** done

- [x] The root `.env.example` is gone and nothing in the repository refers to it any more
- [x] Every setting and comment the root template carried (the `TZ` block included) is present in the bundle's template, which is unchanged
- [x] The README's "Run the whole stack" points at the bundle's template and says its launcher notes apply to the release bundle
- [x] The development defaults file's header says it is not a template and names the bundle's template
- [x] `docker compose config` at the root still resolves exactly as after ticket 01

## Comments

- Before deleting it, the root template's keys and values matched the bundle's exactly (a diff of
  their non-comment lines is empty), and its `TZ` block (spec 17) was identical line for line to the
  bundle's, comments included. The only text lost is the root template's own header, which described
  the old root compose file's inline defaults.
- After the deletion the only remaining mentions of `.env.example` outside `.scratch/` and the dated
  plans in `docs/superpowers/` are the bundle's own (launchers, the release file's C12 message), the
  README and the development defaults file — all meaning the bundle's template.
- `docker compose config` after this ticket: all eight cases byte-identical to ticket 01's output.
