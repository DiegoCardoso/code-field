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
});
