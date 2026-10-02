import { playwrightLauncher } from '@web/test-runner-playwright';
import { visualRegressionPlugin } from '@web/test-runner-visual-regression/plugin';
import baseConfig from './web-test-runner.config.js';

/**
 * Visual tests (SPEC §14.2). Run only inside the pinned Playwright container, through
 * scripts/visual.sh or CI's `visual` job: baselines from any other renderer differ in fonts
 * and antialiasing, and would fail everywhere else. Mirrors vaadin/web-components'
 * createVisualTestsConfig: Chromium only, a fixed viewport, the same diff thresholds.
 */
const viewport = { width: 1024, height: 768 };

export default {
  ...baseConfig,
  files: ['test/visual/*.test.js'],
  browsers: [
    playwrightLauncher({
      // The container's bundled Chromium, not branded Chrome: the image ships Playwright's
      // own build, and that is what the baselines are pinned to.
      product: 'chromium',
      launchOptions: { headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] },
      // @web/test-runner-playwright resets every page to 800x600 before each test file
      // loads, overwriting a size set here; the monorepo overrides the setter the same way.
      async createPage({ context }) {
        const page = await context.newPage();
        const setViewportSize = page.setViewportSize.bind(page);
        page.setViewportSize = () => setViewportSize(viewport);
        return page;
      },
    }),
  ],
  plugins: [
    ...baseConfig.plugins,
    visualRegressionPlugin({
      baseDir: 'test/visual/screenshots',
      diffOptions: { threshold: 0.2 },
      failureThreshold: 0.05,
      failureThresholdType: 'percent',
      update: process.env.TEST_ENV === 'update',
    }),
  ],
};
