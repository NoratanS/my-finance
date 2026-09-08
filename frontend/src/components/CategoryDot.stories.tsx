import type { Meta, StoryObj } from '@storybook/react-vite';
import { CategoryDot } from './CategoryDot';
import { FALLBACK_COLOR } from '../lib/categoryColor';

const meta: Meta<typeof CategoryDot> = {
  component: CategoryDot,
  title: 'Primitives/CategoryDot',
};

export default meta;
type Story = StoryObj<typeof meta>;

/** A category with its own color, from the Add-category palette. */
export const OwnColor: Story = {
  args: { color: '#a4d9c6' },
};

/**
 * No color of its own: lib/categoryColor.ts effectiveColor() walks up to the
 * nearest ancestor's color, falling all the way back to the accent token
 * when nothing in the chain has one — this is that fallback.
 */
export const Inherited: Story = {
  args: { color: FALLBACK_COLOR },
};
