/**
 * @license
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
import { describeParity, loadTheme } from './theme-parity.js';

describe('Lumo', () => {
  before(() => loadTheme('/node_modules/@vaadin/vaadin-lumo-styles/lumo.css'));

  describeParity('Lumo, light', { lumo: true });

  describe('dark', () => {
    before(() => {
      document.documentElement.setAttribute('theme', 'dark');
    });
    after(() => {
      document.documentElement.removeAttribute('theme');
    });
    describeParity('Lumo, dark', { lumo: true });
  });
});
