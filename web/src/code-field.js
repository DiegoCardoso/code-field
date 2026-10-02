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
import { ThemeDetectionMixin } from '@vaadin/vaadin-themable-mixin/vaadin-theme-detection-mixin.js';
import { ThemableMixin } from '@vaadin/vaadin-themable-mixin/vaadin-themable-mixin.js';
import { css, html, LitElement } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';

/** `value` as a string: `null` and `undefined` are the empty code. */
const asText = (value) => (value == null ? '' : String(value));

/**
 * `value`'s characters — code points, not UTF-16 units. A cell holds one
 * character, so length, truncation and completeness all count these: counting
 * units makes an emoji two cells long and lets truncation split it, leaving a
 * lone surrogate. The Flow server counts the same way, so the two agree.
 *
 * Editing is not covered: caret placement and the full-field clamp still
 * compare the input's UTF-16 offsets with cell counts, so typing next to an
 * emoji can misbehave (SPEC §6.5.6, a known limitation).
 */
const characters = (value) => Array.from(asText(value));

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
class CodeField extends InputFieldMixin(ThemeDetectionMixin(ThemableMixin(ElementMixin(PolylitMixin(LitElement))))) {
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
   * The value a user edit produced, while that edit is being committed; `null`
   * otherwise. This is §7.6's origin flag. It holds the *value* rather than a
   * boolean because `value` is sync: a `value-changed` listener runs inside the
   * edit, and its own assignment is the app's write, not the user's — with a
   * boolean it would complete the code (§11.11) and escape §6.5.2's warning.
   */
  #userValue = null;

  /**
   * The value the app is known to hold: the last `change`, or the last
   * programmatic assignment. `change` fires only on a difference from this
   * (§7.7).
   */
  #committedValue = '';

  /** The value when an IME composition began, or `null` outside one. */
  #valueBeforeComposition = null;

