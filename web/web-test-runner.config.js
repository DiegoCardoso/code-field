import { playwrightLauncher } from '@web/test-runner-playwright';

/**
 * Unit tests. Mirrors `vaadin/web-components`' launcher configuration so the
 * suite runs unmodified if this component is ever upstreamed (`W-1.4`).
 */
export default {
  nodeResolve: true,
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
