import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CategoryNode } from '../../api/types';
import { CategoryChip } from './CategoryChip';

const CATEGORIES: CategoryNode[] = [
  {
    id: 1,
    name: 'Groceries',
    parentId: null,
    color: '#a4d9c6',
    depth: 0,
    children: [
      { id: 2, name: 'Supermarket', parentId: 1, color: null, depth: 1, children: [] },
      { id: 3, name: 'Farmers market', parentId: 1, color: null, depth: 1, children: [] },
    ],
  },
  {
    id: 4,
    name: 'Transport',
    parentId: null,
    color: '#a8cdec',
    depth: 0,
    children: [],
  },
];

const meta: Meta<typeof CategoryChip> = {
  component: CategoryChip,
  title: 'Insights/Chips/CategoryChip',
  args: { categories: CATEGORIES },
};

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled({ initial }: { initial: number | undefined }) {
  const [value, setValue] = useState<number | undefined>(initial);
  return <CategoryChip categories={CATEGORIES} value={value} onChange={setValue} />;
}

export const AllCategories: Story = {
  render: () => <Controlled initial={undefined} />,
};

export const SelectedLeaf: Story = {
  render: () => <Controlled initial={2} />,
};

/**
 * A saved plan can carry a category that has since been deleted. The chip
 * shows it as "unknown category #999" instead of silently snapping to "all
 * categories" behind the user's back.
 */
export const DanglingCategory: Story = {
  render: () => <Controlled initial={999} />,
};
