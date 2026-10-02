/**
 * @license
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
import { describeVisual } from './describe-visual.js';

describeVisual('lumo', {
  href: '/node_modules/@vaadin/vaadin-lumo-styles/lumo.css',
  setDark: (dark) => {
    if (dark) {
      document.documentElement.setAttribute('theme', 'dark');
    } else {
      document.documentElement.removeAttribute('theme');
    }
  },
});
