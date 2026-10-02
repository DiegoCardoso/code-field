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
 * Validation (SPEC §8): two constraints, two messages, run on blur and on
 * `validate()` — never on the keystroke that starts a code.
 */
describe('validation', () => {
  let field;

  beforeEach(async () => {
    field = fixtureSync('<dc-code-field length="4" allowed-char-pattern="[0-9]"></dc-code-field>');
    await nextRender();
  });

  describe('incomplete', () => {
    it('should be invalid on blur when the code is partial', async () => {
      field.focus();
      await sendKeys({ type: '12' });

      field.blur();

      expect(field.invalid).to.be.true;
    });

    it('should become valid when the user finishes an invalid partial code', async () => {
      field.focus();
      await sendKeys({ type: '12' });
      field.blur();

      field.focus();
      await sendKeys({ type: '34' });

      expect(field.invalid).to.be.false;
    });

    it('should revalidate when length shrinks to fit an invalid partial code', async () => {
      field.focus();
      await sendKeys({ type: '12' });
      field.blur();

      field.length = 2;

      expect(field.complete).to.be.true;
      expect(field.invalid).to.be.false;
    });

    it('should not validate on the keystrokes that start a code', async () => {
      // §8: a user typing a 4-digit code must not see an error after the first.
      const spy = sinon.spy();
      field.addEventListener('validated', spy);
      field.focus();

      await sendKeys({ type: '12' });

      expect(field.invalid).to.be.false;
      expect(spy.called).to.be.false;
    });

    it('should report a partial code through checkValidity() without marking it invalid', async () => {
      field.focus();
      await sendKeys({ type: '12' });

      expect(field.checkValidity()).to.be.false;
      expect(field.invalid).to.be.false;
    });

    it('should mark a partial code invalid on validate() and say so in validated', async () => {
      const spy = sinon.spy();
      field.addEventListener('validated', spy);
      field.focus();
      await sendKeys({ type: '12' });

      expect(field.validate()).to.be.false;
      expect(field.invalid).to.be.true;
      expect(spy.firstCall.args[0].detail).to.deep.equal({ valid: false });
    });
  });

  describe('required', () => {
    beforeEach(() => {
      field.required = true;
    });

    it('should be invalid on blur when empty', () => {
      field.focus();
      field.blur();
      expect(field.invalid).to.be.true;
    });

    it('should stay invalid when required is removed from a partial code', async () => {
      // The base treats `required` as the only constraint, so removing it
      // force-clears `invalid` — but the length constraint is still failing.
      field.focus();
      await sendKeys({ type: '12' });
      field.blur();

      field.required = false;

      expect(field.invalid).to.be.true;
    });

    it('should be valid when complete', async () => {
      field.focus();
      await sendKeys({ type: '1234' });
      expect(field.validate()).to.be.true;
    });
  });

  it('should treat an empty field as valid when not required', () => {
    field.focus();
    field.blur();
    expect(field.invalid).to.be.false;
    expect(field.checkValidity()).to.be.true;
  });

  describe('manualValidation', () => {
    beforeEach(() => {
      field.manualValidation = true;
    });

    it('should not validate a partial code on blur', async () => {
      field.focus();
      await sendKeys({ type: '12' });

      field.blur();

      expect(field.invalid).to.be.false;
    });

    it('should still answer checkValidity()', async () => {
      field.focus();
      await sendKeys({ type: '12' });
      expect(field.checkValidity()).to.be.false;
    });
  });

  // §8: two constraints, two distinct messages, both from i18n.
  describe('i18n messages', () => {
    beforeEach(() => {
      field.required = true;
      field.i18n = { requiredErrorMessage: 'Enter the code', incompleteErrorMessage: 'The code is too short' };
    });

    it('should show the incomplete message for a partial code', async () => {
      field.focus();
      await sendKeys({ type: '12' });

      field.blur();

      expect(field.errorMessage).to.equal('The code is too short');
    });

    it('should show the required message for an empty required field', () => {
      field.focus();
      field.blur();

      expect(field.errorMessage).to.equal('Enter the code');
    });

    it('should switch messages as the failing constraint changes', async () => {
      field.focus();
      await sendKeys({ type: '1' });
      field.blur();

      field.focus();
      await sendKeys({ press: 'Backspace' });
      field.blur();

      expect(field.errorMessage).to.equal('Enter the code');
    });

    it('should not overwrite an error message the developer set', async () => {
      // ADR 0002: Vaadin's ValidationController avoids clobbering a custom
      // message, and both platforms reproduce that rather than inheriting it.
      field.errorMessage = 'Ask your administrator for a code';
      field.focus();
      await sendKeys({ type: '12' });

      field.blur();

      expect(field.invalid).to.be.true;
      expect(field.errorMessage).to.equal('Ask your administrator for a code');
    });

    it("should not leave the other constraint's message showing when a key is missing", async () => {
      field.i18n = { requiredErrorMessage: 'Enter the code' };
      field.focus();
      field.blur();

      field.focus();
      await sendKeys({ type: '12' });
      field.blur();

      expect(field.invalid).to.be.true;
      expect(field.errorMessage).to.not.equal('Enter the code');
    });

    it('should clear its own message once the code is valid', async () => {
      // Flow reads errorMessage back; a stale one is a wrong answer there.
      field.focus();
      await sendKeys({ type: '12' });
      field.blur();

      field.focus();
      await sendKeys({ type: '34' });
      field.blur();

      expect(field.errorMessage).to.not.be.ok;
    });

    it('should tolerate i18n being null', async () => {
      field.i18n = null;
      field.focus();
      await sendKeys({ type: '12' });

      expect(() => field.blur()).to.not.throw();
      expect(field.invalid).to.be.true;
    });
  });
});
