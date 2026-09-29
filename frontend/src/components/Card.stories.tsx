import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from './Card';

const meta: Meta<typeof Card> = {
  component: Card,
  title: 'Primitives/Card',
};

export default meta;
type Story = StoryObj<typeof meta>;

/** The common case: a card wrapping some content. */
export const WithContent: Story = {
  args: {
    children: (
      <div style={{ padding: 18 }}>
        <div className="kicker">this month</div>
        <div className="kpi-value">$1,284.50</div>
      </div>
    ),
  },
};

/** An empty card — the .blueprint surface and corner markers on their own. */
export const Empty: Story = {
  args: {
    children: null,
    style: { minHeight: 80 },
  },
};
