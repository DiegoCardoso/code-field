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

  /** Guards the re-entrant write in __normaliseValue. */
  #normalising = false;

  /** The single ResizeObserver (§11.4, §7.9.4). */
  #resizeObserver = null;

  /** Cached digit advance, keyed by the font it was measured for. */
  #advanceCache = { font: null, advance: 0 };

  /**
   * True when focus arrived from a pointer. §7.3 places the caret by native hit
   * testing on a click, so focus placement must not overrule where the user
   * actually clicked.
   */
  #focusFromPointer = false;

  /**
   * True while a value change originates from the user rather than from an
   * assignment. §6.5.2's warning is about invisible data loss through a
   * Binder-bound bean; a user holding a key is not that, and warning once per
   * keystroke would make the console useless.
   */
  #fromUser = false;

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
       * Index of the cell the selection currently identifies, or -1 when the
       * field is not focused. Internal: `W-3` deliberately deferred exposing this
       * until something consumed it, and `part="cell"[active]` is the public
       * observable (SPEC §9).
       *
       * @protected
       */
      _activeCell: {
        type: Number,
        value: -1,
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

  /**
   * §11.2: hiding the text is not enough — the browser still paints its own
   * highlight behind a selected character, which shows through the cell as a
   * coloured band. Both declarations are needed.
   *
   * This cannot live in the shadow stylesheet: `::slotted(input)::selection` is
   * not a valid selector and is dropped silently, so the rule appears to be there
   * and does nothing. `field-base` hits the same wall with `::placeholder` and
   * solves it the same way — inject into the light-DOM scope, where
   * `input::selection` works normally.
   *
   * `super` is not optional: the base supplies the `:autofill` overrides §11.3
   * depends on, and replacing this getter would drop them.
   *
   * @protected
   * @return {string[]}
   */
  get slotStyles() {
    const tag = this.localName;

    return [
      ...super.slotStyles,
      `
        ${tag} > input[slot='input']::selection {
          background: transparent !important;
          color: transparent !important;
        }
      `,
    ];
  }

  static get delegateProps() {
    return [...super.delegateProps, 'inputMode'];
  }

  static get observers() {
    return [
      '__updateAutocomplete(oneTimeCode)',
      '__lengthChanged(length)',
      '__normaliseValue(value, length)',
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

        [part='cell'] {
          /* Shrink in CSS, never in JS (§7.9). A JS sizer would need to observe the
           element whose size it sets. */
          flex: 1 1 auto;
          min-width: 24px;
          display: grid;
          place-items: center;
          position: relative;
          box-sizing: border-box;
          /* §9.1: derived, so Lumo and Aura differ through tokens rather than
           through forked CSS. */
          background: var(--vaadin-input-field-background);
          border: var(--vaadin-input-field-border-width, 1px) solid
            var(--vaadin-input-field-border-color, var(--vaadin-border-color, currentColor));
          border-radius: var(--vaadin-code-field-cell-radius, var(--vaadin-radius-s, 4px));
          color: var(--vaadin-input-field-value-color, inherit);
          font-size: var(--vaadin-input-field-value-font-size, inherit);
          /* Digits must not jitter as the code fills. */
          font-variant-numeric: tabular-nums;
        }

        /* §9: the border is the primary indicator and the caret is secondary. It
         must never be the caret alone — prefers-reduced-motion stops the blink,
         and nothing would mark a cell that is selected rather than appended. */
        [part='cell'][active] {
          border-width: var(--vaadin-code-field-cell-active-border-width, 2px);
          border-color: var(--vaadin-focus-ring-color, currentColor);
        }

        :host([readonly]) [part='cell'] {
          background: transparent;
          border: var(--vaadin-input-field-readonly-border, 1px dashed);
        }

        :host([disabled]) [part='cell'] {
          background: var(--vaadin-input-field-disabled-background);
          color: var(--vaadin-input-field-disabled-value-color, inherit);
        }

        :host([invalid]) [part='cell'] {
          border-color: var(--vaadin-input-field-error-color);
        }

        [part='caret'] {
          position: absolute;
          width: var(--vaadin-code-field-caret-width, 2px);
          height: 1lh;
          background: var(--vaadin-code-field-caret-color, currentColor);
          animation: dc-code-field-blink 1.1s steps(1, end) infinite;
        }

        @keyframes dc-code-field-blink {
          50% {
            opacity: 0;
          }
        }

        /* §9: with motion disabled the caret must stop blinking — which is exactly
         why it cannot be the only thing marking the active cell. */
        @media (prefers-reduced-motion: reduce) {
          [part='caret'] {
            animation: none;
          }
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

          /* §11.1 / §11.12: the cells render the characters, so the real text
             must be held without being shown — or every code is drawn twice,
             offset.
             
             !important is load-bearing, not stylistic. The input is light DOM,
             so a page-wide "input { color: ... }" reaches it and would render the
             real code underneath the cells. Importance also reverses the
             shadow/outer cascade order, so these beat even an !important page
             rule. Apps lose the ability to override them deliberately; §11.12
             calls that the intended trade.
             
             Five properties, not four: -webkit-text-fill-color outranks "color"
             and is what ":autofill" uses (§11.3), so omitting it means autofill
             reveals the text. */
          color: transparent !important;
          -webkit-text-fill-color: transparent !important;
          caret-color: transparent !important;
          background: transparent !important;
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
          <div part="cells" aria-hidden="true"> ${this.#renderCells()} </div>
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

  /**
   * SPEC §6.1 drops the clear button on both platforms: `clear()` remains, but no
   * affordance is rendered.
   *
   * `ClearButtonMixin` arrives regardless, because `allowedCharPattern` is
   * declared in `InputControlMixin`, which composes `ClearButtonMixin` directly —
   * the two cannot be separated by composition, and §4.1 deliberately reuses that
   * per-character rejection. (`vaadin-slider` avoids the mixin entirely by
   * extending `FieldMixin`, which is not open to us for that reason.)
   *
   * `null` is a documented return value of this getter, and the base's only
   * consumer is `if (this.clearElement)`. So this is the honest answer to "what
   * is your clear element?" rather than a workaround — and it stops one warning
   * per instance reaching every consuming application's console.
   *
   * @protected
   * @override
   * @return {null}
   */
  get clearElement() {
    return null;
  }

  /** @protected */
  connectedCallback() {
    super.connectedCallback();
    // `selectionchange` only fires on `document`, so the listener cannot live on
    // the input and has to be added and removed with the element.
    document.addEventListener('selectionchange', this.#onSelectionChange);
    this.addEventListener('pointerdown', this.#onPointerDown, true);
  }

  /** @protected */
  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('selectionchange', this.#onSelectionChange);
    this.removeEventListener('pointerdown', this.#onPointerDown, true);
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
  }

  /**
   * §11.4's observer, and there is exactly one. It watches the cell row and
   * publishes metrics consumed **only by the input**, which is out of flow
   * (§7.9.4) — so its output cannot feed back into the cells' layout and the
   * cycle §7.9.4 warns about cannot form.
   *
   * This is not "JS sizing" in the sense §7.9 forbids: the cells still shrink
   * purely in CSS. The observer only reports the width they settled on, so the
   * input's text can follow them.
   *
   * @private
   */
  #observeCellMetrics() {
    const cells = this.shadowRoot.querySelector('[part~="cells"]');
    if (!cells || this.#resizeObserver) {
      return;
    }

    this.#resizeObserver = new ResizeObserver(() => this.#publishCellMetrics());
    this.#resizeObserver.observe(cells);
  }

  /**
   * Publishes cell pitch, glyph advance and the offset between the input's box
   * and the first cell. Measured rather than derived from tokens, so it stays
   * correct whatever a theme sets for gap, padding or font.
   *
   * @private
   */
  #publishCellMetrics() {
    const input = this.inputElement;
    const cells = this.shadowRoot.querySelector('[part~="cells"]');
    const first = cells?.firstElementChild;
    if (!input || !first) {
      return;
    }

    const firstBox = first.getBoundingClientRect();
    const second = first.nextElementSibling;
    // Pitch, not width + gap: it needs no knowledge of which token supplies the
    // gap, and a single cell has no pitch to measure.
    const pitch = second ? second.getBoundingClientRect().left - firstBox.left : firstBox.width;

    // Applied inline rather than through custom properties. The input is slotted
    // twice — into this shadow root and then into <vaadin-input-container>'s —
    // so the container's own ::slotted(input) rules win the cascade for padding
    // and letter-spacing. Inline styles sidestep that argument entirely.
    //
    // The font is copied from the cell, so the advance measured below is the
    // advance the cells actually render with, rather than an approximation.
    const cellFont = getComputedStyle(first).font;
    input.style.font = cellFont;
    input.style.fontVariantNumeric = 'tabular-nums';

    const advance = this.#digitAdvance(cellFont);
    const offset = firstBox.left - input.getBoundingClientRect().left;

    input.style.letterSpacing = `${pitch - advance}px`;

    // Align each character *boundary* with a cell's centre, not each glyph with
    // a cell. A caret is a boundary, and a click resolves to the nearest one —
    // so with glyphs centred, a click on a cell's centre lands exactly on the
    // tie between two boundaries, which Chrome rounds down and Firefox rounds up
    // (an off-by-one cell, in Firefox only).
    //
    // With boundary i at cell i's centre, every point inside cell i is nearer to
    // boundary i than to i+1, in any engine. The glyphs shift half a cell right
    // as a result, which does not matter: the input's text is transparent and
    // the cells render the characters (§11.12).
    input.style.paddingInline = `${offset + firstBox.width / 2}px 0`;
  }

  /**
   * The rendered advance of a digit, which is **not** `1ch` — `ch` is the width
   * of "0" without the font's own spacing, and using it left a residual error the
   * prototype measured at ~2.5px per cell.
   *
   * @private
   */
  #digitAdvance(font) {
    if (this.#advanceCache.font === font && this.#advanceCache.advance) {
      return this.#advanceCache.advance;
    }

    const probe = document.createElement('span');
    probe.textContent = '0';
    probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${font};font-variant-numeric:tabular-nums`;
    document.body.appendChild(probe);
    const advance = probe.getBoundingClientRect().width;
    probe.remove();

    this.#advanceCache = { font, advance };
    return advance;
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

    // Track the active cell from whatever the selection is now, before deciding
    // whether to widen. A selection the component did not set — a click, a drag,
    // Shift+Arrow — still identifies a cell, and only #select would otherwise
    // update it.
    this._activeCell = Math.min(start, this.length - 1);

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
      // A click already placed the caret where the user aimed (§7.3). Clamping a
      // full value to the last cell here would silently overrule every click.
      if (!this.#focusFromPointer) {
        this.#placeCaretOnFocus();
      }
      this.#focusFromPointer = false;
    } else {
      // No focus, no active cell: §9 requires the active-cell treatment to mean
      // "this is where typing goes", which is untrue when nothing is focused.
      this._activeCell = -1;
    }
  }

  /** @private */
  #onPointerDown = () => {
    this.#focusFromPointer = true;
    // Cleared on a later task in case the pointer never produces focus at all —
    // a drag that ends outside the field, for instance.
    setTimeout(() => {
      this.#focusFromPointer = false;
    });
  };

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
    this._activeCell = Math.min(start, this.length - 1);
    // Direction inference compares against this, so it has to record every range
    // we set ourselves — including focus placement, or the first arrow key after
    // focus has nothing to compare against.
    this.#previousRange = [start, end];
  }

  /**
   * SPEC §4.1: **wrapped** — `super` performs the value commit, so the origin
   * flag has to be set around it. `value` is `sync`, so the observer runs inside
   * this call and sees the flag.
   *
   * @param {Event} event
   * @protected
   * @override
   */
  _onInput(event) {
    this.#sanitiseInputInPlace();

    this.#fromUser = true;
    try {
      super._onInput(event);
    } finally {
      this.#fromUser = false;
    }

    this.#clampCaretWhenFull();
  }

  /**
   * §11.7: browsers restore form state *before* custom elements upgrade, so a
   * slotted input can already hold a value when the component wakes up. Adopt it
   * rather than clobbering it — otherwise a back button silently empties the
   * field.
   *
   * It is adopted *through the sanitiser*, because restored state is no more
   * trustworthy than any other input.
   *
   * No warning: the developer did not assign this, the browser did, and §6.5.2's
   * warning exists to catch developer mistakes. The cost is that a hand-written
   * `<input slot="input" value="12-34">` is also adjusted silently.
   *
   * @private
   */
  #adoptRestoredValue(restored) {
    if (!restored || this.value) {
      return;
    }

    this.#fromUser = true;
    try {
      this.value = restored;
    } finally {
      this.#fromUser = false;
    }
  }

  /**
   * §7.8.3: rewrite **only the offending range** with `setRangeText`, never a
   * whole-value assignment, and restore the selection.
   *
   * `beforeinput` cannot be reliably prevented for composition, so characters the
   * pattern rejects can still reach the input — this is the recovery. Assigning
   * the whole value would work, but drops the caret at the end, throwing the user
   * to the last cell after an autocorrect artefact mid-code.
   *
   * Nothing stripped means no rewrite at all, which is what keeps undo intact on
   * the ordinary typing path (§7.8.2, §11.9).
   *
   * @private
   */
  #sanitiseInputInPlace() {
    const input = this.inputElement;
    if (!input) {
      return;
    }

    const current = input.value || '';
    if (this.#sanitise(current) === current) {
      return;
    }

    const caret = input.selectionStart ?? current.length;
    let removedBeforeCaret = 0;

    // Right to left, so earlier indices stay valid as characters are removed.
    for (let index = current.length - 1; index >= 0; index -= 1) {
      if (this.#sanitise(current[index]) === '') {
        input.setRangeText('', index, index + 1, 'preserve');
        if (index < caret) {
          removedBeforeCaret += 1;
        }
      }
    }

    const restored = Math.max(0, caret - removedBeforeCaret);
    this.#select(restored, restored, 'none');
  }

  /**
   * §7.1: "Typing when the value is full and the last cell is active replaces the
   * last character."
   *
   * When the field has just filled, the caret sits one past the last cell. Chrome
   * leaves it there, so the next keystroke appends and is then truncated away —
   * the field silently ignores typing. Firefox happens to land on the last cell
   * and behaves correctly, which is how this was caught.
   *
   * @private
   */
  #clampCaretWhenFull() {
    const input = this.inputElement;
    if (!input || this.readonly || this.disabled) {
      return;
    }

    if ((input.value || '').length < this.length) {
      return;
    }

    // Leave a real range alone; this is only about a caret past the end.
    if (input.selectionStart !== input.selectionEnd || input.selectionStart < this.length) {
      return;
    }

    this.#select(this.length - 1, this.length, 'forward');
  }

  /**
   * SPEC §4.1: **replaced, not wrapped.** The base gates the entire clipboard
   * payload against `allowedCharPattern`, so pasting `123-456` into a digits-only
   * field yields nothing at all — the failure §7.4 forbids. Calling `super` here
   * would reinstate it.
   *
   * @param {ClipboardEvent} event
   * @protected
   * @override
   */
  _onPaste(event) {
    this.#insertFromTransfer(event, event.clipboardData);
  }

  /**
   * SPEC §4.1: replaced for the same reason as `_onPaste`. Not covered by tests —
   * driving a real drop is not available in this harness — but leaving it to the
   * base would reintroduce all-or-nothing rejection on the drop path.
   *
   * @param {DragEvent} event
   * @protected
   * @override
   */
  _onDrop(event) {
    this.#insertFromTransfer(event, event.dataTransfer);
  }

  /**
   * Sanitise, splice at the caret or over the selection, truncate. Uses
   * `setRangeText` rather than assigning `input.value`, so the native undo stack
   * survives (§7.8.2).
   *
   * @private
   */
  #insertFromTransfer(event, transfer) {
    if (this.readonly || this.disabled || !transfer) {
      return;
    }

    // Always prevent: whatever is inserted is inserted by us, sanitised.
    event.preventDefault();

    const sanitised = this.#sanitise(transfer.getData('text'));
    if (!sanitised) {
      return;
    }

    const input = this.inputElement;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;

    input.setRangeText(sanitised, start, end, 'end');

    if (input.value.length > this.length) {
      // Trim the overflow with setRangeText too, rather than assigning the whole
      // value — §7.8.3 forbids whole-value assignment in an editing path.
      input.setRangeText('', this.length, input.value.length, 'end');
    }

    this.#fromUser = true;
    try {
      this.value = input.value;
    } finally {
      this.#fromUser = false;
    }
  }

  /**
   * The one sanitiser (SPEC §6.5.1). Every path that can put characters into the
   * field — assignment, `beforeinput`, composition, paste — calls this, so the
   * same input yields the same value however it arrives. A second copy anywhere
   * is the bug §6.5 exists to prevent.
   *
   * @param {string} value
   * @return {string}
   * @private
   */
  #sanitise(value) {
    const raw = value == null ? '' : String(value);
    const allowed = this.allowedCharPattern ? new RegExp(`^${this.allowedCharPattern}$`, 'u') : null;

    let result = '';
    for (const character of raw) {
      // Whitespace is always stripped, pattern or not: a code copied out of an
      // email arrives with spaces around it and should still paste cleanly.
      if (/\s/u.test(character)) {
        continue;
      }
      if (allowed && !allowed.test(character)) {
        continue;
      }
      result += character;
    }

    return result;
  }

  /**
   * Sanitise, then truncate — in that order. §7.8.4: `123-456` is seven
   * characters, so truncating first clips it to `123-45` and strips to `12345`,
   * one digit short of the code the user actually pasted.
   *
   * @private
   */
  __normaliseValue(value, length) {
    if (this.#normalising) {
      return;
    }

    const current = value == null ? '' : String(value);
    const effective = this.#sanitise(current).slice(0, length);

    if (effective === current) {
      return;
    }

    if (!this.#fromUser) {
      // §6.5.2: name the input and the result. Silent adjustment through a
      // Binder-bound bean is data loss with no symptom — but the same adjustment
      // during typing is just the field working.
      console.warn(`<dc-code-field> value "${current}" was adjusted to "${effective}" (length ${length}).`);
    }

    this.#normalising = true;
    this.value = effective;
    this.#normalising = false;
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

  /**
   * Cells are a presentation of one string value, never separate fields (SPEC
   * §1). `aria-hidden` on the layer keeps the accessible name coming from the
   * single input.
   *
   * @private
   */
  #renderCells() {
    const value = this.value || '';

    return Array.from({ length: this.length }, (_, index) => {
      const active = index === this._activeCell;
      // Only where the selection is genuinely collapsed — the append position.
      // Everywhere else the active cell is a one-character *selection* (§7.8.1)
      // and typing replaces it, so an insertion point would claim something
      // untrue and strike through the character. §9's accent border is the
      // primary indicator and carries that case on its own.
      const showCaret = active && index === value.length;

      return html`<div part="cell" cell-index="${index}" ?filled="${index < value.length}" ?active="${active}"
        >${value[index] ?? ''}${showCaret ? html`<div part="caret"></div>` : ''}</div
      >`;
    });
  }

  /** @protected */
  ready() {
    super.ready();

    this.autocorrect = 'off';

    this.addController(
      new InputController(this, (input) => {
        // §11.7: read this *before* _setInputElement, which propagates the host's
        // (empty) value onto the input and wipes whatever was restored. The
        // property covers browser form restoration; the attribute covers a value
        // written into the markup.
        const restored = input.value || input.getAttribute('value') || '';

        this._setInputElement(input);
        this._setFocusElement(input);
        this.stateTarget = input;
        this.ariaTarget = input;

        // Autocorrect and spellcheck rewrite what the user typed, which is never
        // wanted in a code. `autocorrect` is delegated by InputFieldMixin;
        // `spellcheck` is not, so it is set here.
        input.setAttribute('spellcheck', 'false');

        this.#adoptRestoredValue(restored);
      }),
    );
    this.addController(new LabelledInputController(this.inputElement, this._labelController));

    // Without this a slotted <vaadin-tooltip> has no target and never settles,
    // which wedges Lit's update queue rather than failing — diagnosed in #4.
    this.#observeCellMetrics();

    this._tooltipController = new TooltipController(this);
    this._tooltipController.setPosition('top');
    this._tooltipController.setAriaTarget(this.inputElement);
    this.addController(this._tooltipController);
  }
}

defineCustomElement(CodeField);

export { CodeField };
