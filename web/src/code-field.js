/**
 * @license
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
import '@vaadin/input-container/src/vaadin-input-container.js';
import { defineCustomElement } from '@vaadin/component-base/src/define.js';
import { ElementMixin } from '@vaadin/component-base/src/element-mixin.js';
import { PolylitMixin } from '@vaadin/component-base/src/polylit-mixin.js';
import { TooltipController } from '@vaadin/component-base/src/tooltip-controller.js';
import { InputController } from '@vaadin/field-base/src/input-controller.js';
import { InputFieldMixin } from '@vaadin/field-base/src/input-field-mixin.js';
import { LabelledInputController } from '@vaadin/field-base/src/labelled-input-controller.js';
import { inputFieldShared } from '@vaadin/field-base/src/styles/input-field-shared-styles.js';
import { ThemableMixin } from '@vaadin/vaadin-themable-mixin/vaadin-themable-mixin.js';
import { css, html, LitElement } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';

/**
 * `<dc-code-field>` — a single-value field for short fixed-length codes.
 *
 * One real `<input>` in the light DOM, visually transparent, with decorative
 * cells rendered over it — never N inputs of `maxlength="1"`. That is why one
 * tab stop, SMS autofill, password-manager fill, partial paste and native
 * selection all work without being reimplemented. See SPEC §4.
 *
 * @customElement
 * @extends HTMLElement
 */
class CodeField extends InputFieldMixin(ThemableMixin(ElementMixin(PolylitMixin(LitElement)))) {
  static get is() {
    return 'dc-code-field';
  }

  static get properties() {
    return {
      /**
       * Sets `autocomplete="one-time-code"` on the input, which is what lets iOS
       * and Android offer an SMS code from the keyboard. Opt-in, because the same
       * UI is used for redeem codes and license keys, which are not one-time
       * passwords (SPEC §1.1).
       */
      oneTimeCode: {
        type: Boolean,
        value: false,
        reflectToAttribute: true,
        attribute: 'one-time-code',
      },

      /**
       * Forwarded to the input; drives which keyboard mobile shows.
       */
      inputMode: {
        type: String,
        value: 'numeric',
      },

      /**
       * Number of cells. Integer >= 1 (SPEC §6.5.4).
       *
       * `sync` so an invalid assignment is reverted before the caller's next
       * statement — a field that is briefly 0 cells long is a bug someone has
       * to reproduce.
       */
      length: {
        type: Number,
        value: 6,
        sync: true,
        reflectToAttribute: true,
      },

      /**
       * The raw code. `sync` so truncation lands before the caller's next
       * statement, matching `length`.
       *
       * Sanitising against `allowedCharPattern` is **not** here: SPEC §6.5.1
       * requires the setter to share one sanitiser with the input pipeline, and
       * that function is built in `W-4`. A second copy written here is the
       * duplicate code path §6.5 exists to prevent.
       */
      value: {
        type: String,
        sync: true,
      },

      /**
       * Whether the code fills every cell. Read-only, reflected, and **derived
       * rather than latched** (SPEC §7.7) — deleting a character makes it false
       * again.
       */
      complete: {
        type: Boolean,
        value: false,
        readOnly: true,
        reflectToAttribute: true,
        sync: true,
      },
    };
  }

  static get delegateProps() {
    return [...super.delegateProps, 'inputMode'];
  }

  static get observers() {
    return [
      '__updateAutocomplete(oneTimeCode)',
      '__lengthChanged(length)',
      '__enforceLength(value, length)',
      '__updateComplete(value, length)',
    ];
  }

