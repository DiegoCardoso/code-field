/**
 * @license
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
import { defineCustomElement } from '@vaadin/component-base/src/define.js';
import { ElementMixin } from '@vaadin/component-base/src/element-mixin.js';
import { PolylitMixin } from '@vaadin/component-base/src/polylit-mixin.js';
import { ThemableMixin } from '@vaadin/vaadin-themable-mixin/vaadin-themable-mixin.js';
import { css, html, LitElement } from 'lit';

/**
 * `<dc-code-field>` — a single-value field for short fixed-length codes.
 *
 * SCAFFOLD ONLY (`W-1`). The field shell, selection engine and input pipeline
 * land in `W-2`–`W-4`; see PLAN.md. This exists so the toolchain, the canary
 * test and CI have something real to run against.
 *
 * @customElement
 * @extends HTMLElement
 */
class CodeField extends ThemableMixin(ElementMixin(PolylitMixin(LitElement))) {
  static get is() {
    return 'dc-code-field';
  }

  static get styles() {
    return css`
      :host {
        display: inline-flex;
      }

      :host([hidden]) {
        display: none !important;
      }
    `;
  }

  render() {
    return html`<slot name="input"></slot>`;
  }
}

defineCustomElement(CodeField);

export { CodeField };
