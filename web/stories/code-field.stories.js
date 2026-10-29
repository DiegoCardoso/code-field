import { html } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import '../src/code-field.js';

/**
 * Stories for `<dc-code-field>`. Controls come from the custom elements
 * manifest; `render` binds them as properties, so a control changes the field
 * the way an app would.
 *
 * The play functions are smoke checks for the Interactions panel. They do not
 * replace `web/test/`: `userEvent` dispatches synthetic events, and the field's
 * input pipeline is tested with real keystrokes there (SPEC §14.1).
 */
export default {
  title: 'Code Field',
  component: 'dc-code-field',
  args: {
    label: 'Verification code',
    helperText: '',
    errorMessage: '',
    length: 6,
    value: '',
    allowedCharPattern: '[0-9]',
    oneTimeCode: false,
    required: false,
    disabled: false,
    readonly: false,
    invalid: false,
    manualValidation: false,
    theme: '',
    onValueChanged: fn(),
    onChange: fn(),
    onCodeComplete: fn(),
    onValidated: fn(),
  },
  argTypes: {
    theme: { control: 'select', options: ['', 'small'] },
  },
  render: (args) => html`
    <dc-code-field
      .label="${args.label}"
      .helperText="${args.helperText}"
      .errorMessage="${args.errorMessage}"
      .length="${args.length}"
      .value="${args.value}"
      .allowedCharPattern="${args.allowedCharPattern}"
      .oneTimeCode="${args.oneTimeCode}"
      .required="${args.required}"
      .disabled="${args.disabled}"
      .readonly="${args.readonly}"
      .invalid="${args.invalid}"
      .manualValidation="${args.manualValidation}"
      theme="${ifDefined(args.theme || undefined)}"
      @value-changed="${(event) => args.onValueChanged(event.detail)}"
      @change="${() => args.onChange()}"
      @code-complete="${(event) => args.onCodeComplete(event.detail)}"
      @validated="${(event) => args.onValidated(event.detail)}"
    ></dc-code-field>
  `,
};

const field = (canvasElement) => canvasElement.querySelector('dc-code-field');

export const Default = {};

export const Filled = {
  args: { value: '123456' },
};

export const FourCells = {
  args: { length: 4, label: 'PIN' },
};

export const Small = {
  args: { theme: 'small' },
};

export const WithHelperText = {
  args: { helperText: 'We sent a 6-digit code to your phone.' },
};

export const Invalid = {
  args: { value: '123', invalid: true, errorMessage: 'Enter all 6 digits.' },
};

export const Required = {
  args: { required: true, errorMessage: 'Enter the code.' },
};

export const Readonly = {
  args: { value: '123456', readonly: true },
};

export const Disabled = {
  args: { value: '123', disabled: true },
};

export const Alphanumeric = {
  args: { label: 'Redeem code', length: 8, allowedCharPattern: '[A-Z0-9]' },
};

/** Typing the last character fires `code-complete` once, then `change` (SPEC §7.6, §7.7). */
export const TypeToComplete = {
  args: { length: 4 },
  play: async ({ args, canvasElement, step }) => {
    const input = field(canvasElement).querySelector('input');

    await step('Type the code', async () => {
      await userEvent.click(input);
      await userEvent.keyboard('1234');
    });

    await step('The field is complete', async () => {
      await waitFor(() => expect(field(canvasElement).value).toBe('1234'));
      await expect(field(canvasElement)).toHaveAttribute('complete');
      await expect(args.onCodeComplete).toHaveBeenCalledOnce();
      await expect(args.onCodeComplete).toHaveBeenCalledWith({ value: '1234' });
      await expect(args.onChange).toHaveBeenCalled();
    });
  },
};

/** `allowedCharPattern` rejects a character before it reaches `value`. */
export const RejectsDisallowedCharacters = {
  args: { length: 4 },
  play: async ({ args, canvasElement }) => {
    const input = field(canvasElement).querySelector('input');

    await userEvent.click(input);
    await userEvent.keyboard('1a2b');

    await waitFor(() => expect(field(canvasElement).value).toBe('12'));
    await expect(field(canvasElement)).not.toHaveAttribute('complete');
    await expect(args.onCodeComplete).not.toHaveBeenCalled();
  },
};

/** A programmatic value fires no `code-complete` (SPEC §7.6). */
export const ProgrammaticValue = {
  args: { length: 4 },
  play: async ({ args, canvasElement }) => {
    const element = field(canvasElement);

    element.value = '1234';

    await waitFor(() => expect(element).toHaveAttribute('complete'));
    await expect(args.onValueChanged).toHaveBeenCalledWith({ value: '1234' });
    await expect(args.onCodeComplete).not.toHaveBeenCalled();
  },
};
