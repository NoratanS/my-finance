import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { CurrencyChip } from './CurrencyChip';

const meta: Meta<typeof CurrencyChip> = {
  component: CurrencyChip,
  title: 'Insights/Chips/CurrencyChip',
  args: { defaultCurrency: 'USD' },
};

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled({ initial }: { initial: string | undefined }) {
  const [value, setValue] = useState<string | undefined>(initial);
  return <CurrencyChip defaultCurrency="USD" value={value} onChange={setValue} />;
}

export const DefaultCurrency: Story = {
  render: () => <Controlled initial="USD" />,
};

/** Cleared: one chart per currency present, instead of a meaningless mixed total. */
export const EveryCurrency: Story = {
  render: () => <Controlled initial={undefined} />,
};

/** A saved plan carried a currency other than the profile's default. */
export const OtherCurrency: Story = {
  render: () => <Controlled initial="EUR" />,
};
