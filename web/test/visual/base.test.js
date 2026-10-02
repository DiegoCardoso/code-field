/**
 * @license
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
import { describeVisual } from './describe-visual.js';

describeVisual('base', {
  setDark: (dark) => {
    document.documentElement.style.colorScheme = dark ? 'dark' : '';
  },
});