  static get styles() {
    // `inputFieldShared` is the same base stylesheet `<vaadin-text-field>` uses
    // (SPEC §4.1 lists it among the intended deep imports). Without it the label
    // and helper typography silently drift from every other field — visible only
    // side by side, which is why SPEC §14.1 asks for that comparison.
    return [
      inputFieldShared,
      css`
        :host([hidden]) {
          display: none !important;
        }

        /* The absolutely-positioned input resolves against this. Without it,
         "inset: 0" resolves against the initial containing block and the input
         covers the whole page — found by measuring, not by reading (P0-3.4). */
        [part='input-field'] {
          position: relative;
        }

        [part='cells'] {
          display: flex;
          flex: 1;
          /* The input is out of flow, so the cells layer is the only thing left in
           flow to give the container its height. Until W-5 renders real cells,
           this keeps the field the height of any other field rather than
           collapsing to its padding. */
          min-height: var(--vaadin-field-baseline-input-height, 1lh);
          /* Decorative only: every pointer event must reach the real input
           underneath, or click-to-position stops working (SPEC §5). */
          pointer-events: none;
        }

        /* Out of flow for two reasons, both load-bearing (SPEC §7.9.4): it keeps
         the ResizeObserver that sizes the font from observing an element whose
         size it changes, and it lets a password manager's badge overhang the
         field without widening it. */
        ::slotted(input) {
          position: absolute;
          inset: 0;
          width: 100%;
          box-sizing: border-box;
        }
      `,
    ];
  }

  /** @protected */
  render() {
    return html`
      <div class="vaadin-field-container">
        <div part="label">
          <slot name="label"></slot>
          <span part="required-indicator" aria-hidden="true" @click="${this.focus}"></span>
        </div>

        <vaadin-input-container
          part="input-field"
          .readonly="${this.readonly}"
          .disabled="${this.disabled}"
          .invalid="${this.invalid}"
          theme="${ifDefined(this._theme)}"
        >
          <div part="cells" aria-hidden="true"></div>
          <slot name="input"></slot>
        </vaadin-input-container>

        <div part="helper-text">
          <slot name="helper"></slot>
        </div>

        <slot name="tooltip"></slot>

        <div part="error-message">
          <slot name="error-message"></slot>
        </div>
      </div>
    `;
  }

  /** @private */
  __enforceLength(value, length) {
    if (this.__truncating) {
      return;
    }

    const current = value || '';
    if (current.length <= length) {
      return;
    }

    // SPEC §6.5.2: warn, naming the input and the result. A silently truncated
    // value bound through a Binder is data loss with no symptom; a warned one is
    // a bug the developer can actually find.
    const truncated = current.slice(0, length);
    console.warn(`<dc-code-field> value "${current}" exceeds length ${length}; truncated to "${truncated}".`);

    this.__truncating = true;
    this.value = truncated;
    this.__truncating = false;
  }

  /** @private */
  __updateComplete(value, length) {
    this._setComplete((value || '').length === length);
  }

  /** @private */
  __lengthChanged(length) {
    if (this.__revertingLength) {
      return;
    }

    if (!Number.isInteger(length) || length < 1) {
      // SPEC §6.5.4: reject and warn rather than coerce. Coercion turns a
      // developer's mistake into a rendering puzzle.
      console.warn(`<dc-code-field> length must be an integer >= 1, got ${length}. Keeping ${this.__lastValidLength}.`);
      this.__revertingLength = true;
      this.length = this.__lastValidLength;
      this.__revertingLength = false;
      return;
    }

    this.__lastValidLength = length;
  }

  /** @private */
  __updateAutocomplete(oneTimeCode) {
    // 'off' rather than unset: a code field should never receive the browser's
    // saved names or email addresses.
    this.autocomplete = oneTimeCode ? 'one-time-code' : 'off';
  }

  /** @protected */
  ready() {
    super.ready();

    this.autocorrect = 'off';

    this.addController(
      new InputController(this, (input) => {
        this._setInputElement(input);
        this._setFocusElement(input);
        this.stateTarget = input;
        this.ariaTarget = input;

        // Autocorrect and spellcheck rewrite what the user typed, which is never
        // wanted in a code. `autocorrect` is delegated by InputFieldMixin;
        // `spellcheck` is not, so it is set here.
        input.setAttribute('spellcheck', 'false');
      }),
    );
    this.addController(new LabelledInputController(this.inputElement, this._labelController));

    // Without this a slotted <vaadin-tooltip> has no target and never settles,
    // which wedges Lit's update queue rather than failing — diagnosed in #4.
    this._tooltipController = new TooltipController(this);
    this._tooltipController.setPosition('top');
    this._tooltipController.setAriaTarget(this.inputElement);
    this.addController(this._tooltipController);
  }
}

defineCustomElement(CodeField);

export { CodeField };
