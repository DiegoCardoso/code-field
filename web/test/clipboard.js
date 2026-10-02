/**
 * @license
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
import { fixtureSync } from '@vaadin/testing-helpers';
import { sendKeys } from '@web/test-runner-commands';

/** CI runs on Linux and development on macOS; the clipboard shortcuts differ. */
export const MOD = /Mac|iPhone|iPad/u.test(navigator.platform) ? 'Meta' : 'Control';

/**
 * Puts `text` on the real clipboard, for a real paste. Not a synthetic
 * ClipboardEvent: Firefox ignores `clipboardData` passed to its constructor, so
 * a synthetic event tests nothing there — and a trusted event is what the
 * component actually has to handle.
 *
 * Copies from a scratch input rather than the field, because focusing the field
 * re-runs focus placement (§7.3) and would overwrite any selection a test set
 * up.
 */
export const copy = async (text) => {
  const scratch = fixtureSync('<input>');
  scratch.focus();
  await sendKeys({ type: text });
  await sendKeys({ press: `${MOD}+a` });
  await sendKeys({ press: `${MOD}+c` });
  scratch.remove();
};
