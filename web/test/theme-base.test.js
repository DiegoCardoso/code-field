/**
 * @license
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
import { describeParity } from './theme-parity.js';

// No theme: the component's own base styles, which SPEC §9 says we ship.
describe('base theme', () => {
  describeParity('base, light', { base: true });

  describe('dark', () => {
    before(() => {
      document.documentElement.style.colorScheme = 'dark';
    });
    after(() => {
      document.documentElement.style.colorScheme = '';
    });
    describeParity('base, dark', { base: true });
  });
});
