# Insights explorer — visual design

The explorer is the first screen in `my-finance` that is a *tool*: the user
assembles a question and looks at the answer, instead of filling a form or
scanning a list. This note records how it looks and why, so the components
built for MY-32 don't each invent their own version.

Theme is dark-only — `frontend/src/styles.css` is the whole palette, and it is
a byte-identical copy of `docs/design/styles.css`. Nothing here defines a
colour; everything consumes a token.

## Anatomy

```
┌─ Insights ──────────────────────────── one question at a time · Personal ─┐
│ ┌── Card ───────────────────────────────────┐  ┌── Card ───────────────┐ │
│ │ PLAN                                      │  │ Save this insight     │ │
│ │ (metric spend) (category all) (by cat…)   │  │ [name        ] [Save] │ │
│ │ (per —) (range this month) (currency PLN) │  └───────────────────────┘ │
│ │ spend · all categories · by category · …  │  ┌── Card ───────────────┐ │
│ │ [ Run ]                                   │  │ Saved  · pin/delete   │ │
│ └───────────────────────────────────────────┘  └───────────────────────┘ │
│ ┌── Card ──────────────────────── PLN ── (chart|table) ─┐  ┌── Card ───┐ │
│ │  ▇▇▇  ▇▇   ▇                                          │  │ Templates │ │
│ └───────────────────────────────────────────────────────┘  └───────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

Two columns, `3fr 2fr` with `gap: 24` — the same split the Subscriptions
screen already uses, so the app keeps one tool layout rather than two.

## Chips

A chip is a pill: `1px solid var(--color-divider)`, fully rounded, sitting on
`--color-neutral-100` so it reads as an input without looking like a text box.
Inside it, an uppercase 10px kicker in `--color-accent` names the axis and a
borderless `<select>` carries the value. The chip lights its border to
`--color-accent-500` on `:focus-within` — the only hover/focus affordance,
because six chips with six hover backgrounds would be noise.

The chips are **always visible and always editable**. There is no "edit plan"
mode: the plan *is* the chip row, and a one-line sentence under it
(`spend · all categories · by category · this month · PLN`) reads the same plan
back in prose so a user can check it at a glance. That readback is the
screen's signature move — it's what makes the chip row feel like an
instrument rather than a settings form: every edit changes the sentence, not
just the widget.

Order is fixed and reads left to right as the sentence does: metric, category,
group by, interval, range, currency.

## Result cards

One `<Card>` per currency entry in the envelope — never a mixed chart, per the
project-wide currency rule. The currency is the card's kicker; the
chart/table toggle is the existing `.seg` / `.seg-btn` segmented control on the
same line, right-aligned.

Charts are Recharts components styled entirely through props from tokens:
grid `var(--color-divider)`, axis line `var(--color-neutral-500)`, tick text
`var(--color-neutral-700)`, tooltip on `var(--color-surface)` with a
`--color-divider` border and `--radius-md`. Series colours come from the
category tree's own effective colour (so a chart matches the dots the user
already knows) and fall back to the eight-colour `PALETTE` in
`lib/categoryColor.ts`. No Recharts default colour is ever used.

Axis ticks are bare numbers; the currency is named once, on the card. Charts
are a fixed 280px tall — a `ResponsiveContainer` with no explicit height
inside a card renders as a 0px-tall blank.

## The four states

| State | What the user sees |
|---|---|
| Loading | The Run button reads "Running…" and is disabled; previously rendered cards stay on screen rather than blanking. |
| Empty | A valid plan over no rows is a result, not an error: `results: []` gets a muted sentence in a card ("No transactions match this plan…"), and an all-zero series still draws its chart with a muted note under it. |
| Rejected plan | The executor's `problems` list, rendered as a bulleted list inside the existing `.error-box`, under one line of instruction: "edit a chip and run again". The category chip keeps a dangling id visible as `unknown category #999` rather than silently snapping to "all categories". |
| Analytics down | One sentence in the `.error-box`: "The analytics service isn't running" — an operational state, deliberately worded so it doesn't read as a crash. |

## Template gallery

Whole-card buttons (`.ins-template`), styled after `.profile-card`: left
aligned, a name, a muted blurb, hover raising the border to
`--color-accent-500` with a 9% accent wash. Clicking one loads its plan into
the chips; it does not run automatically, because the point of the gallery is
to *teach the chip vocabulary* — the user should see what changed.

## Pinned tiles

On the dashboard, pinned insights render below the existing sections in a
two-column grid of cards: the insight name, its plan sentence in muted text,
and the chart. The section renders nothing at all when nothing is pinned, so
the dashboard of a user who never opens Insights is unchanged.
