import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProgressBar } from './ProgressBar';

// Same accent used for a normal bar, and the same over-budget rose that
// Budgets.tsx and Dashboard.tsx swap in once spend clears the budget
// (screens/Budgets.tsx OVER_COLOR) — the color itself isn't ProgressBar's
// decision, but the catalogue should show why a caller would pass it.
const NORMAL_COLOR = 'var(--color-accent)';
const OVER_COLOR = '#eeaabc';

const meta: Meta<typeof ProgressBar> = {
  component: ProgressBar,
  title: 'Primitives/ProgressBar',
  args: {
    color: NORMAL_COLOR,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 240 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { percent: 0 },
};

export const HalfFull: Story = {
  args: { percent: 50 },
};

export const Full: Story = {
  args: { percent: 100 },
};

/** Over budget: a different color, per the caller's own over/under check — the fill still clamps at 100%. */
export const OverBudget: Story = {
  args: { percent: 140, color: OVER_COLOR },
};

export const Large: Story = {
  args: { percent: 65, large: true },
};
