/**
 * @license
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
import { describeParity, loadTheme } from './theme-parity.js';

describe('Aura', () => {
  before(() => loadTheme('/node_modules/@vaadin/aura/aura.css'));

  describeParity('Aura, light');

  describe('dark', () => {
    // Aura follows color-scheme; it never sets one itself.
    before(() => {
      document.documentElement.style.colorScheme = 'dark';
    });
    after(() => {
      document.documentElement.style.colorScheme = '';
    });
    describeParity('Aura, dark');
  });
});
