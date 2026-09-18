/**
 * @license
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
import { expect } from 'chai';
import { fixtureSync, nextRender } from '@vaadin/testing-helpers';
import sinon from 'sinon';
import '../src/code-field.js';
import '@vaadin/tooltip/vaadin-tooltip.js';

describe('code-field', () => {
  let field;

  beforeEach(async () => {
    field = fixtureSync('<dc-code-field></dc-code-field>');
    await nextRender();
  });

  it('should not warn about a clear button it deliberately does not have', async () => {
    // SPEC §6.1 drops the clear button on both platforms: `clear()` remains, no
    // affordance is rendered. ClearButtonMixin arrives anyway, because
    // `allowedCharPattern` lives in the same mixin (InputControlMixin composes
    // ClearButtonMixin directly), and §4.1 deliberately reuses that rejection.
    //
    // Without this, every instance logs one line into every consuming
    // application's console — a six-field form logs it six times.
    const warn = sinon.stub(console, 'warn');
    fixtureSync('<dc-code-field></dc-code-field>');
    await nextRender();
    const messages = warn.getCalls().map((call) => String(call.args[0]));
    warn.restore();

    expect(messages.filter((message) => message.includes('clearElement'))).to.eql([]);
  });

  it('should still clear programmatically', async () => {
    // §6.1: the affordance is dropped, `clear()` is not. Returning null from
    // clearElement must not take the method with it.
    field.value = '123456';
    field.clear();
    await nextRender();

    expect(field.value).to.equal('');
    expect(field.querySelector('input').value).to.equal('');
  });

  describe('input element', () => {
    it('should render a real input in the light DOM', () => {
      // SPEC §4: the input is light DOM and slotted, which is *why* password
      // managers and browser autofill work at all (§11.6). A shadow-DOM input
      // would be invisible to document.querySelectorAll('input').
      const input = field.querySelector('input');
      expect(input).to.exist;
      expect(input.getAttribute('slot')).to.equal('input');
    });

    it('should configure the input for code entry', () => {
      const input = field.querySelector('input');
      // Autocorrect and spellcheck actively harm a code field: both rewrite
      // what the user typed. inputMode drives the mobile keyboard (SPEC §6).
      expect(input.getAttribute('spellcheck')).to.equal('false');
      expect(input.getAttribute('autocorrect')).to.equal('off');
      expect(input.getAttribute('inputmode')).to.equal('numeric');
    });

    it('should not set maxlength on the input', () => {
      // SPEC §7.8.4: truncation belongs in the input pipeline, not to the
      // browser. maxlength silently drops characters mid-pipeline, defeating
      // the paste sanitiser that turns `123-456` into `123456`.
      const input = field.querySelector('input');
      expect(input.hasAttribute('maxlength')).to.be.false;
    });

    it('should set autocomplete from oneTimeCode', async () => {
      const input = field.querySelector('input');
      expect(input.getAttribute('autocomplete')).to.equal('off');

      field.oneTimeCode = true;
      await nextRender();
      expect(input.getAttribute('autocomplete')).to.equal('one-time-code');
    });
  });

  describe('length', () => {
    let warn;

    // Stubbed per-test and restored unconditionally: an inline restore() is
    // skipped when the assertion above it fails, leaking the stub into the next
    // test and masking the real failure.
    beforeEach(() => {
      warn = sinon.stub(console, 'warn');
    });

    afterEach(() => {
      warn.restore();
    });

    it('should default to 6', () => {
      expect(field.length).to.equal(6);
    });

    it('should accept an integer of 1 or more', () => {
      field.length = 4;
      expect(field.length).to.equal(4);
    });

    it('should reject a non-integer and keep the previous length', () => {
      // SPEC §6.5.4. Rejecting loudly beats coercing silently: a field that
      // quietly becomes 0 cells long is far harder to diagnose than a warning.
      field.length = 2.5;
      expect(field.length).to.equal(6);
      expect(warn.calledOnce).to.be.true;
    });

    it('should reject a length below 1 and keep the previous length', () => {
      field.length = 0;
      expect(field.length).to.equal(6);
      expect(warn.calledOnce).to.be.true;
    });
  });

  describe('complete', () => {
    it('should be false while the code is shorter than length', () => {
      field.value = '123';
      expect(field.complete).to.be.false;
    });

    it('should be true when the code fills every cell', () => {
      field.value = '123456';
      expect(field.complete).to.be.true;
    });

    it('should not latch once set', async () => {
      // SPEC §7.7: `complete` is derived, not a one-way flag. A field that
      // stays complete after a character is deleted reports a lie to anything
      // bound to it.
      field.value = '123456';
      expect(field.complete).to.be.true;

      field.value = '12345';
      expect(field.complete).to.be.false;
    });

    it('should reflect to an attribute for theming', async () => {
      field.value = '123456';
      await nextRender();
      expect(field.hasAttribute('complete')).to.be.true;
    });
  });

  describe('truncation', () => {
    let warn;

    beforeEach(() => {
      warn = sinon.stub(console, 'warn');
    });

    afterEach(() => {
      warn.restore();
    });

    it('should truncate a value longer than length and warn', () => {
      // SPEC §6.5.2. Silent truncation is the failure mode being designed
      // against: through a Binder-bound bean it is data loss with no symptom.
      field.value = '12345678';
      expect(field.value).to.equal('123456');
      expect(warn.calledOnce).to.be.true;
    });

    it('should name both the input and the result in the warning', () => {
      field.value = '12345678';
      const message = warn.firstCall.args[0];
      expect(message).to.contain('12345678');
      expect(message).to.contain('123456');
    });

    it('should not warn when the value already fits', () => {
      field.value = '1234';
      expect(field.value).to.equal('1234');
      expect(warn.called).to.be.false;
    });

    it('should truncate the value when length shrinks, and warn', () => {
      field.value = '123456';
      warn.resetHistory();

      field.length = 4;
      expect(field.value).to.equal('1234');
      expect(warn.calledOnce).to.be.true;
    });

    it('should leave the value alone when length grows', () => {
      field.value = '1234';
      warn.resetHistory();

      field.length = 8;
      expect(field.value).to.equal('1234');
      expect(warn.called).to.be.false;
    });
  });

  describe('inherited field chrome', () => {
    // These come from InputFieldMixin rather than from this component. They are
    // asserted because SPEC §14.1 requires the field to be indistinguishable
    // from <vaadin-text-field> in its chrome — if a future refactor of the
    // composition drops one, it should fail here rather than in a theme.
    it('should render the label', async () => {
      field.label = 'Verification code';
      await nextRender();
      expect(field.querySelector('label').textContent).to.equal('Verification code');
    });

    it('should associate the label with the input', async () => {
      // SPEC §2: one tab stop, one accessible name. Rendering the label text is
      // not enough — without the association a screen reader announces an
      // unlabelled textbox. Added after mutation testing showed that removing
      // LabelledInputController broke nothing in this suite.
      field.label = 'Verification code';
      await nextRender();

      const input = field.querySelector('input');
      const label = field.querySelector('label');
      expect(input.id).to.be.ok;
      expect(label.getAttribute('for')).to.equal(input.id);
    });

    it('should render helper text', async () => {
      field.helperText = 'Enter the 6-digit code';
      await nextRender();
      expect(field.querySelector('[slot="helper"]').textContent).to.equal('Enter the 6-digit code');
    });

    it('should render the error message when invalid', async () => {
      field.errorMessage = 'Enter all 6 digits';
      field.invalid = true;
      await nextRender();
      expect(field.querySelector('[slot="error-message"]').textContent).to.equal('Enter all 6 digits');
    });

    it('should reflect required, disabled and readonly to the input', async () => {
      field.required = true;
      field.disabled = true;
      field.readonly = true;
      await nextRender();

      const input = field.querySelector('input');
      expect(input.required).to.be.true;
      expect(input.disabled).to.be.true;
      expect(input.readOnly).to.be.true;
    });

    it('should support a tooltip', async () => {
      // SPEC §13 lists HasTooltip on the Flow side; the web component has to
      // provide the slot and the controller for that to bind to anything.
      const tooltip = document.createElement('vaadin-tooltip');
      tooltip.setAttribute('slot', 'tooltip');
      field.appendChild(tooltip);
      await nextRender();

      expect(tooltip.target).to.equal(field);
    });

    it('should forward name to the input so the field submits with a form', async () => {
      field.name = 'otp';
      await nextRender();
      expect(field.querySelector('input').getAttribute('name')).to.equal('otp');
    });
  });
});
