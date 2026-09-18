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

  /** Guards the re-entrant write in #onSelectionChange. */
  #adjustingSelection = false;

  /** Last length that passed validation, restored when a bad one is rejected. */
  #lastValidLength = 6;

  /** Previous selection range, the input to ArrowLeft direction inference. */
  #previousRange = null;

  /** Guards the re-entrant write in __lengthChanged. */
  #revertingLength = false;

  /** Guards the re-entrant write in __enforceLength. */
  #truncating = false;

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

  /** @protected */
  connectedCallback() {
    super.connectedCallback();
    // `selectionchange` only fires on `document`, so the listener cannot live on
    // the input and has to be added and removed with the element.
    document.addEventListener('selectionchange', this.#onSelectionChange);
  }

  /** @protected */
  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('selectionchange', this.#onSelectionChange);
  }

  /**
   * SPEC §7.8.1.1–2. A collapsed caret sits *between* characters and cannot
   * identify a cell, so it is widened to cover one — except at the append
   * position, where a collapsed caret is exactly what makes the next keystroke
   * append instead of overwrite.
   *
   * @private
   */
  #onSelectionChange = () => {
    const input = this.inputElement;
    if (!input || this.#adjustingSelection || input.readOnly || this.disabled) {
      return;
    }

    if (input.getRootNode().activeElement !== input) {
      return;
    }

    const { selectionStart: start, selectionEnd: end } = input;
    if (start !== end) {
      return;
    }

    const value = input.value || '';
    const atAppendPosition = start === value.length && value.length < this.length;
    if (atAppendPosition) {
      return;
    }

    // Clamp so a caret past the last cell selects the last cell rather than
    // nothing.
    let cell = Math.min(start, this.length - 1);

    // §7.8.1.3: ArrowLeft collapses a range onto its own start, so re-widening
    // forward would land on the cell it started from and the key would appear to
    // do nothing. Infer the direction by comparing against the previous range.
    //
    // Clicking exactly on the left boundary of the current range is
    // indistinguishable from ArrowLeft and shifts one cell left. The spec
    // accepts that: inference is the trade for not owning caret movement.
    const previous = this.#previousRange;
    const cameFromArrowLeft = previous && previous[0] !== previous[1] && start === previous[0];
    if (cameFromArrowLeft && start > 0) {
      cell = start - 1;
    }
    this.#adjustingSelection = true;
    this.#select(cell, cell + 1, 'forward');
    this.#adjustingSelection = false;
  };

  /**
   * SPEC §7.3: Home and End jump to the first and last cell.
   *
   * Implemented rather than left to the browser because Firefox on macOS does
   * not act on Home/End inside an input at all — the caret simply stays put.
   * Chromium does. Specifying the behaviour means owning it.
   *
   * @param {KeyboardEvent} event
   * @protected
   * @override
   */
  _onKeyDown(event) {
    super._onKeyDown(event);

    if (this.disabled) {
      return;
    }

    // §7.8.5: readonly keeps navigation and copy working — it only suppresses the
    // active-cell highlight. Blocking the key outright would leave Firefox, which
    // does not act on Home/End natively, with no way to move the caret at all.
    if (event.key === 'Home') {
      event.preventDefault();
      this.#moveCaretTo(0);
    } else if (event.key === 'End') {
      const value = this.inputElement.value || '';
      event.preventDefault();
      this.#moveCaretTo(Math.min(value.length, this.length));
    }
  }

  /**
   * Places the caret at `position`, widening it onto a cell unless the field is
   * readonly — where nothing can be typed, so highlighting a target cell would
   * claim something untrue (§7.8.5).
   *
   * @private
   */
  #moveCaretTo(position) {
    if (this.readonly) {
      this.#select(position, position, 'none');
      return;
    }

    if (position >= this.length) {
      this.#select(this.length - 1, this.length, 'forward');
    } else if (position === (this.inputElement.value || '').length) {
      // The append position: a collapsed caret here is what makes the next
      // keystroke append rather than overwrite (§7.8.1.2).
      this.#select(position, position, 'none');
    } else {
      this.#select(position, position + 1, 'forward');
    }
  }

  /**
   * SPEC §7.3. Placement is set explicitly for every case rather than left to the
   * browser: the default differs between engines, and Firefox is in the test
   * matrix for exactly that reason.
   *
   * @param {boolean} focused
   * @protected
   * @override
   */
  _setFocused(focused) {
    super._setFocused(focused);

    if (focused) {
      this.#placeCaretOnFocus();
    }
  }

  /** @private */
  #placeCaretOnFocus() {
    const input = this.inputElement;
    if (!input) {
      return;
    }

    const value = input.value || '';

    if (value.length >= this.length) {
      // Full: clamp onto the last cell. A collapsed caret one past the end
      // leaves nothing highlighted, so the field looks unfocused while focused.
      this.#select(this.length - 1, this.length, 'forward');
    } else {
      // Empty or partial: the append position, collapsed, so the next keystroke
      // appends instead of overwriting.
      this.#select(value.length, value.length, 'none');
    }
  }

  /**
   * SPEC §7.8.1.5: always pass `direction`. Omitting it defaults to `forward`
   * and collapses backward selections in Firefox.
   *
   * @private
   */
  #select(start, end, direction) {
    this.inputElement.setSelectionRange(start, end, direction);
    // Direction inference compares against this, so it has to record every range
    // we set ourselves — including focus placement, or the first arrow key after
    // focus has nothing to compare against.
    this.#previousRange = [start, end];
  }

  /** @private */
  __enforceLength(value, length) {
    if (this.#truncating) {
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

    this.#truncating = true;
    this.value = truncated;
    this.#truncating = false;
  }

  /** @private */
  __updateComplete(value, length) {
    this._setComplete((value || '').length === length);
  }

  /** @private */
  __lengthChanged(length) {
    if (this.#revertingLength) {
      return;
    }

    if (!Number.isInteger(length) || length < 1) {
      // SPEC §6.5.4: reject and warn rather than coerce. Coercion turns a
      // developer's mistake into a rendering puzzle.
      console.warn(`<dc-code-field> length must be an integer >= 1, got ${length}. Keeping ${this.#lastValidLength}.`);
      this.#revertingLength = true;
      this.length = this.#lastValidLength;
      this.#revertingLength = false;
      return;
    }

    this.#lastValidLength = length;
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
