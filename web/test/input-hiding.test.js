/**
 * @license
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
import { expect } from 'chai';
import { fixtureSync, nextRender } from '@vaadin/testing-helpers';
import '../src/code-field.js';

/**
 * Hiding the real input's text (SPEC §11.1, §11.12). The cells render the
 * characters; the input must hold them without showing them, or every code is
 * drawn twice, offset.
 */
describe('hiding the input text', () => {
  let field, input;

  beforeEach(async () => {
    field = fixtureSync('<dc-code-field></dc-code-field>');
    await nextRender();
    field.value = '123456';
    input = field.querySelector('input');
    await nextRender();
  });

  const transparent = (value) => /^rgba\(0, 0, 0, 0\)$|^transparent$/u.test(value);

  it('should render the text transparently', () => {
    expect(transparent(getComputedStyle(input).color), 'color').to.be.true;
  });

  it('should set -webkit-text-fill-color as well as color', () => {
    // §11.12: -webkit-text-fill-color outranks `color` and is what `:autofill`
    // uses (§11.3). Omitting it means autofill reveals the text.
    expect(transparent(getComputedStyle(input).webkitTextFillColor), 'webkitTextFillColor').to.be.true;
  });

  it('should hide the native caret', () => {
    // The synthetic caret is rendered in the active cell instead (§9).
    expect(transparent(getComputedStyle(input).caretColor), 'caretColor').to.be.true;
  });

  it('should keep the background transparent so the cells show through', () => {
    expect(transparent(getComputedStyle(input).backgroundColor), 'backgroundColor').to.be.true;
  });

  it('should NOT use opacity to hide the input', () => {
    // §11.1: iOS suppresses the editing menu for inputs it considers
    // non-visible, which kills long-press -> Paste. This is the one property
    // that must stay untouched.
    expect(getComputedStyle(input).opacity).to.equal('1');
  });

  it('should survive a page-wide input rule', async () => {
    // §11.12: the input is light DOM, so `input { color: ... }` on the page
    // reaches it. Without !important the real code renders under the cells,
    // doubled and offset. §14.1 requires this test by name.
    const style = document.createElement('style');
    style.textContent = 'input { color: red !important; -webkit-text-fill-color: red !important; }';
    document.head.appendChild(style);
    await nextRender();

    const computed = getComputedStyle(input);
    style.remove();

    expect(transparent(computed.color), 'page CSS overrode color').to.be.true;
    expect(transparent(computed.webkitTextFillColor), 'page CSS overrode -webkit-text-fill-color').to.be.true;
  });

  describe('the native selection band', () => {
    // §11.2 needs *two* declarations: transparent text alone still leaves the
    // browser painting its highlight behind the selected character, which shows
    // through the cell as a coloured band.
    //
    // It cannot live in the shadow stylesheet: `::slotted(input)::selection` is
    // not a valid selector and is dropped silently. Vaadin hits the same wall
    // with ::placeholder and solves it with SlotStylesMixin, which injects rules
    // into the light-DOM scope where `input::selection` works normally.
    const injectedRules = () =>
      [...document.querySelectorAll('style')]
        .map((style) => style.textContent)
        .filter((text) => text.includes('dc-code-field'))
        .join('\n');

    it('should inject a ::selection rule into the light-DOM scope', () => {
      expect(injectedRules()).to.contain('::selection');
    });

    it('should make both the band and the selected text transparent', () => {
      const rules = injectedRules();
      const selection = rules.slice(rules.indexOf('::selection'));
      expect(selection, 'background').to.contain('background');
      expect(selection, 'color').to.contain('color');
    });

    it('should keep the base autofill overrides', () => {
      // §11.3 rides on the same mechanism, and the base provides it — so
      // overriding slotStyles without calling super would silently drop it.
      expect(injectedRules()).to.contain(':autofill');
    });
  });
});
