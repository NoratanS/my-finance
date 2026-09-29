import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Metric } from '../../api/types';
import { MetricChip } from './MetricChip';

const meta: Meta<typeof MetricChip> = {
  component: MetricChip,
  title: 'Insights/Chips/MetricChip',
};

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled({ initial }: { initial: Metric }) {
  const [value, setValue] = useState<Metric>(initial);
  return <MetricChip value={value} onChange={setValue} />;
}

export const Spend: Story = {
  render: () => <Controlled initial="spend" />,
};

export const Income: Story = {
  render: () => <Controlled initial="income" />,
};

/**
 * A hand-edited ?plan= can carry a metric this chip doesn't offer
 * (planFromSearch only checks that it's a string) — the chip keeps it
 * visible instead of rendering a blank select.
 */
export const UnknownMetric: Story = {
  render: () => <Controlled initial={'average' as Metric} />,
};
