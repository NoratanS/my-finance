import type { Preview } from '@storybook/react-vite';

// Same two stylesheets main.tsx loads, in the same order: styles.css carries
// the design tokens (colors, spacing, the .blueprint/.bar-track/.ins-chip
// component classes) and app.css layers the small app-specific bits on top
// (.dot sizing, hover states). Without both, the primitives below render
// unstyled. styles.css itself is never edited — it's the design-system file.
import '../src/styles.css';
import '../src/app.css';

const preview: Preview = {};

export default preview;
