/**
 * @license
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
import { fixtureSync, nextRender } from '@vaadin/testing-helpers';
import { emulateMedia } from '@web/test-runner-commands';
import { visualDiff } from '@web/test-runner-visual-regression';
import '../../src/code-field.js';

/** Loads a theme stylesheet into the test page. */
async function loadTheme(href) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  const loaded = new Promise((resolve) => {
    link.onload = resolve;
  });
  document.head.appendChild(link);
  await loaded;
}

/**
 * SPEC §14.2: one baseline per state, per theme, per colour scheme, plus the `small` subset.
 * Generated and compared inside the pinned Playwright container only (scripts/visual.sh) —
 * a host renderer's fonts and antialiasing differ, which is why the baselines would rot.
 *
 * Every shot is taken with prefers-reduced-motion, which stops the caret blinking, so a
 * focused shot is stable. That also covers §14.2's prefers-reduced-motion row.
 */
export function describeVisual(theme, { href, setDark }) {
  describe(theme, () => {
    before(async () => {
      if (href) {
        await loadTheme(href);
      }
      await emulateMedia({ reducedMotion: 'reduce' });
    });

    for (const scheme of ['light', 'dark']) {
      describe(scheme, () => {
        let wrapper, field;

        before(() => setDark(scheme === 'dark'));
        after(() => setDark(false));

        beforeEach(async () => {
          // The wrapper takes the theme's own background, so a dark shot is dark.
          wrapper = fixtureSync(`
            <div style="display: inline-block; padding: 10px; background: var(--vaadin-background-color, Canvas)">
              <dc-code-field label="Verification code" helper-text="Enter the 6-digit code"></dc-code-field>
            </div>`);
          field = wrapper.firstElementChild;
          await nextRender();
        });

        const shot = async (name) => {
          await nextRender();
          await visualDiff(wrapper, `${theme}-${scheme}-${name}`);
        };

        const states = {
          empty: () => {},
          partial: () => {
            field.value = '12';
          },
          full: () => {
            field.value = '123456';
          },
          'focused-empty': () => field.focus(),
          'focused-mid': () => {
            field.value = '123';
            field.focus();
          },
          'focused-full': () => {
            field.value = '123456';
            field.focus();
          },
          invalid: () => {
            field.value = '12';
            field.errorMessage = 'The code is too short';
            field.invalid = true;
          },
          disabled: () => {
            field.value = '12';
            field.disabled = true;
          },
          readonly: () => {
            field.value = '12';
            field.readonly = true;
          },
          // Beyond §14.2's list: each pins a scoped rule (§9.1.3) — Lumo's error-colour
          // ring, and the dashed ring a focused read-only field puts on every cell.
          'focused-invalid': () => {
            field.value = '12';
            field.errorMessage = 'The code is too short';
            field.invalid = true;
            field.focus();
          },
          'focused-readonly': () => {
            field.value = '12';
            field.readonly = true;
            field.focus();
          },
          'rtl-chrome': () => {
            field.setAttribute('dir', 'rtl');
            field.value = '12';
            field.required = true;
            field.errorMessage = 'The code is too short';
            field.invalid = true;
          },
        };

        for (const [name, apply] of Object.entries(states)) {
          it(name, async () => {
            apply();
            await shot(name);
          });
        }

        // §14.2 / P0-6: `small` on the subset that brackets what the variant changes. With
        // no theme, `small` changes nothing — as for <vaadin-text-field> — so base's small
        // shots are identical to its plain ones, deliberately.
        for (const name of ['empty', 'focused-mid', 'full', 'invalid']) {
          it(`small-${name}`, async () => {
            field.setAttribute('theme', 'small');
            states[name]();
            await shot(`small-${name}`);
          });
        }
      });
    }
  });
}
