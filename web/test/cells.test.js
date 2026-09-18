/**
 * @license
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
import { expect } from 'chai';
import { fixtureSync, nextFrame, nextRender } from '@vaadin/testing-helpers';
import { sendMouse } from '@web/test-runner-commands';

import '../src/code-field.js';

/**
 * Cell rendering (SPEC §7.9, §9). The cells are a *presentation* of one string
 * value, not separate fields — and they are the first visible output of the
 * selection engine, which has been running blind since `W-3`.
 *
 * `part="cell"` and its state attributes are public API: themes select on them,
 * so breaking them silently breaks every theme.
 */
describe('cells', () => {
  let field;

  const cells = () => [...field.shadowRoot.querySelectorAll('[part~="cell"]')];

  beforeEach(async () => {
    field = fixtureSync('<dc-code-field></dc-code-field>');
    await nextRender();
  });

  it('should render one cell per length', () => {
    expect(cells()).to.have.lengthOf(6);
  });

  it('should re-render when length changes', async () => {
    field.length = 4;
    await nextRender();
    expect(cells()).to.have.lengthOf(4);
  });

  it('should number the cells with cell-index', () => {
    expect(cells().map((cell) => cell.getAttribute('cell-index'))).to.eql(['0', '1', '2', '3', '4', '5']);
  });

  it('should show one character per cell', async () => {
    field.value = '1234';
    await nextRender();
    expect(cells().map((cell) => cell.textContent.trim())).to.eql(['1', '2', '3', '4', '', '']);
  });

  it('should mark filled cells', async () => {
    field.value = '123';
    await nextRender();
    expect(cells().map((cell) => cell.hasAttribute('filled'))).to.eql([true, true, true, false, false, false]);
  });

  it('should mark the active cell from the selection', async () => {
    field.value = '123456';
    field.focus();
    await nextFrame();
    await nextFrame();
    await nextRender();

    // Focus on a full field clamps to the last cell (§7.3).
    expect(cells().map((cell) => cell.hasAttribute('active'))).to.eql([false, false, false, false, false, true]);
  });

  it('should move the active cell as the selection moves', async () => {
    field.value = '123456';
    field.focus();
    field.querySelector('input').setSelectionRange(2, 3, 'forward');
    await nextFrame();
    await nextFrame();
    await nextRender();

    expect(cells().findIndex((cell) => cell.hasAttribute('active'))).to.equal(2);
  });

  it('should have no active cell when unfocused', async () => {
    field.value = '123456';
    await nextRender();
    expect(cells().some((cell) => cell.hasAttribute('active'))).to.be.false;
  });

  describe('click to position', () => {
    // §7.3: the caret is placed by *native hit testing*, not click handlers. The
    // decorative layer is pointer-events: none and the input sits over it, so the
    // browser resolves the position itself — which only works when each glyph
    // sits over its cell.
    const clickCell = async (index) => {
      const box = cells()[index].getBoundingClientRect();
      await sendMouse({
        type: 'click',
        position: [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)],
      });
      await nextFrame();
      await nextFrame();
      await nextRender();
    };

    beforeEach(async () => {
      field.value = '123456';
      await nextRender();
      // The observer publishes metrics a frame after layout settles.
      await nextFrame();
      await nextFrame();
    });

    for (const index of [0, 1, 2, 3, 4, 5]) {
      it(`should place the caret on cell ${index}`, async () => {
        await clickCell(index);
        expect(field._activeCell, `clicking cell ${index} activated ${field._activeCell}`).to.equal(index);
      });
    }
  });
});
