import { sendKeysPlugin, sendMousePlugin } from '@web/test-runner-commands/plugins';
import { playwrightLauncher } from '@web/test-runner-playwright';

/**
 * Unit tests. Mirrors `vaadin/web-components`' launcher configuration so the
 * suite runs unmodified if this component is ever upstreamed (`W-1.4`).
 */
export default {
  nodeResolve: true,
  // The repo root, not web/: node_modules is hoisted there, and the theme tests link
  // Lumo's and Aura's stylesheets by URL (W-8). Bare-specifier imports are unaffected.
  rootDir: '..',
  // A wedged suite should fail fast. The default 120s turns "something never
  // settles" into a two-minute wait locally and in CI, which is long enough
  // that the real signal gets lost. Found while diagnosing a tooltip that never
  // settled: the loop was unusable until this was lowered.
  testsFinishTimeout: 20000,
  // Visual tests run only in the pinned container (web-test-runner-visual.config.js).
  files: ['test/**/*.test.js', '!test/visual/**'],
  // One test file at a time. The paste tests use the real OS clipboard (a
  // synthetic ClipboardEvent tests nothing in Firefox), and the clipboard is
  // shared by every page the runner has open — with two files pasting at once,
  // one copies while the other pastes and either can read the other's text.
  // Measured: 1 in 3 Firefox runs failed concurrently, 0 in 5 serially.
  concurrency: 1,
  // Real key and pointer input through CDP. Synthetic KeyboardEvents do not move
  // a caret — the browser ignores untrusted events for selection — so without
  // these the selection tests in §7.8.1 would assert nothing (W-3).
  plugins: [sendKeysPlugin(), sendMousePlugin()],
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
