import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CategoryNode, Plan } from '../../api/types';
import { defaultPlan } from '../planDefaults';
import { ChipBar } from './ChipBar';

const CATEGORIES: CategoryNode[] = [
  {
    id: 1,
    name: 'Groceries',
    parentId: null,
    color: '#a4d9c6',
    depth: 0,
    children: [{ id: 2, name: 'Supermarket', parentId: 1, color: null, depth: 1, children: [] }],
  },
  { id: 4, name: 'Transport', parentId: null, color: '#a8cdec', depth: 0, children: [] },
];

const meta: Meta<typeof ChipBar> = {
  component: ChipBar,
  title: 'Insights/Chips/ChipBar',
  args: { categories: CATEGORIES, defaultCurrency: 'USD' },
};

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled({ initial }: { initial: Plan }) {
  const [plan, setPlan] = useState<Plan>(initial);
  return <ChipBar plan={plan} categories={CATEGORIES} defaultCurrency="USD" onChange={setPlan} />;
}

/** The row a fresh explore starts on: spend, all categories, grouped by category, this month. */
export const Default: Story = {
  render: () => <Controlled initial={defaultPlan('USD')} />,
};

/** Every chip carrying a non-default value at once, wired together as one plan. */
export const FullyConfigured: Story = {
  render: () => (
    <Controlled
      initial={{
        version: 2,
        metric: 'income',
        filters: { includeDescendants: true, currency: 'EUR', categoryId: 1, merchants: ['Lidl'] },
        groupBy: 'merchant',
        interval: 'month',
        range: { type: 'lastMonths', n: 6 },
        forecast: { months: 3 },
      }}
    />
  ),
};
