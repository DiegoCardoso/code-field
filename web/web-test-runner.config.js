import { playwrightLauncher } from '@web/test-runner-playwright';

/**
 * Unit tests. Mirrors `vaadin/web-components`' launcher configuration so the
 * suite runs unmodified if this component is ever upstreamed (`W-1.4`).
 */
export default {
  nodeResolve: true,
  // A wedged suite should fail fast. The default 120s turns "something never
  // settles" into a two-minute wait locally and in CI, which is long enough
  // that the real signal gets lost. Found while diagnosing a tooltip that never
  // settled: the loop was unusable until this was lowered.
  testsFinishTimeout: 20000,
  files: ['test/**/*.test.js'],
  browsers: [
    playwrightLauncher({
      product: 'chromium',
      launchOptions: {
        channel: 'chrome',
        headless: true,
        ignoreDefaultArgs: ['--hide-scrollbars'],
      },
    }),
  ],
};
