import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { GroupBy } from '../../api/types';
import { GroupByChip } from './GroupByChip';

const meta: Meta<typeof GroupByChip> = {
  component: GroupByChip,
  title: 'Insights/Chips/GroupByChip',
};

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled({ initial }: { initial: GroupBy | null }) {
  const [value, setValue] = useState<GroupBy | null>(initial);
  return <GroupByChip value={value} onChange={setValue} />;
}

export const Nothing: Story = {
  render: () => <Controlled initial={null} />,
};

export const ByCategory: Story = {
  render: () => <Controlled initial="category" />,
};

export const ByMerchant: Story = {
  render: () => <Controlled initial="merchant" />,
};

/** A saved plan or hand-edited URL can carry a groupBy this chip doesn't offer. */
export const UnknownGroupBy: Story = {
  render: () => <Controlled initial={'account' as GroupBy} />,
};
