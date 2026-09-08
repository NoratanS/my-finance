import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Plan } from '../../api/types';
import { MerchantChip } from './MerchantChip';

const BASE_PLAN: Plan = {
  version: 1,
  metric: 'spend',
  filters: { includeDescendants: true, currency: 'USD' },
  groupBy: 'category',
  interval: null,
  range: { type: 'lastMonths', n: 1 },
};

const meta: Meta<typeof MerchantChip> = {
  component: MerchantChip,
  title: 'Insights/Chips/MerchantChip',
};

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled({ initial }: { initial: Plan }) {
  const [plan, setPlan] = useState<Plan>(initial);
  return <MerchantChip plan={plan} onChange={setPlan} />;
}

/** No merchant filter — the free-text input starts empty. */
export const Empty: Story = {
  render: () => <Controlled initial={BASE_PLAN} />,
};

/** A comma-separated merchant list already applied, as after typing and blurring. */
export const Filtered: Story = {
  render: () => (
    <Controlled
      initial={{ ...BASE_PLAN, filters: { ...BASE_PLAN.filters, merchants: ['Lidl', 'Biedronka'] } }}
    />
  ),
};
