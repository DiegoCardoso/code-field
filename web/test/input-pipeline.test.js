/**
 * @license
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
import { expect } from 'chai';
import { fixtureSync, nextRender } from '@vaadin/testing-helpers';
import { sendKeys } from '@web/test-runner-commands';
import sinon from 'sinon';
import '../src/code-field.js';

/**
 * The input pipeline (SPEC §7.8.2–§7.8.4). Every path that can put characters
 * into the field — assignment, typing, paste, composition — runs through one
 * sanitiser, so the same input produces the same value whichever way it arrives.
 */
// CI runs on Linux and development on macOS; the clipboard shortcuts differ.
const MOD = /Mac|iPhone|iPad/u.test(navigator.platform) ? 'Meta' : 'Control';

describe('input pipeline', () => {
  let field, warn;

  beforeEach(async () => {
    field = fixtureSync('<dc-code-field allowed-char-pattern="[0-9]"></dc-code-field>');
    await nextRender();
    warn = sinon.stub(console, 'warn');
  });

  afterEach(() => {
    warn.restore();
  });

  describe('the value setter', () => {
    it('should strip characters the pattern rejects', async () => {
      // §6.5.1. Without this, `value = "abc"` on a digits-only field is accepted
      // and the field disagrees with its own constraint.
      field.value = '12-34';
      expect(field.value).to.equal('1234');
    });

    it('should strip whitespace', async () => {
      field.value = '12 34';
      expect(field.value).to.equal('1234');
    });

    it('should warn when sanitising changed the value', async () => {
      field.value = '12-34';
      expect(warn.calledOnce).to.be.true;
      expect(warn.firstCall.args[0]).to.contain('12-34');
      expect(warn.firstCall.args[0]).to.contain('1234');
    });

    it('should not warn when nothing was stripped', async () => {
      field.value = '1234';
      expect(warn.called).to.be.false;
    });

    it('should sanitise before truncating', async () => {
      // §7.8.4: `123-456` is 7 characters. Truncating first would clip it to
      // `123-45` and then strip, yielding `12345` — one digit short.
      field.value = '123-456';
      expect(field.value).to.equal('123456');
    });
  });

  describe('paste', () => {
    // A *real* paste, not a synthetic ClipboardEvent: Firefox ignores
    // `clipboardData` passed to the ClipboardEvent constructor, so a synthetic
    // event tests nothing there — and a trusted event is what the component
    // actually has to handle.
    //
    // Copying is separated from pasting because focusing the field re-runs focus
    // placement (§7.3), which would overwrite any selection a test set up.
    const copy = async (text) => {
      const scratch = fixtureSync('<input>');
      scratch.focus();
      await sendKeys({ type: text });
      await sendKeys({ press: `${MOD}+a` });
      await sendKeys({ press: `${MOD}+c` });
      scratch.remove();
    };

    const pasteIntoField = async () => {
      await sendKeys({ press: `${MOD}+v` });
      await nextRender();
    };

    it('should strip separators rather than rejecting the whole payload', async () => {
      // The failure §7.4 forbids. The base `allowedCharPattern` gates the entire
      // clipboard payload, so pasting `123-456` into a digits-only field yields
      // *nothing* — which is why §4.1 replaces _onPaste rather than wrapping it.
      await copy('123-456');
      field.focus();
      await pasteIntoField();

      expect(field.value).to.equal('123456');
    });

    it('should strip surrounding whitespace from a copied code', async () => {
      await copy('  123456  ');
      field.focus();
      await pasteIntoField();

      expect(field.value).to.equal('123456');
    });

    it('should truncate a payload longer than length', async () => {
      await copy('12345678');
      field.focus();
      await pasteIntoField();

      expect(field.value).to.equal('123456');
    });

    it('should splice into a partially filled code at the caret', async () => {
      // §7.4: partial paste into a half-filled code, not replace-everything.
      await copy('34');
      field.value = '12';
      field.focus();
      await pasteIntoField();

      expect(field.value).to.equal('1234');
    });

    it('should replace the selected range', async () => {
      await copy('999');
      field.value = '123456';
      field.focus();
      field.querySelector('input').setSelectionRange(0, 3, 'forward');
      await pasteIntoField();

      expect(field.value).to.equal('999456');
    });
  });

  describe('typing', () => {
    it('should accept allowed characters', async () => {
      field.focus();
      await sendKeys({ type: '123' });
      await nextRender();

      expect(field.value).to.equal('123');
    });

    it('should reject characters the pattern disallows', async () => {
      // §7.8.2: rejection happens per character on `beforeinput`, so the allowed
      // ones around it still land.
      field.focus();
      await sendKeys({ type: '1a2' });
      await nextRender();

      expect(field.value).to.equal('12');
    });

    it('should replace the last character once full', async () => {
      // §7.1, stated explicitly: "Typing when the value is full and the last cell
      // is active replaces the last character." So each key after the sixth
      // overwrites cell 5, and the last one typed is the one that survives.
      field.focus();
      await sendKeys({ type: '1234567890' });
      await nextRender();

      expect(field.value).to.equal('123450');
    });

    it('should not warn when the user types past the end', async () => {
      // §6.5.2's warning exists for *programmatic* assignment, where silent
      // truncation is invisible data loss. A user holding a key is not a bug and
      // must not spam the console once per keystroke.
      field.focus();
      await sendKeys({ type: '1234567890' });
      await nextRender();

      expect(warn.called, `warned ${warn.callCount} times while typing`).to.be.false;
    });

    it('should keep the input and the value in agreement', async () => {
      field.focus();
      await sendKeys({ type: '12' });
      await nextRender();

      expect(field.querySelector('input').value).to.equal(field.value);
    });
  });

  describe('deletion', () => {
    const input = () => field.querySelector('input');

    it('should delete the active cell and shift left', async () => {
      // §7.1's worked example: "1234" in a 6-cell field, caret on cell 1,
      // Backspace -> "134". Cells 2-3 slide left. This sliding is the visible
      // consequence P0-4 exists to sign off.
      field.value = '1234';
      field.focus();
      input().setSelectionRange(1, 2, 'forward');

      await sendKeys({ press: 'Backspace' });
      await nextRender();

      expect(field.value).to.equal('134');
    });

    it('should delete the preceding character at the append position', async () => {
      // §7.2: at the append position there is no selected character, so
      // Backspace takes the one before it.
      field.value = '1234';
      field.focus();
      input().setSelectionRange(4, 4, 'none');

      await sendKeys({ press: 'Backspace' });
      await nextRender();

      expect(field.value).to.equal('123');
    });

    it('should shift left on Delete and flip complete false', async () => {
      // §7.2: Delete on cell 0 of a full code drops the length below `length`,
      // so `complete` is false again — it is derived, never latched (§7.7).
      field.value = '123456';
      field.focus();
      input().setSelectionRange(0, 1, 'forward');
      expect(field.complete).to.be.true;

      await sendKeys({ press: 'Delete' });
      await nextRender();

      expect(field.value).to.equal('23456');
      expect(field.complete).to.be.false;
    });

    it('should remove a selected range', async () => {
      field.value = '123456';
      field.focus();
      input().setSelectionRange(1, 4, 'forward');

      await sendKeys({ press: 'Backspace' });
      await nextRender();

      expect(field.value).to.equal('156');
    });

    it('should not warn while deleting', async () => {
      field.value = '123456';
      warn.resetHistory();
      field.focus();
      input().setSelectionRange(0, 1, 'forward');

      await sendKeys({ press: 'Backspace' });
      await nextRender();

      expect(warn.called).to.be.false;
    });
  });

  describe('post-hoc sanitising', () => {
    // §7.8.3's mechanism, not §7.8.3's trigger. Android GBoard composition cannot
    // be reproduced here (§14.3 marks it UNTESTED), but the *recovery* path can:
    // a disallowed character that reached the input despite `beforeinput` must be
    // removed on `input`, without a warning, because the user did nothing wrong.
    const bypassInto = async (value) => {
      const input = field.querySelector('input');
      field.focus();
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      await nextRender();
    };

    it('should strip a character that bypassed beforeinput', async () => {
      await bypassInto('12a3');
      expect(field.value).to.equal('123');
    });

    it('should not warn about a character the user did not deliberately assign', async () => {
      warn.resetHistory();
      await bypassInto('12a3');
      expect(warn.called, 'a composition artefact is not a developer error').to.be.false;
    });

    it('should keep the caret where the user was typing', async () => {
      // §7.8.3: rewrite only the offending range and restore the selection.
      // A whole-value assignment drops the caret at the end, so an autocorrect
      // artefact mid-code would throw the user to the last cell — the visible
      // cost of the cheap implementation.
      const input = field.querySelector('input');
      field.focus();
      input.value = '12a345';
      input.setSelectionRange(3, 3, 'none');
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      await nextRender();

      expect(field.value).to.equal('12345');
      // 'a' was at index 2, so the caret belongs at 2 — not at the end.
      expect(input.selectionStart).to.be.at.most(3);
    });

    it('should leave a clean value untouched', async () => {
      await bypassInto('1234');
      expect(field.value).to.equal('1234');
    });
  });

  describe('undo', () => {
    it('should keep undo working on the untouched path', async () => {
      // §7.8.2: when nothing is stripped, the native insertion proceeds untouched
      // so the undo stack survives. This is the user-facing proxy for "the fast
      // path performs no rewrite" — spying on setRangeText would test the
      // implementation instead of the guarantee.
      field.focus();
      await sendKeys({ type: '123' });
      await nextRender();
      expect(field.value).to.equal('123');

      await sendKeys({ press: `${MOD}+z` });
      await nextRender();

      expect(field.value, 'undo did nothing — something rewrote the value').to.not.equal('123');
    });
  });
});
