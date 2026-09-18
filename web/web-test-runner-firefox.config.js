import { playwrightLauncher } from '@web/test-runner-playwright';
import baseConfig from './web-test-runner.config.js';

/**
 * Firefox covers `W-3`'s backward-selection case (SPEC §7.8.1), which Chromium
 * cannot exercise. Split into its own config exactly as the monorepo does.
 */
export default {
  ...baseConfig,
  browsers: [playwrightLauncher({ product: 'firefox', headless: true })],
};