  /** The `errorMessage` this component last wrote from `i18n` (ADR 0002). */
  #i18nErrorMessage = null;

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
       * Error messages for §8's two constraints, as plain strings:
       * `{ requiredErrorMessage, incompleteErrorMessage }`.
       */
      i18n: {
        type: Object,
        value: () => ({}),
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
        /* §7.9.5: the cells run left to right in an RTL page, so the input's text
           must too, or each click resolves to the neighbouring boundary. Here and
           !important, as the hiding properties, so a page-wide input rule cannot
           reverse it. */
        ${tag} > input[slot='input'] {
          direction: ltr !important;
        }

        ${tag} > input[slot='input']::selection {
          background: transparent !important;
          color: transparent !important;
        }
      `,
    ];
  }

  /**
   * §8's implicit length constraint, declared as one so the base treats it like
   * any other. Without it the base believes `required` is the only constraint:
   * removing `required` force-clears `invalid` on a partial code, and changing
   * `length` never revalidates. `length` is always >= 1, so the field always has
   * a constraint — which is true.
   *
   * @protected
   * @override
   */
  static get constraints() {
    return [...super.constraints, 'length'];
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
      '__trackProgrammaticValue(value)',
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

        /* SPEC §9.1, measured at W-8: each cell looks like a <vaadin-text-field>'s
         input box in the same state, in every theme. Each value falls through the
         app's hook, Lumo's token, and the base primitive, in that order; only Lumo
         sets --lumo-*, so the chain picks the theme without detecting it. The hooks
         reach the cells from the container below, which is how field-base's own
         state rules (invalid, disabled, autofill) arrive here unchanged. */
        :host {
          /* Lumo sizes fields by a token, not by the base computation. */
          --_cell-lumo-size: var(--lumo-text-field-size, var(--lumo-size-m));
          --_cell-lumo-font: var(--lumo-font-size-m);
          /* The field's own height computation, so a cell row lines up with a text
             field beside it: field-base's formula, or Lumo's size token. 1lh is
             resolved where this is used, so it is the cell's line height. */
          --_cell-size: var(
            --vaadin-input-field-height,
            var(
              --_cell-lumo-size,
              calc(1lh + var(--vaadin-padding-block-container) * 2 + var(--vaadin-input-field-border-width, 1px) * 2)
            )
          );
        }

        :host([theme~='small']) {
          --_cell-lumo-size: var(--lumo-size-s);
          --_cell-lumo-font: var(--lumo-font-size-s);
        }

        /* The cells are the boxes, so the container that holds them stays neutral —
           otherwise the code sits inside a second box. !important, because the
           themes style this part from the document (Aura's ::part(input-field),
           which outranks a shadow-root rule) and the container from its own :host.
           Properties only, never the --vaadin-input-field-* hooks: the cells read
           those, inherited from here. The input inside is positioned against it;
           "inset: 0" would otherwise resolve against the initial containing block
           (P0-3.4). */
        [part='input-field'] {
          position: relative;
          background: transparent !important;
          border-width: 0 !important;
          box-shadow: none !important;
          outline: none !important;
          padding: 0 !important;
          /* Sized by the cells, not by the text field's default 12em, which is too
             narrow for six of them. max-content, not auto: the host is an
             inline-grid with a 100% column, so without a definite width here the
             column collapses to the cells' 24px floor. A narrower host still
             shrinks the cells, through field-base's max-width: 100% (§7.9). */
          width: max-content;
        }

        /* Lumo's hover highlight and read-only dash live on this pseudo-element. */
        [part='input-field']::after {
          display: none;
        }

        [part='cells'] {
          display: flex;
          /* A content basis, so the field's natural width is the cells' full size;
             min-width 0, so a narrower field can still shrink them to the floor. */
          flex: 0 1 auto;
          min-width: 0;
          /* §7.9.5: the cells run left to right even in an RTL page; a code is not
             text in the page's direction. The chrome around it still mirrors. */
          direction: ltr;
          gap: var(--vaadin-code-field-cell-gap, var(--lumo-space-s, var(--vaadin-gap-s)));
          /* Decorative only: every pointer event must reach the real input
           underneath, or click-to-position stops working (SPEC §5). */
          pointer-events: none;
          /* Lumo's container treats whatever is slotted into it as the input: it pads
             it and fades its overflow with a mask, which clips the last cell. */
          padding: 0;
          mask-image: none;
          -webkit-mask-image: none;
        }

        [part='cell'] {
          /* A width, not a flex-basis: Chromium sizes a flex container from its
             items' content widths and ignores the basis, so the field's natural
             width would be the 24px floor. Shrinks from here to the floor, in CSS,
             never in JS (§7.9). */
          flex: 0 1 auto;
          inline-size: var(--vaadin-code-field-cell-width, var(--_cell-size));
          min-width: 24px;
          /* Square by default: as tall as a text field's box, and as wide. */
          block-size: var(--_cell-size);
          display: grid;
          place-items: center;
          position: relative;
          box-sizing: border-box;
          /* Aura computes its surface colour on ::part(input-field), the container
             above, so --aura-surface-color resolves here to Aura's field fill —
             read-only transparency included. */
          background: var(
            --vaadin-input-field-background,
            var(--lumo-contrast-10pct, var(--aura-surface-color, var(--vaadin-background-color)))
          );
          border: var(--vaadin-input-field-border-width, 1px) solid
            var(--vaadin-input-field-border-color, var(--vaadin-border-color));
          border-radius: var(
            --vaadin-code-field-cell-radius,
            var(--vaadin-input-field-border-radius, var(--lumo-border-radius-m, var(--vaadin-radius-m)))
          );
          /* Aura's resting shadow; unset outside Aura. */
          box-shadow: var(--aura-shadow-xs, none);
          color: var(--vaadin-input-field-value-color, var(--lumo-body-text-color, var(--vaadin-text-color)));
          font-size: var(--vaadin-input-field-value-font-size, var(--_cell-lumo-font, 1em));
          font-weight: var(--vaadin-input-field-value-font-weight, 400);
          /* Digits must not jitter as the code fills. */
          font-variant-numeric: tabular-nums;
        }

        /* §9 (amended at W-8): the active cell carries the text field's own focus
         ring; there is no separate field ring. Only a focused field has an active
         cell, so the ring also says which control has focus. The caret is
         secondary: prefers-reduced-motion stops its blink, and nothing else would
         mark a cell that is selected, not appended. */
        [part='cell'][active] {
          outline: var(--vaadin-focus-ring-width) solid var(--vaadin-focus-ring-color);
          outline-offset: calc(var(--vaadin-input-field-border-width, 1px) * -1);
        }

        /* A read-only field has no active cell (§7.8.5), so its focus ring goes on
           every cell, dashed, as field-base's read-only focus ring is. */
        :host([readonly][focused]) [part='cell'] {
          outline: var(--vaadin-focus-ring-width) dashed var(--vaadin-focus-ring-color);
          outline-offset: calc(var(--vaadin-input-field-border-width, 1px) * -1);
        }

        :host([invalid]) [part='cell'] {
          border-color: var(--vaadin-input-field-error-color, var(--vaadin-text-color));
          background: var(
            --vaadin-input-field-invalid-background,
            var(
              --lumo-error-color-10pct,
              var(
                --vaadin-input-field-background,
                var(--lumo-contrast-10pct, var(--aura-surface-color, var(--vaadin-background-color)))
              )
            )
          );
        }

        :host([readonly]) [part='cell'] {
          border-style: dashed;
          box-shadow: none;
        }

        :host([disabled]) [part='cell'] {
          background: var(
            --vaadin-input-field-disabled-background,
            var(--lumo-contrast-5pct, var(--vaadin-background-container-strong))
          );
          border-color: transparent;
          box-shadow: none;
          color: var(
            --vaadin-input-field-disabled-value-color,
            var(
              --vaadin-input-field-disabled-text-color,
              var(--lumo-disabled-text-color, var(--vaadin-text-color-disabled))
            )
          );
        }

        /* Scoped rules: where a theme reaches a treatment by a different mechanism,
           not just a different value, so no token can carry it (§9.1.1). Each is
           counted in SPEC §9.1.3. */

        /* Lumo 1: its box has no border at all, and is heavier-set. */
        :host([data-application-theme='lumo']) [part='cell'] {
          border: none;
          font-weight: var(--vaadin-input-field-value-font-weight, 500);
        }

        /* Lumo 2: its focus ring is an outer box-shadow, not an outline, and turns
           to the error colour when invalid. */
        :host([data-application-theme='lumo']) [part='cell'][active],
        :host([data-application-theme='lumo'][readonly][focused]) [part='cell'] {
          outline: none;
          box-shadow: 0 0 0 var(--vaadin-focus-ring-width, 2px)
            var(--vaadin-focus-ring-color, var(--lumo-primary-color-50pct));
        }

        :host([data-application-theme='lumo'][invalid]) [part='cell'][active],
        :host([data-application-theme='lumo'][invalid][readonly][focused]) [part='cell'] {
          box-shadow: 0 0 0 var(--vaadin-focus-ring-width, 2px) var(--lumo-error-color-50pct);
        }

        /* Lumo 3: read-only is a transparent box with a dashed edge, and quieter
           text. */
        :host([data-application-theme='lumo'][readonly]) [part='cell'] {
          background: transparent;
          border: var(--vaadin-input-field-readonly-border, 1px dashed var(--lumo-contrast-30pct));
          color: var(--lumo-secondary-text-color);
        }

        /* Lumo 5: the hover highlight, an overlay a text field draws on its box. */
        :host([data-application-theme='lumo']) [part='cell']::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          background: var(--vaadin-input-field-hover-highlight, var(--lumo-contrast-50pct));
          opacity: 0;
          transition: opacity 0.2s;
        }

        :host([data-application-theme='lumo'][invalid]) [part='cell']::after {
          background: var(--vaadin-input-field-invalid-hover-highlight, var(--lumo-error-color-50pct));
        }

        :host([data-application-theme='lumo']:hover:not([readonly]):not([focused]):not([disabled]))
          [part='cell']::after {
          opacity: var(--vaadin-input-field-hover-highlight-opacity, 0.1);
        }

        /* Lumo 6: in forced colours a box-shadow is dropped, so Lumo outlines its box
           instead — without this the cells have no edge and the active cell no ring. */
        @media (forced-colors: active) {
          :host([data-application-theme='lumo']:not([readonly])) [part='cell'] {
            outline: 1px solid;
            outline-offset: -1px;
          }

          :host([data-application-theme='lumo']) [part='cell'][active] {
            outline: 2px solid;
            outline-offset: -1px;
          }

          :host([data-application-theme='lumo'][disabled]) [part='cell'] {
            outline-color: GrayText;
          }
        }

        /* Lumo 4: the field chrome. A text field gets Lumo's label, helper and error
           styling through Lumo's internal style injection (@media lumo_mixins_*),
           which a third-party component cannot use (SPEC §9.1.3), so it is mirrored
           here — values through Lumo's tokens, structure copied from
           @vaadin/vaadin-lumo-styles/src/mixins/field-{base,label,helper,
           error-message,required}.css at 25.2.11. The theme-lumo tests compare its
           typography and position with a real text field — including small,
           helper-above-field and RTL — so drift there fails a test. The hover
           colours and the disabled helper are mirrored but not tested (§9.1.3). */
        :host([data-application-theme='lumo']) {
          display: inline-flex;
          padding: var(--lumo-space-xs) 0;
          font-family: var(--lumo-font-family);
          font-size: var(--vaadin-input-field-value-font-size, var(--lumo-font-size-m));
          color: var(--vaadin-input-field-value-color, var(--lumo-body-text-color));
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          -webkit-tap-highlight-color: transparent;
        }

        /* Puts the host's baseline on the box, as a text field's does. */
        :host([data-application-theme='lumo'])::before {
          content: '\\2003';
          width: 0;
          /* The base chrome gives this pseudo-element padding, a border and a negative
             margin for its own baseline trick; with them, "width: 0" still leaves
             18px and pushes the field right. Lumo's text field never gets them. */
          padding: 0;
          border: 0;
          margin-bottom: 0;
          height: var(--_cell-size);
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
        }

        :host([data-application-theme='lumo'][has-label])::before {
          margin-top: calc(var(--lumo-font-size-s) * 1.5);
        }

        :host([data-application-theme='lumo'][has-label][theme~='small'])::before {
          margin-top: calc(var(--lumo-font-size-xs) * 1.5);
        }

        :host([data-application-theme='lumo'][has-label]) {
          padding-top: var(--lumo-space-m);
        }

        :host([data-application-theme='lumo']) .vaadin-field-container {
          display: flex;
          flex-direction: column;
          /* Lumo's own bounds, which keep the field within its host; its 12em width
             is not copied, since the cells set the natural width. */
          min-width: 100%;
          max-width: 100%;
        }

        :host([data-application-theme='lumo']) [part='label'] {
          align-self: flex-start;
          color: var(--vaadin-input-field-label-color, var(--lumo-secondary-text-color));
          font-weight: var(--vaadin-input-field-label-font-weight, 500);
          font-size: var(--vaadin-input-field-label-font-size, var(--lumo-font-size-s));
          line-height: 1;
          padding-inline: calc(var(--lumo-border-radius-m) / 4) 1em;
          padding-bottom: 0.5em;
          padding-top: 0.25em;
          margin-top: -0.25em;
          /* Lumo's text field never gets the base chrome, which adds this margin and
             stretches the label to the full field width; Lumo's label is as wide as
             its text, which is where the required indicator sits. */
          margin-bottom: 0;
          width: auto;
          min-width: 0;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          position: relative;
          max-width: 100%;
          box-sizing: border-box;
        }

        :host([data-application-theme='lumo'][focused]:not([readonly])) [part='label'] {
          color: var(--vaadin-input-field-focused-label-color, var(--lumo-primary-text-color));
        }

        :host([data-application-theme='lumo']:hover:not([readonly]):not([focused])) [part='label'] {
          color: var(--vaadin-input-field-hovered-label-color, var(--lumo-body-text-color));
        }

        :host([data-application-theme='lumo'][has-helper]) [part='helper-text']::before {
          content: '';
          display: block;
          height: var(--vaadin-input-field-helper-spacing, 0.4em);
        }

        :host([data-application-theme='lumo']) [part='helper-text'] {
          display: block;
          color: var(--vaadin-input-field-helper-color, var(--lumo-secondary-text-color));
          font-size: var(--vaadin-input-field-helper-font-size, var(--lumo-font-size-xs));
          line-height: var(--lumo-line-height-xs);
          font-weight: var(--vaadin-input-field-helper-font-weight, 400);
          margin-left: calc(var(--lumo-border-radius-m) / 4);
          /* Base chrome margins, which Lumo's text field never gets. */
          margin-top: 0;
          margin-bottom: 0;
        }

        :host([data-application-theme='lumo'][disabled]) [part='helper-text'] {
          color: var(--lumo-disabled-text-color);
          -webkit-text-fill-color: var(--lumo-disabled-text-color);
        }

        :host([data-application-theme='lumo']) [part='error-message'] {
          margin-left: calc(var(--lumo-border-radius-m) / 4);
          font-size: var(--vaadin-input-field-error-font-size, var(--lumo-font-size-xs));
          line-height: var(--lumo-line-height-xs);
          font-weight: var(--vaadin-input-field-error-font-weight, 400);
          color: var(--vaadin-input-field-error-color, var(--lumo-error-text-color));
          max-height: 5em;
          /* Base chrome lays the message out as an icon row with a margin above. */
          display: block;
          margin-top: 0;
        }

        :host([data-application-theme='lumo'][has-error-message]) [part='error-message']::before,
        :host([data-application-theme='lumo'][has-error-message]) [part='error-message']::after {
          content: '';
          display: block;
          height: 0.4em;
          /* Not base's warning icon. */
          width: auto;
          mask: none;
          background: none;
        }

        :host([data-application-theme='lumo']:not([invalid])) [part='error-message'] {
          max-height: 0;
          overflow: hidden;
        }

        /* Lumo leaves the indicator a plain inline span and positions only its
           ::after, against the label; the base chrome makes the span itself an
           absolute 1em box. Required-only, or base's display: none for a field that
           is not required would be overridden and its '*' would show. */
        :host([data-application-theme='lumo'][required]) [part='required-indicator'] {
          display: inline;
          position: static;
          width: auto;
          text-align: initial;
        }

        :host([data-application-theme='lumo'][required]) [part='required-indicator']::after {
          content: var(--vaadin-input-field-required-indicator, var(--lumo-required-field-indicator, '\\2022'));
          color: var(
            --vaadin-input-field-required-indicator-color,
            var(--lumo-required-field-indicator-color, var(--lumo-primary-text-color))
          );
          position: absolute;
          right: 0;
          width: 1em;
          text-align: center;
        }

        :host([data-application-theme='lumo'][invalid]) [part='required-indicator']::after {
          color: var(
            --vaadin-input-field-required-indicator-color,
            var(--lumo-required-field-indicator-color, var(--lumo-error-text-color))
          );
        }

        :host([data-application-theme='lumo'][theme~='small']) [part='label'] {
          font-size: var(--vaadin-input-field-label-font-size, var(--lumo-font-size-xs));
        }

        :host([data-application-theme='lumo'][theme~='small']) {
          font-size: var(--lumo-font-size-s);
        }

        :host([data-application-theme='lumo']:hover:not([readonly])) [part='helper-text'] {
          color: var(--lumo-body-text-color);
        }

        :host([data-application-theme='lumo'][theme~='small']) [part='error-message'] {
          font-size: var(--lumo-font-size-xxs);
        }

        :host([data-application-theme='lumo'][dir='rtl']) [part='error-message'] {
          margin-left: 0;
          margin-right: calc(var(--lumo-border-radius-m) / 4);
        }

        :host([data-application-theme='lumo'][dir='rtl']) [part='required-indicator']::after {
          right: auto;
          left: 0;
        }

        :host([data-application-theme='lumo'][has-helper][theme~='helper-above-field']) [part='helper-text']::before {
          display: none;
        }

        :host([data-application-theme='lumo'][has-helper][theme~='helper-above-field']) [part='helper-text']::after {
          content: '';
          display: block;
          height: var(--vaadin-input-field-helper-spacing, 0.4em);
        }

        :host([data-application-theme='lumo'][has-helper][theme~='helper-above-field']) [part='label'] {
          order: 0;
          padding-bottom: var(--vaadin-input-field-helper-spacing, 0.4em);
        }

        :host([data-application-theme='lumo'][has-helper][theme~='helper-above-field']) [part='helper-text'] {
          order: 1;
        }

        :host([data-application-theme='lumo'][has-helper][theme~='helper-above-field']) [part='label'] + * {
          order: 2;
        }

        :host([data-application-theme='lumo'][has-helper][theme~='helper-above-field']) [part='error-message'] {
          order: 3;
        }

        /* Aura 1 (§9.1.3 #7): disabled uses the lighter container primitive, where the base
           style uses the strong one — by a rule on the part, not a token. */
        :host([data-application-theme='aura'][disabled]) [part='cell'] {
          background: var(--vaadin-input-field-disabled-background, var(--vaadin-background-container));
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
    } else if (event.key === 'Enter' && !event.isComposing) {
      // Enter commits and validates, as the base's native `change` path did —
      // only when there is something to commit, as in vaadin-text-field, and
      // validating first so a `change` listener sees the verdict. An Enter that
      // confirms an IME composition is not a commit.
      if (asText(this.value) !== this.#committedValue) {
        this._requestValidation();
        this.#commit();
      }
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
      // Blur ends the user's composition: it commits here, not again at a late
      // compositionend.
      this.#valueBeforeComposition = null;
      // After super, which has validated: a `change` listener sees the verdict.
      this.#commit();
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

    this.#applyUserEdit(() => super._onInput(event), { composing: event.isComposing });

    this.#clampCaretWhenFull();
  }

  /**
   * Runs a user-originated value change and applies §7.6's completion rule to
   * it. Detected here, around the edit, rather than in a value observer: an
   * observer cannot tell a keystroke from an assignment without consulting the
   * same flag, and the setter must never be able to complete the code (§11.11).
   *
   * `value` is `sync`, so by the time `apply` returns `value-changed` has
   * already been dispatched — which is what puts it first in §7.7's order.
   *
   * @private
   */
  #applyUserEdit(apply, { composing = false } = {}) {
    const before = asText(this.value);
    const produced = this.inputElement.value || '';

    this.#asUser(produced, apply);

    if (composing) {
      // An IME composition is not finished until compositionend: completing
      // on a candidate would verify a code the user has not confirmed.
      return;
    }

    // A non-composing edit means no composition is open any more, whether or
    // not one ended cleanly.
    this.#valueBeforeComposition = null;
    this.#completeIfNew(before, produced);
  }

  /**
   * Runs `apply` with `produced` marked as the user's value, so the observers
   * that run inside it treat that value — and only that value — as user input.
   *
   * @private
   */
  #asUser(produced, apply) {
    this.#userValue = produced;
    try {
      apply();
    } finally {
      this.#userValue = null;
    }
  }

  /**
   * Recorded at every start, never carried over: a composition that was
   * aborted without compositionend must not lend its starting value to the
   * next one.
   *
   * @private
   */
  #onCompositionStart = () => {
    this.#valueBeforeComposition = asText(this.value);
  };

  /**
   * Completes the composition's result, if it is still the user's to complete.
   * The pending start value is discarded by anything that ends the user's
   * ownership of the edit first — a programmatic set (§11.11) or a blur, which
   * has already committed — and a field that became disabled or readonly
   * accepts no completion.
   *
   * @private
   */
  #onCompositionEnd = () => {
    const before = this.#valueBeforeComposition;
    this.#valueBeforeComposition = null;
    if (before === null || this.disabled || this.readonly) {
      return;
    }

    this.#completeIfNew(before, this.inputElement.value || '');
  };

  /**
   * §7.6: a user edit to a *new* full value completes the code — from empty,
   * from partial, or over a different complete code.
   *
   * @private
   */
  #completeIfNew(before, produced) {
    // Compared against what the user produced, not just its length: a
    // listener may have replaced it during the edit.
    const value = asText(this.value);
    if (value !== before && characters(value).length === this.length && value === this.#normalise(produced)) {
      // §7.7: completion is a commit — unconditionally, even when the code
      // was edited back to the value last committed, so every completion is
      // `value-changed` → `change` → `code-complete` without exception.
      this.#forceCommit();
      this.dispatchEvent(new CustomEvent('code-complete', { detail: { value: this.value } }));
    }
  }

  /**
   * §7.7: the component owns `change`. Committing at completion, blur and
   * Enter, against `#committedValue`, rather than re-dispatching the native
   * event: the browser compares against the value at focus and knows nothing
   * of the completion commit or of programmatic sets, so it both duplicates
   * commits and misses them — a deletion back to the focus-time value, or any
   * paste, which `setRangeText` makes invisible to it.
   *
   * @private
   */
  #commit() {
    if (asText(this.value) !== this.#committedValue) {
      this.#forceCommit();
    }
  }

