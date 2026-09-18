/**
 * @license
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
// NOTE: the monorepo imports `expect` from `@vaadin/chai-plugins`, which is NOT
// published to npm. Plain `chai` is the closest available equivalent; swap the
// import if this component is ever upstreamed (`W-1.4`).
import { expect } from 'chai';
import { PolylitMixin } from '@vaadin/component-base/src/polylit-mixin.js';
import { InputFieldMixin } from '@vaadin/field-base/src/input-field-mixin.js';
import { LitElement } from 'lit';

/**
 * The `field-base` canary (SPEC §4.1, `P0-3.6`).
 *
 * This component deep-depends on unversioned `@vaadin/field-base` internals, and
 * ADR-0001 deliberately declares `@vaadin/*` as a peer *range* rather than an exact
 * pin — because exact-pinning a dependency the host application already owns makes
 * npm install a second copy of `field-base`, producing two `InputMixin` class
 * identities in one page.
 *
 * The consequence is that this file, not the version string, is the safety
 * mechanism. If it fails, the integration in §7.8 has to be re-read against the
 * new sources before anything ships.
 */
describe('field-base canary', () => {
  class Probe extends InputFieldMixin(PolylitMixin(LitElement)) {}

  /**
   * Hook -> arity, per SPEC §4.1's table. Arity matters: a hook that gains or
   * loses a parameter has changed contract even if the name survives.
   */
  const HOOKS = {
    _onBeforeInput: 1,
    _onKeyDown: 1,
    _onPaste: 1,
    _onDrop: 1,
    _onInput: 1,
    _onChange: 1,
    _valueChanged: 2,
    _toggleHasValue: 1,
    _inputElementChanged: 1,
  };

  for (const [hook, arity] of Object.entries(HOOKS)) {
    it(`should expose ${hook}/${arity}`, () => {
      const fn = Probe.prototype[hook];
      expect(fn, `${hook} is missing from the composed prototype`).to.be.a('function');
      expect(fn.length, `${hook} arity changed`).to.equal(arity);
    });
  }

  /**
   * The behaviour §7.4 exists to supersede. The base rejects the *entire* clipboard
   * payload when it does not match `allowedCharPattern`, so pasting `123-456` into a
   * digits-only field yields nothing rather than `123456`.
   *
   * We replace `_onPaste`/`_onDrop` rather than wrapping them. If Vaadin ever makes
   * this per-character, our replacement becomes redundant and possibly wrong — so
   * this asserts the behaviour we are superseding still exists.
   */
  for (const [hook, dataProp] of [
    ['_onPaste', 'clipboardData'],
    ['_onDrop', 'dataTransfer'],
  ]) {
    it(`should reject a whole mixed payload in ${hook}`, () => {
      let prevented = false;
      const host = {
        allowedCharPattern: '[0-9]',
        __allowedTextRegExp: new RegExp('^[0-9]*$'),
        _markInputPrevented() {},
      };
      const event = {
        [dataProp]: { getData: () => '123-456' },
        preventDefault() {
          prevented = true;
        },
      };

      Probe.prototype[hook].call(host, event);

      expect(prevented, `${hook} no longer gates the whole payload — re-read SPEC §7.4`).to.be.true;
    });

    it(`should allow a fully matching payload in ${hook}`, () => {
      let prevented = false;
      const host = {
        allowedCharPattern: '[0-9]',
        __allowedTextRegExp: new RegExp('^[0-9]*$'),
        _markInputPrevented() {},
      };
      const event = {
        [dataProp]: { getData: () => '123456' },
        preventDefault() {
          prevented = true;
        },
      };

      Probe.prototype[hook].call(host, event);

      expect(prevented).to.be.false;
    });
  }
});
