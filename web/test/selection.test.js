/**
 * @license
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
import { expect } from 'chai';
import { fixtureSync, nextFrame, nextRender } from '@vaadin/testing-helpers';
import { sendKeys } from '@web/test-runner-commands';
import '../src/code-field.js';

/**
 * The selection engine (SPEC §7.3, §7.8.1). The active cell is *derived* from the
 * input's selection, so the selection is the seam: these assert where the caret
 * actually is, not what any internal field thinks.
 */
describe('selection engine', () => {
  let field, input;

  const setUp = async (value = '') => {
    field = fixtureSync('<dc-code-field></dc-code-field>');
    await nextRender();
    field.value = value;
    input = field.querySelector('input');
    await nextRender();
  };

  const selection = () => [input.selectionStart, input.selectionEnd];

  // CI runs on Linux, development happens on macOS, and the cut shortcut differs.
  // Hard-coding either one passes locally and fails in CI, or the reverse.
  const SELECT_ALL = /Mac|iPhone|iPad/u.test(navigator.platform) ? 'Meta+a' : 'Control+a';
  const CUT = /Mac|iPhone|iPad/u.test(navigator.platform) ? 'Meta+x' : 'Control+x';

  describe('focus placement', () => {
    it('should put the caret at index 0 when empty', async () => {
      await setUp('');
      field.focus();
      await nextRender();

      expect(selection()).to.eql([0, 0]);
    });

    it('should put the caret at the append position when partially filled', async () => {
      // §7.3: a collapsed caret after the last character, so the next keystroke
      // appends rather than overwriting.
      await setUp('123');
      field.focus();
      await nextRender();

      expect(selection()).to.eql([3, 3]);
    });

    it('should clamp to the last cell when full', async () => {
      // §7.3: otherwise the caret sits one past the last cell and nothing is
      // highlighted — the field looks unfocused while focused.
      await setUp('123456');
      field.focus();
      await nextRender();

      expect(selection()).to.eql([5, 6]);
    });
  });

  describe('widening a collapsed caret', () => {
    // `selectionchange` is asynchronous, so every assertion has to wait for it
    // rather than read the selection straight after setting it.
    const settle = async () => {
      await nextFrame();
      await nextFrame();
    };

    it('should widen a collapsed caret into a one-character range', async () => {
      // §7.8.1.1: a collapsed caret sits *between* characters and cannot
      // identify a cell, so it is widened to cover one.
      await setUp('123456');
      field.focus();
      input.setSelectionRange(2, 2, 'none');
      await settle();

      expect(selection()).to.eql([2, 3]);
    });

    it('should leave a collapsed caret at the append position alone', async () => {
      // §7.8.1.2: the one place a collapsed caret is meaningful. Widening here
      // turns the next keystroke into an overwrite instead of an append.
      await setUp('123');
      field.focus();
      input.setSelectionRange(3, 3, 'none');
      await settle();

      expect(selection()).to.eql([3, 3]);
    });

    it('should still widen a collapsed caret mid-value when partially filled', async () => {
      // The exception is the append position specifically, not "any collapsed
      // caret in a partial value".
      await setUp('123');
      field.focus();
      input.setSelectionRange(1, 1, 'none');
      await settle();

      expect(selection()).to.eql([1, 2]);
    });

    it('should not widen at the end of a full value', async () => {
      // A full value has no append position: index 6 of 6 is past the last cell,
      // so focus placement clamps it rather than leaving it collapsed.
      await setUp('123456');
      field.focus();
      input.setSelectionRange(6, 6, 'none');
      await settle();

      expect(selection()).to.eql([5, 6]);
    });
  });

  describe('arrow navigation', () => {
    const settle = async () => {
      await nextFrame();
      await nextFrame();
    };

    it('should move back one cell on ArrowLeft', async () => {
      // §7.8.1.3: the naive implementation appears to skip a cell — ArrowLeft
      // collapses the range to its start, and re-widening forward lands on the
      // same cell it started on.
      await setUp('123456');
      field.focus();
      await settle();
      expect(selection(), 'precondition: clamped to the last cell').to.eql([5, 6]);

      await sendKeys({ press: 'ArrowLeft' });
      await settle();

      expect(selection()).to.eql([4, 5]);
    });

    it('should move forward one cell on ArrowRight', async () => {
      await setUp('123456');
      field.focus();
      input.setSelectionRange(2, 3, 'forward');
      await settle();

      await sendKeys({ press: 'ArrowRight' });
      await settle();

      expect(selection()).to.eql([3, 4]);
    });

    it('should stop at the first cell', async () => {
      await setUp('123456');
      field.focus();
      input.setSelectionRange(0, 1, 'forward');
      await settle();

      await sendKeys({ press: 'ArrowLeft' });
      await settle();

      expect(selection()).to.eql([0, 1]);
    });
  });

  describe('selection after deletion', () => {
    const settle = async () => {
      await nextFrame();
      await nextFrame();
    };

    it('should re-widen the caret after a deletion', async () => {
      // §7.8.1.4 claimed no browser fires `selectionchange` on deletion and that
      // a manual dispatch was needed. Both Chromium and Firefox do fire it, so
      // none is implemented — but the re-widening still has to happen, and
      // removing the listener makes this test fail, which is what pins it.
      await setUp('123456');
      field.focus();
      input.setSelectionRange(2, 3, 'forward');
      await settle();

      await sendKeys({ press: 'Backspace' });
      await settle();

      expect(input.value).to.equal('12456');
      expect(selection()).to.eql([2, 3]);
    });

    it('should re-widen the caret after a deletion at the end', async () => {
      await setUp('123456');
      field.focus();
      await settle();
      expect(selection(), 'precondition: clamped to the last cell').to.eql([5, 6]);

      await sendKeys({ press: 'Backspace' });
      await settle();

      expect(input.value).to.equal('12345');
      // Now partially filled, so the caret belongs at the append position.
      expect(selection()).to.eql([5, 5]);
    });

    it('should re-widen the caret after a cut', async () => {
      // The other half of §7.8.1.4's claim. Deletion turned out to fire
      // `selectionchange` in both browsers; cut is tested separately because the
      // spec lumps them together and they need not behave the same.
      await setUp('123456');
      field.focus();
      input.setSelectionRange(2, 3, 'forward');
      await settle();

      await sendKeys({ press: CUT });
      await settle();

      expect(input.value, 'cut did not reach the input').to.equal('12456');
      expect(selection()).to.eql([2, 3]);
    });
  });

  describe('Home and End', () => {
    const settle = async () => {
      await nextFrame();
      await nextFrame();
    };

    it('should jump to the first cell on Home', async () => {
      await setUp('123456');
      field.focus();
      await settle();

      await sendKeys({ press: 'Home' });
      await settle();

      expect(selection()).to.eql([0, 1]);
    });

    it('should jump to the last cell on End when full', async () => {
      await setUp('123456');
      field.focus();
      input.setSelectionRange(0, 1, 'forward');
      await settle();

      await sendKeys({ press: 'End' });
      await settle();

      expect(selection()).to.eql([5, 6]);
    });

    it('should jump to the append position on End when partially filled', async () => {
      // "Last" in a partial code is the place the next character goes, not the
      // last filled cell — consistent with focus placement (§7.3).
      await setUp('123');
      field.focus();
      input.setSelectionRange(0, 1, 'forward');
      await settle();

      await sendKeys({ press: 'End' });
      await settle();

      expect(selection()).to.eql([3, 3]);
    });
  });

  describe('Shift+Arrow', () => {
    const settle = async () => {
      await nextFrame();
      await nextFrame();
    };

    it('should extend a native selection rather than being re-widened', async () => {
      // §7.3: Shift+Arrow is native range selection. The widening in §7.8.1 acts
      // only on collapsed carets, so it must leave a real range alone — if it
      // did not, range selection would be impossible in this field.
      await setUp('123456');
      field.focus();
      input.setSelectionRange(2, 3, 'forward');
      await settle();

      await sendKeys({ press: 'Shift+ArrowRight' });
      await settle();

      expect(selection()).to.eql([2, 4]);
    });

    it('should support select-all', async () => {
      await setUp('123456');
      field.focus();
      await settle();

      await sendKeys({ press: SELECT_ALL });
      await settle();

      expect(selection()).to.eql([0, 6]);
    });
  });

  describe('readonly and disabled', () => {
    const settle = async () => {
      await nextFrame();
      await nextFrame();
    };

    it('should not widen the caret when readonly', async () => {
      // §7.8.5: readonly keeps one tab stop and native selection, but renders no
      // active cell — nothing can be typed, so highlighting a target is a lie.
      await setUp('123456');
      field.readonly = true;
      await nextRender();

      field.focus();
      input.setSelectionRange(2, 2, 'none');
      await settle();

      expect(selection()).to.eql([2, 2]);
    });

    it('should keep select-all working when readonly', async () => {
      // §7.8.5 explicitly preserves selection-based copy.
      await setUp('123456');
      field.readonly = true;
      await nextRender();

      field.focus();
      await sendKeys({ press: SELECT_ALL });
      await settle();

      expect(selection()).to.eql([0, 6]);
    });

    it('should not move the caret on Home when readonly', async () => {
      await setUp('123456');
      field.readonly = true;
      await nextRender();

      field.focus();
      input.setSelectionRange(3, 3, 'none');
      await settle();

      await sendKeys({ press: 'Home' });
      await settle();

      expect(selection()).to.eql([0, 0]);
    });

    it('should not be focusable when disabled', async () => {
      // §7.8.5: disabled holds no selection at all, so there is no active cell.
      await setUp('123456');
      field.disabled = true;
      await nextRender();

      field.focus();
      await settle();

      expect(document.activeElement).to.not.equal(input);
    });
  });
});
