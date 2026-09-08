import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PlanRange } from '../../api/types';
import { RangeChip } from './RangeChip';

const meta: Meta<typeof RangeChip> = {
  component: RangeChip,
  title: 'Insights/Chips/RangeChip',
};

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled({ initial }: { initial: PlanRange }) {
  const [value, setValue] = useState<PlanRange>(initial);
  return <RangeChip value={value} onChange={setValue} />;
}

export const ThisMonth: Story = {
  render: () => <Controlled initial={{ type: 'lastMonths', n: 1 }} />,
};

export const Last6Months: Story = {
  render: () => <Controlled initial={{ type: 'lastMonths', n: 6 }} />,
};

export const AllTime: Story = {
  render: () => <Controlled initial={{ type: 'all' }} />,
};

/**
 * `absolute` ranges are URL- and template-only in v1 (RANGE_OPTIONS never
 * offers one) — the chip still has to show it rather than rewrite the plan
 * out from under a saved link.
 */
export const AbsoluteRange: Story = {
  render: () => <Controlled initial={{ type: 'absolute', from: '2026-01-01', to: '2026-03-31' }} />,
};
