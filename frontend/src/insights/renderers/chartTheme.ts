// Recharts styling, driven entirely by the design tokens: SVG accepts
// `var(--…)` in stroke and fill, so the tokens go straight through as props and
// docs/design/styles.css stays authoritative (spec D8).

import type { CategoryNode } from '../../api/types';
import { PALETTE, effectiveColor } from '../../lib/categoryColor';

/**
 * Explicit, because a ResponsiveContainer with no height inside a card with no
 * intrinsic height renders a 0px-tall blank chart.
 */
export const CHART_HEIGHT = 280;

export const AXIS_PROPS = {
  stroke: 'var(--color-neutral-500)',
  tick: { fill: 'var(--color-neutral-700)', fontSize: 11 },
  tickLine: false,
};

export const GRID_PROPS = {
  stroke: 'var(--color-divider)',
  strokeDasharray: '3 3',
  vertical: false,
};

export const TOOLTIP_PROPS = {
  contentStyle: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)',
    borderRadius: 12,
    fontSize: 12,
  },
  labelStyle: { color: 'var(--color-text)' },
  cursor: { fill: 'color-mix(in srgb, var(--color-text) 8%, transparent)' },
};

const axisNumber = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });

/** Axis ticks stay bare numbers — the currency is named once, on the card. */
export function formatTick(value: number): string {
  return axisNumber.format(value);
}

/**
 * Series colours: category groups reuse the tree's effective colour, so a chart
 * matches the dots the user already sees elsewhere; anything else cycles the
 * design palette. Never Recharts' own defaults.
 */
export function seriesColors(byId: Map<number, CategoryNode>, groupBy: string | null) {
  return (key: string, index: number): string => {
    if (groupBy === 'category') {
      const id = Number(key);
      if (Number.isInteger(id) && byId.has(id)) return effectiveColor(byId, id);
    }
    return PALETTE[index % PALETTE.length][1];
  };
}
