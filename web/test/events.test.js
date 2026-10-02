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
import { copy, MOD } from './clipboard.js';

/**
 * Completion, origin and commit (SPEC §7.6, §7.7). Driven only through real
 * input and the public API, and observed only through events on the host —
 * origin is an internal flag and tests must not reach for it.
 */
describe('events', () => {
  let field;

  beforeEach(async () => {
    field = fixtureSync('<dc-code-field length="4" allowed-char-pattern="[0-9]"></dc-code-field>');
    await nextRender();
  });

  describe('code-complete', () => {
    it('should fire once when typing fills the last cell', async () => {
      const spy = sinon.spy();
      field.addEventListener('code-complete', spy);
      field.focus();

      await sendKeys({ type: '1234' });

      expect(spy.calledOnce).to.be.true;
      expect(spy.firstCall.args[0].detail).to.deep.equal({ value: '1234' });
    });

    it('should fire once when a paste fills the field', async () => {
      // A pasted code is the most common way a code arrives; it must behave
      // exactly like a typed one (§7.5).
      await copy('1234');
      const spy = sinon.spy();
      field.addEventListener('code-complete', spy);
      field.focus();

      await sendKeys({ press: `${MOD}+v` });

      expect(spy.calledOnce).to.be.true;
      expect(spy.firstCall.args[0].detail).to.deep.equal({ value: '1234' });
    });

    it('should fire again after a complete code is edited and refilled', async () => {
      const spy = sinon.spy();
      field.addEventListener('code-complete', spy);
      field.focus();
      await sendKeys({ type: '1234' });

      await sendKeys({ press: 'Backspace' });
      await sendKeys({ type: '5' });

      expect(spy.calledTwice).to.be.true;
      expect(spy.secondCall.args[0].detail).to.deep.equal({ value: '1235' });
    });

    it('should fire when typing over a complete code makes a new one', async () => {
      // §7.6: completion is any user edit to a *new* full value, so a fixed
      // last digit is a new code to verify.
      field.focus();
      await sendKeys({ type: '1234' });
      const spy = sinon.spy();
      field.addEventListener('code-complete', spy);

      await sendKeys({ type: '9' });

      expect(field.value).to.equal('1239');
      expect(spy.calledOnce).to.be.true;
      expect(spy.firstCall.args[0].detail).to.deep.equal({ value: '1239' });
    });

    it('should fire when a paste replaces a complete code', async () => {
      // How a fill into an already-full field arrives — and §7.5 requires a
      // filled code to behave exactly like a typed one.
      field.focus();
      await sendKeys({ type: '1234' });
      await copy('5678');
      const spy = sinon.spy();
      field.addEventListener('code-complete', spy);
      field.focus();

      await sendKeys({ press: `${MOD}+a` });
      await sendKeys({ press: `${MOD}+v` });

      expect(field.value).to.equal('5678');
      expect(spy.calledOnce).to.be.true;
      expect(spy.firstCall.args[0].detail).to.deep.equal({ value: '5678' });
    });

    it('should not fire when an edit leaves a complete code unchanged', async () => {
      field.focus();
      await sendKeys({ type: '1234' });
      const spy = sinon.spy();
      field.addEventListener('code-complete', spy);

      await sendKeys({ type: '4' });

      expect(field.value).to.equal('1234');
      expect(spy.called).to.be.false;
    });

    // IME composition. Playwright cannot drive a real IME, so these dispatch the
    // composition and input events directly — a narrower seam than the rest of
    // this file, agreed for this case only. Each test follows one engine's
    // event order; the component must handle both.
    describe('composition', () => {
      const compose = (type) => field.inputElement.dispatchEvent(new CompositionEvent(type, { bubbles: true }));
      const inputWhile = (value, isComposing) => {
        field.inputElement.value = value;
        field.inputElement.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing }));
      };

      let spy;

      beforeEach(() => {
        field.allowedCharPattern = '';
        spy = sinon.spy();
        field.addEventListener('code-complete', spy);
        field.focus();
      });

      it('should not fire until composition ends (Chromium order)', () => {
        // Chromium: the last `input` is still composing, then compositionend.
        compose('compositionstart');
        inputWhile('12ab', true);
        expect(spy.called).to.be.false;

        compose('compositionend');

        expect(spy.calledOnce).to.be.true;
        expect(spy.firstCall.args[0].detail).to.deep.equal({ value: '12ab' });
      });

      it('should fire once when a non-composing input follows compositionend (Firefox order)', () => {
        compose('compositionstart');
        inputWhile('12ab', true);
        compose('compositionend');
        inputWhile('12ab', false);

        expect(spy.calledOnce).to.be.true;
      });

      it('should not complete a value the app set during the composition', () => {
        // §11.11: the setter must never complete the code, even when its write
        // lands while a composition is open.
        compose('compositionstart');
        inputWhile('12', true);
        field.value = '5678';

        compose('compositionend');

        expect(spy.called).to.be.false;
      });

      it('should not carry a composition that never ended into the next one', () => {
        // An aborted composition leaves no compositionend. The next composition
        // must compare with its own starting value, not the stale one.
        compose('compositionstart');
        inputWhile('12', true);
        inputWhile('1234', false);
        spy.resetHistory();

        compose('compositionstart');
        inputWhile('1234', true);
        compose('compositionend');

        expect(spy.called).to.be.false;
      });

      it('should not complete when blur ends the composition first', () => {
        // Blur commits the value; a late compositionend must not commit it again.
        const change = sinon.spy();
        field.addEventListener('change', change);
        compose('compositionstart');
        inputWhile('12ab', true);
        field.blur();

        compose('compositionend');

        expect(spy.called).to.be.false;
        expect(change.calledOnce).to.be.true;
      });

      ['disabled', 'readonly'].forEach((state) => {
        it(`should not complete when the field became ${state} during the composition`, () => {
          compose('compositionstart');
          inputWhile('12ab', true);
          field[state] = true;

          compose('compositionend');

          expect(spy.called).to.be.false;
        });
      });
    });

    // §7.6 / §11.11: a server echoing the value back must never re-trigger the
    // app's own "verify this code" handler.
    describe('programmatic values', () => {
      let spy, warn;

      beforeEach(() => {
        spy = sinon.spy();
        field.addEventListener('code-complete', spy);
        warn = sinon.stub(console, 'warn');
      });

      afterEach(() => {
        warn.restore();
      });

      it('should not fire when a complete value is assigned', () => {
        field.value = '1234';
        expect(spy.called).to.be.false;
      });

      it('should not fire when an oversized value is truncated to complete', () => {
        field.value = '123456';
        expect(field.value).to.equal('1234');
        expect(spy.called).to.be.false;
      });

      it('should not fire when a partial value is completed by assignment', async () => {
        field.focus();
        await sendKeys({ type: '12' });

        field.value = '1234';

        expect(spy.called).to.be.false;
      });

      it('should not fire when a value-changed listener completes the code', async () => {
        // The listener's assignment runs inside the keystroke's value commit,
        // because `value` is sync. It is still the app's write, not the user's.
        field.addEventListener('value-changed', (event) => {
          if (event.detail.value === '1') {
            field.value = '1999';
          }
        });
        field.focus();

        await sendKeys({ type: '1' });

        expect(field.value).to.equal('1999');
        expect(spy.called).to.be.false;
      });

      it('should not fire when shrinking length makes the value complete', () => {
        field.value = '123';
        field.length = 3;
        expect(field.complete).to.be.true;
        expect(spy.called).to.be.false;
      });
    });
  });

  // §7.7: completion is a commit, so Flow's getValue() inside a CodeCompleteEvent
  // listener returns the completed code on both platforms.
  describe('commit', () => {
    const record = (names) => {
      const log = [];
      names.forEach((name) => field.addEventListener(name, () => log.push(name)));
      return log;
    };

    it('should fire value-changed, then change, then code-complete on completion', async () => {
      field.focus();
      await sendKeys({ type: '123' });
      const log = record(['value-changed', 'change', 'code-complete']);

      await sendKeys({ type: '4' });

      expect(log).to.deep.equal(['value-changed', 'change', 'code-complete']);
    });

    it('should not fire change again when the completed code is blurred', async () => {
      // The duplicate-verification report §7.7 anticipates: completion commits,
      // then the native change at blur commits the same value a second time.
      const spy = sinon.spy();
      field.addEventListener('change', spy);
      field.focus();
      await sendKeys({ type: '1234' });

      field.blur();

      expect(spy.calledOnce).to.be.true;
    });

    it('should not fire change again when Enter is pressed on the completed code', async () => {
      const spy = sinon.spy();
      field.addEventListener('change', spy);
      field.focus();
      await sendKeys({ type: '1234' });

      await sendKeys({ press: 'Enter' });
      field.blur();

      expect(spy.calledOnce).to.be.true;
    });

    it('should validate before committing on Enter, as on blur', async () => {
      // A `change` listener must see the verdict, whichever commit fired it.
      let invalidAtChange;
      field.addEventListener('change', () => {
        invalidAtChange = field.invalid;
      });
      field.focus();
      await sendKeys({ type: '12' });

      await sendKeys({ press: 'Enter' });

      expect(invalidAtChange).to.be.true;
    });

    it('should neither commit nor validate on Enter when nothing changed', async () => {
      // As vaadin-text-field: Enter on an untouched field is not a commit.
      field.required = true;
      const spy = sinon.spy();
      field.addEventListener('change', spy);
      field.focus();

      await sendKeys({ press: 'Enter' });

      expect(spy.called).to.be.false;
      expect(field.invalid).to.be.false;
    });

    it('should fire change on blur once the completed code has been edited', async () => {
      // Suppression is per committed *value*, not a latch: a different value
      // still commits normally.
      const spy = sinon.spy();
      field.addEventListener('change', spy);
      field.focus();
      await sendKeys({ type: '1234' });
      await sendKeys({ press: 'Backspace' });

      field.blur();

      expect(spy.calledTwice).to.be.true;
    });

    // The browser's own change tracking knows nothing about the completion
    // commit, so the component owns `change` outright (§7.7). Each of these
    // left Flow holding a stale value while the browser decided.
    it('should commit on blur after a completed code is deleted back to empty', async () => {
      const spy = sinon.spy();
      field.addEventListener('change', spy);
      field.focus();
      await sendKeys({ type: '1234' });
      for (let i = 0; i < 4; i += 1) {
        await sendKeys({ press: 'Backspace' });
      }

      field.blur();

      expect(spy.callCount).to.equal(2);
      expect(field.value).to.equal('');
    });

    it('should commit a partial paste on blur', async () => {
      await copy('12');
      const spy = sinon.spy();
      field.addEventListener('change', spy);
      field.focus();
      await sendKeys({ press: `${MOD}+v` });

      field.blur();

      expect(field.value).to.equal('12');
      expect(spy.calledOnce).to.be.true;
    });

    it('should commit a user edit that matches a value committed before a programmatic set', async () => {
      // The server's value is the new baseline: typing back to the old commit
      // is a change from what the app now holds.
      field.focus();
      await sendKeys({ type: '1234' });
      field.blur();
      field.value = '1239';
      const spy = sinon.spy();
      field.addEventListener('change', spy);

      field.focus();
      await sendKeys({ type: '4' });
      field.blur();

      expect(field.value).to.equal('1234');
      expect(spy.calledOnce).to.be.true;
    });

    it('should not commit a programmatic completion on the next blur', async () => {
      // §6.2 / §14.1: programmatic completion commits nothing — not even later.
      field.focus();
      await sendKeys({ type: '12' });
      field.value = '1234';
      const spy = sinon.spy();
      field.addEventListener('change', spy);

      field.blur();

      expect(spy.called).to.be.false;
    });

    it('should commit nothing when a complete value is assigned', () => {
      const log = record(['change', 'code-complete']);
      field.value = '1234';
      expect(log).to.be.empty;
    });

    it('should commit nothing on clear()', async () => {
      field.focus();
      await sendKeys({ type: '12' });
      const log = record(['change', 'code-complete']);

      field.clear();

      expect(field.value).to.equal('');
      expect(log).to.be.empty;
    });
  });

  describe('input', () => {
    it('should reach a host listener exactly once per keystroke', async () => {
      // §6.3: the native `input` is composed and already crosses to the host;
      // re-dispatching it would deliver every listener two events.
      const spy = sinon.spy();
      field.addEventListener('input', spy);
      field.focus();

      await sendKeys({ type: '12' });

      expect(spy.callCount).to.equal(2);
    });

    it('should reach a host listener once for a paste', async () => {
      // A native paste fires `input`; the component replaces the paste with
      // setRangeText, which fires none. Without one, Flow's EAGER mode — which
      // synchronises on `input` — never learns of a pasted code.
      await copy('12');
      const spy = sinon.spy();
      field.addEventListener('input', spy);
      field.focus();

      await sendKeys({ press: `${MOD}+v` });

      expect(field.value).to.equal('12');
      expect(spy.callCount).to.equal(1);
    });
  });
});
