import type { StorybookConfig } from '@storybook/react-vite';

// No viteFinal here on purpose: @storybook/react-vite auto-loads this
// project's own vite.config.ts (plugins, resolve, etc.) and merges it with
// its own Vite config, so the react() plugin and everything else in
// vite.config.ts is reused rather than duplicated here.
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
};

export default config;
