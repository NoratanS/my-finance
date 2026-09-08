import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Interval } from '../../api/types';
import { IntervalChip } from './IntervalChip';

const meta: Meta<typeof IntervalChip> = {
  component: IntervalChip,
  title: 'Insights/Chips/IntervalChip',
};

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled({ initial }: { initial: Interval | null }) {
  const [value, setValue] = useState<Interval | null>(initial);
  return <IntervalChip value={value} onChange={setValue} />;
}

export const OneTotal: Story = {
  render: () => <Controlled initial={null} />,
};

export const Monthly: Story = {
  render: () => <Controlled initial="month" />,
};

/** A hand-edited ?plan= can carry an interval this chip doesn't offer. */
export const UnknownInterval: Story = {
  render: () => <Controlled initial={'fortnight' as Interval} />,
};
