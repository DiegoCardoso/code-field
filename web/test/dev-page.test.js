/**
 * @license
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
import { expect } from 'chai';

/**
 * The dev page is the only place the component is exercised by hand, and it fails
 * *silently* when its module paths are wrong: the element simply never registers,
 * the page still renders, and it looks like a component bug rather than a URL bug.
 *
 * A relative `src` resolves against the directory of the current URL, so opening
 * `/web/dev` without a trailing slash resolves `../src/code-field.js` to
 * `/src/code-field.js` and 404s.
 */
describe('dev page', () => {
  it('should reference modules with root-absolute paths', async () => {
    const response = await fetch('/dev/index.html');
    expect(response.ok, 'could not read the dev page').to.be.true;

    const html = await response.text();
    const sources = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/gu)].map((m) => m[1]);

    expect(sources.length, 'no module scripts found — has the page moved?').to.be.greaterThan(0);
    for (const src of sources) {
      expect(src, `"${src}" is relative, so it breaks when /web/dev is opened without a trailing slash`).to.match(
        /^\//u,
      );
    }
  });
});
