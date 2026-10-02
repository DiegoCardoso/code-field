/**
 * @license
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
import { describeVisual } from './describe-visual.js';

// Aura follows color-scheme; it never sets one itself.
describeVisual('aura', {
  href: '/node_modules/@vaadin/aura/aura.css',
  setDark: (dark) => {
    document.documentElement.style.colorScheme = dark ? 'dark' : '';
  },
});