  /**
   * Commits whether or not the value differs — completion's case (§7.7).
   *
   * @private
   */
  #forceCommit() {
    this.#committedValue = asText(this.value);
    this.dispatchEvent(new CustomEvent('change', { bubbles: true }));
  }

  /**
   * @param {!HTMLElement} input
   * @protected
   * @override
   */
  _addInputListeners(input) {
    super._addInputListeners(input);
    input.addEventListener('compositionstart', this.#onCompositionStart);
    input.addEventListener('compositionend', this.#onCompositionEnd);
  }

  /**
   * @param {!HTMLElement} input
   * @protected
   * @override
   */
  _removeInputListeners(input) {
    super._removeInputListeners(input);
    input.removeEventListener('compositionstart', this.#onCompositionStart);
    input.removeEventListener('compositionend', this.#onCompositionEnd);
  }

  /**
   * The native `change` is never forwarded; `#commit` replaces it.
   *
   * @param {Event} event
   * @protected
   * @override
   */
  _onChange(event) {
    event.stopPropagation();
  }

  /**
   * A programmatic value is one the app already holds, so it becomes the
   * baseline: committing it again at blur would report the app's own write
   * back to it (§6.2, §14.1).
   *
   * @private
   */
  __trackProgrammaticValue(value) {
    if (!this.#isUserValue(value)) {
      this.#committedValue = asText(value);
      // The app has overwritten whatever was being composed.
      this.#valueBeforeComposition = null;
    }
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

    this.#asUser(restored, () => {
      this.value = restored;
    });

    // As the browser would treat it: a restored value is not an edit, so
    // blurring without touching it commits nothing.
    this.#committedValue = asText(this.value);
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
   * Picks §8's message for the constraint that failed before the verdict is
   * published, so the error is never shown with the wrong text.
   *
   * @return {boolean}
   * @override
   */
  validate() {
    this.#applyI18nErrorMessage();
    return super.validate();
  }

  /**
   * ADR 0002: a message the developer set is never overwritten. The component
   * only writes `errorMessage` while it is empty or still holds the message the
   * component itself wrote last, so switching between §8's two messages works
   * and a custom one survives.
   *
   * @private
   */
  #applyI18nErrorMessage() {
    const owned = !this.errorMessage || this.errorMessage === this.#i18nErrorMessage;
    if (!owned) {
      return;
    }

    const i18n = this.i18n || {};
    let message;
    if (this.#isPartial()) {
      message = i18n.incompleteErrorMessage;
    } else if (this.#isMissing()) {
      message = i18n.requiredErrorMessage;
    }

    // Written even when empty: a passing constraint, or one with no message
    // configured, must not leave the previous constraint's text showing — and
    // Flow reads `errorMessage` back, so a stale one is a wrong answer there.
    this.errorMessage = message || '';
    this.#i18nErrorMessage = message || null;
  }

  /**
   * SPEC §8's implicit length constraint: a partially entered code is always
   * invalid. An empty one is not — that is `required`'s case, with its own
   * message.
   *
   * Does not call `super`: with no native constraint on the input, the base
   * answers `!this.invalid` — the previous verdict — so a field made invalid by
   * a partial code would stay invalid after the user finished it. `required` is
   * the only other constraint (§8), and it is answered directly.
   *
   * @return {boolean}
   * @override
   */
  checkValidity() {
    return !this.#isPartial() && !this.#isMissing();
  }

  /**
   * §8's two constraints, each read in one place so the verdict and the message
   * cannot drift apart.
   *
   * @private
   */
  #isPartial() {
    const { length } = characters(this.value);
    return length > 0 && length < this.length;
  }

  /** @private */
  #isMissing() {
    return this.required && !this.value;
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

    const kept = characters(input.value).slice(0, this.length).join('');
    if (kept.length < input.value.length) {
      // Trim the overflow with setRangeText too, rather than assigning the whole
      // value — §7.8.3 forbids whole-value assignment in an editing path. The cut
      // is where the kept characters end, in units, so none is split.
      input.setRangeText('', kept.length, input.value.length, 'end');
    }

    // The `input` a native paste or drop would have fired. setRangeText fires
    // none, so without this every `input` listener — Flow's EAGER value sync
    // among them — misses the paste entirely. Not the re-dispatch §6.3 forbids:
    // no native `input` exists here to duplicate. Committing through it also
    // sends the paste down the same path as typing.
    input.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: event.type === 'drop' ? 'insertFromDrop' : 'insertFromPaste',
      }),
    );
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
    const raw = asText(value);
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

    const current = asText(value);
    const effective = this.#normalise(current, length);

    if (effective === current) {
      return;
    }

    if (!this.#isUserValue(current)) {
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
  #normalise(value, length = this.length) {
    return characters(this.#sanitise(value)).slice(0, length).join('');
  }

  /**
   * Whether `value` is the one the user's edit produced, or that value after
   * normalising — the observer sees both, as the setter rewrites one into the
   * other.
   *
   * @private
   */
  #isUserValue(value) {
    if (this.#userValue === null) {
      return false;
    }

    const current = asText(value);
    return current === this.#userValue || current === this.#normalise(this.#userValue);
  }

  /** @private */
  __updateComplete(value, length) {
    this._setComplete(characters(value).length === length);
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
    const value = characters(this.value);

    return Array.from({ length: this.length }, (_, index) => {
      // §7.8.5: a read-only field keeps its selection for copying but marks no target
      // cell — nothing can be typed, so there is nowhere for the input to go.
      const active = !this.readonly && index === this._activeCell;
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
