/**
 * @license
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
import { expect } from 'chai';
import { fixtureSync, nextRender } from '@vaadin/testing-helpers';
import { sendKeys } from '@web/test-runner-commands';

/**
 * Proves the test harness can drive *real* input before any behaviour depends on
 * it. Synthetic KeyboardEvents do not move a caret, so a selection suite built on
 * them would pass while testing nothing.
 */
describe('tooling: real key input', () => {
  it('should move the caret with a real arrow key', async () => {
    const input = fixtureSync('<input value="123456">');
    await nextRender();
    input.focus();
    input.setSelectionRange(6, 6, 'none');

    await sendKeys({ press: 'ArrowLeft' });

    expect(input.selectionStart, 'the browser did not act on the key').to.equal(5);
  });
});
