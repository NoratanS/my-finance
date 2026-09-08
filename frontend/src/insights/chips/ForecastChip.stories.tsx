import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Plan } from '../../api/types';
import { ForecastChip } from './ForecastChip';

const BASE_PLAN: Plan = {
  version: 1,
  metric: 'spend',
  filters: { includeDescendants: true, currency: 'USD' },
  groupBy: 'category',
  interval: 'month',
  range: { type: 'lastMonths', n: 6 },
};

const meta: Meta<typeof ForecastChip> = {
  component: ForecastChip,
  title: 'Insights/Chips/ForecastChip',
};

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled({ initial }: { initial: Plan }) {
  const [plan, setPlan] = useState<Plan>(initial);
  return <ForecastChip plan={plan} onChange={setPlan} />;
}

export const Off: Story = {
  render: () => <Controlled initial={BASE_PLAN} />,
};

export const ThreeMonthForecast: Story = {
  render: () => <Controlled initial={{ ...BASE_PLAN, forecast: { months: 3 }, version: 2 }} />,
};

/**
 * The executor only accepts a forecast on a monthly interval — the chip
 * disables itself rather than letting the user assemble a plan the analytics
 * service would reject.
 */
export const DisabledOnNonMonthlyInterval: Story = {
  render: () => <Controlled initial={{ ...BASE_PLAN, interval: 'week' }} />,
};
