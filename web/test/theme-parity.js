/**
 * @license
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
import { expect } from 'chai';
import { fixtureSync, nextRender } from '@vaadin/testing-helpers';
import { emulateMedia, sendMouse } from '@web/test-runner-commands';
import '@vaadin/text-field/vaadin-text-field.js';
import '../src/code-field.js';

/**
 * SPEC §9.1 / §9.1.1, measured instead of trusted: in each theme a cell must look like a
 * <vaadin-text-field>'s input box in the same state. Not pixel-perfect visual testing —
 * that is the baselines' job — but the computed values a theme sets, compared one by one.
 *
 * Lumo draws the box differently from base and Aura (a fill, no border, a box-shadow focus
 * ring, a dashed ::after when read-only), so "the box's outline" is read from wherever the
 * theme puts it.
 */
export function describeParity(theme, { lumo = false, base = false } = {}) {
  // With no theme, line-height is `normal`, and Firefox's `normal` inside an <input> is taller
  // than field-base's own 1lh formula — the one Vaadin aligns labels with, and the one the
  // cells use. Everywhere else the heights match exactly.
  const heightTolerance = base && /Firefox/u.test(navigator.userAgent) ? 1.5 : 0;
  describe(`cells match a text field (${theme})`, () => {
    let field, textField;

    const box = (tf) => tf.shadowRoot.querySelector('[part="input-field"]');
    const cell = () => field.shadowRoot.querySelector('[part~="cell"]');
    const style = (el, pseudo) => getComputedStyle(el, pseudo);

    /** A border, or just "none" when there is none: a hidden border's colour is noise. */
    const edgeOf = (s) =>
      s.borderTopStyle === 'none' ? 'none' : `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`;

    /** The box's visible outline, wherever the theme draws it. */
    const outline = (tf) => {
      if (lumo && tf.readonly) {
        const after = style(box(tf), '::after');
        return `${after.borderTopWidth} ${after.borderTopStyle} ${after.borderTopColor}`;
      }
      return edgeOf(style(box(tf)));
    };
    const cellOutline = () => edgeOf(style(cell()));

    beforeEach(async () => {
      // Side by side, as in a form row, so the boxes' tops are comparable.
      const wrapper = fixtureSync(`<div style="display: flex; align-items: flex-start; gap: 16px">
        <dc-code-field length="4"></dc-code-field>
        <vaadin-text-field></vaadin-text-field>
      </div>`);
      [field, textField] = wrapper.children;
      await nextRender();
    });

    const both = async (apply) => {
      apply(field);
      apply(textField);
      await nextRender();
    };

    it('should have the same height, radius and fill at rest', () => {
      expect(parseFloat(style(cell()).height)).to.be.closeTo(parseFloat(style(box(textField)).height), heightTolerance);
      expect(style(cell()).borderTopLeftRadius).to.equal(style(box(textField)).borderTopLeftRadius);
      expect(style(cell()).backgroundColor).to.equal(style(box(textField)).backgroundColor);
    });

    it('should have the same outline at rest', () => {
      expect(cellOutline()).to.equal(outline(textField));
    });

    it('should render characters as the text field renders its value', async () => {
      field.value = '1';
      textField.value = '1';
      await nextRender();
      const value = style(textField.inputElement);
      expect(style(cell()).fontSize).to.equal(value.fontSize);
      expect(style(cell()).color).to.equal(value.color);
      expect(style(cell()).fontWeight).to.equal(value.fontWeight);
    });

    it('should mark the active cell as the text field marks focus', async () => {
      // §9.1.1: the active cell gets the field's own focus treatment.
      // Read before focusing the text field: focus leaving our field clears `active`.
      field.focus();
      await nextRender();
      const a = style(field.shadowRoot.querySelector('[part~="cell"][active]'));
      const cellRing = lumo ? a.boxShadow : `${a.outlineWidth} ${a.outlineStyle} ${a.outlineColor} ${a.outlineOffset}`;

      textField.focus();
      textField.setAttribute('focus-ring', '');
      await nextRender();
      const b = style(box(textField));
      const fieldRing = lumo ? b.boxShadow : `${b.outlineWidth} ${b.outlineStyle} ${b.outlineColor} ${b.outlineOffset}`;

      expect(cellRing).to.equal(fieldRing);
    });

    it('should match when invalid', async () => {
      await both((el) => {
        el.invalid = true;
      });
      expect(style(cell()).backgroundColor).to.equal(style(box(textField)).backgroundColor);
      expect(cellOutline()).to.equal(outline(textField));
    });

    it('should match when read-only', async () => {
      await both((el) => {
        el.readonly = true;
      });
      expect(style(cell()).backgroundColor).to.equal(style(box(textField)).backgroundColor);
      expect(cellOutline()).to.equal(outline(textField));
    });

    it('should match when disabled', async () => {
      await both((el) => {
        el.disabled = true;
      });
      expect(style(cell()).backgroundColor).to.equal(style(box(textField)).backgroundColor);
      expect(cellOutline()).to.equal(outline(textField));
      field.value = '1';
      textField.value = '1';
      await nextRender();
      expect(style(cell()).color).to.equal(style(textField.inputElement).color);
    });

    it('should render a read-only value as the text field does', async () => {
      await both((el) => {
        el.value = '1';
        el.readonly = true;
      });
      expect(style(cell()).color).to.equal(style(textField.inputElement).color);
    });

    /** The ring the active cell, or the focused text field, shows. */
    const ringOf = (s) =>
      lumo ? s.boxShadow : `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor} ${s.outlineOffset}`;
    const rings = async (apply) => {
      await both(apply);
      field.focus();
      await nextRender();
      const cellRing = ringOf(style(field.shadowRoot.querySelector('[part~="cell"][active]') || cell()));
      textField.focus();
      textField.setAttribute('focus-ring', '');
      await nextRender();
      return [cellRing, ringOf(style(box(textField)))];
    };

    it('should ring the active cell as the text field rings focus when invalid', async () => {
      const [cellRing, fieldRing] = await rings((el) => {
        el.invalid = true;
      });
      expect(cellRing).to.equal(fieldRing);
    });

    it('should ring the active cell as the text field rings focus when read-only', async () => {
      const [cellRing, fieldRing] = await rings((el) => {
        el.value = '12';
        el.readonly = true;
      });
      expect(cellRing).to.equal(fieldRing);
    });

    it('should shrink cells to the 24px floor in a narrow field (§7.9)', async () => {
      field.style.width = '100px';
      await nextRender();
      const cells = [...field.shadowRoot.querySelectorAll('[part~="cell"]')];
      cells.forEach((c) => expect(c.getBoundingClientRect().width).to.equal(24));
    });

    it('should colour the cells on autofill, as the text field', async () => {
      // field-base's own :autofill rule, keyed on a class: a test cannot trigger :autofill.
      const sim = document.createElement('style');
      sim.textContent = `:is(dc-code-field, vaadin-text-field).autofill-sim::part(input-field) {
        --vaadin-input-field-background: var(--vaadin-input-field-autofill-background, lightyellow) !important;
        --vaadin-input-field-value-color: var(--vaadin-input-field-autofill-color, black) !important;
      }`;
      document.head.appendChild(sim);
      try {
        await both((el) => {
          el.classList.add('autofill-sim');
          el.value = '1';
        });
        expect(style(cell()).backgroundColor).to.equal(style(box(textField)).backgroundColor);
        // field-base's autofill text colour. Under Lumo the text field shows it on the input
        // through :autofill itself, which a test cannot trigger, so assert the value.
        expect(style(cell()).color).to.equal('rgb(0, 0, 0)');
        expect(style(field.shadowRoot.querySelector('[part="input-field"]')).backgroundColor).to.equal(
          'rgba(0, 0, 0, 0)',
        );
      } finally {
        sim.remove();
      }
    });

    it('should match the text field on hover', async () => {
      await sendMouse({ type: 'move', position: [0, 0] });
      const hover = async (el) => {
        const r = el.getBoundingClientRect();
        await sendMouse({ type: 'move', position: [Math.round(r.left + 10), Math.round(r.bottom - 10)] });
        // Past the themes' 0.2s highlight transition, or both sides are mid-fade.
        await new Promise((resolve) => {
          setTimeout(resolve, 300);
        });
      };
      await hover(field);
      const c = [style(cell()).backgroundColor, style(cell(), '::after').opacity];
      await hover(textField);
      const tfAfter = style(box(textField), '::after');
      const t = [style(box(textField)).backgroundColor, tfAfter.opacity];
      await sendMouse({ type: 'move', position: [0, 0] });
      expect(c[0]).to.equal(t[0]);
      // Only Lumo draws a hover overlay; elsewhere neither side has one to compare.
      if (lumo) {
        expect(c[1]).to.equal(t[1]);
      }
    });

    describe('small', () => {
      beforeEach(async () => {
        await both((el) => {
          el.setAttribute('theme', 'small');
          el.value = '1';
          el.label = 'Code';
          el.errorMessage = 'Too short';
          el.invalid = true;
        });
      });

      it('should size and set the cells as a small text field', () => {
        expect(parseFloat(style(cell()).height)).to.be.closeTo(
          parseFloat(style(box(textField)).height),
          heightTolerance,
        );
        expect(style(cell()).fontSize).to.equal(style(textField.inputElement).fontSize);
      });

      it('should set the chrome as a small text field', () => {
        const size = (el, slot) => style(el.querySelector(`[slot=${slot}]`)).fontSize;
        expect(size(field, 'label')).to.equal(size(textField, 'label'));
        expect(size(field, 'error-message')).to.equal(size(textField, 'error-message'));
      });
    });

    it('should keep the cells left to right under dir="rtl" (§7.9.5)', async () => {
      field.setAttribute('dir', 'rtl');
      await nextRender();
      const [first, second] = field.shadowRoot.querySelectorAll('[part~="cell"]');
      expect(first.getBoundingClientRect().left).to.be.below(second.getBoundingClientRect().left);
    });

    describe('forced colours', () => {
      before(() => emulateMedia({ forcedColors: 'active' }));
      after(() => emulateMedia({ forcedColors: 'none' }));

      it('should keep an edge on every cell and a ring on the active one', async () => {
        const edge = (s) => s.borderTopStyle !== 'none' || s.outlineStyle !== 'none';
        expect(edge(style(cell())), 'cell edge').to.be.true;
        field.focus();
        await nextRender();
        const active = style(field.shadowRoot.querySelector('[part~="cell"][active]'));
        expect(active.outlineStyle, 'active ring').to.not.equal('none');
      });
    });

    // §14.1: "label and helper typography silently drift — visible only side by side".
    describe('field chrome', () => {
      const text = (el, slot) => {
        const s = style(el.querySelector(`[slot=${slot}]`));
        return `${s.fontSize} ${s.fontWeight} ${s.lineHeight} ${s.color}`;
      };

      beforeEach(async () => {
        await both((el) => {
          el.label = 'Code';
          el.helperText = 'From the SMS';
        });
      });

      it('should style the label as the text field does', () => {
        expect(text(field, 'label')).to.equal(text(textField, 'label'));
      });

      it('should style the helper text as the text field does', () => {
        expect(text(field, 'helper')).to.equal(text(textField, 'helper'));
      });

      it('should style the error message as the text field does', async () => {
        await both((el) => {
          el.errorMessage = 'Too short';
          el.invalid = true;
        });
        expect(text(field, 'error-message')).to.equal(text(textField, 'error-message'));
      });

      it("should start the box at the field's left edge, as the text field does", () => {
        const inset = (el) =>
          el.shadowRoot.querySelector('[part="input-field"]').getBoundingClientRect().left -
          el.getBoundingClientRect().left;
        expect(inset(field)).to.be.closeTo(inset(textField), 0.5);
      });

      it('should space the helper below the box as the text field does', () => {
        const gap = (el) =>
          el.querySelector('[slot=helper]').getBoundingClientRect().top -
          el.shadowRoot.querySelector('[part="input-field"]').getBoundingClientRect().bottom;
        expect(gap(field)).to.be.closeTo(gap(textField), 0.5);
      });

      it('should place the error message as the text field does', async () => {
        await both((el) => {
          el.errorMessage = 'Too short';
          el.invalid = true;
        });
        const gap = (el) =>
          el.querySelector('[slot=error-message]').getBoundingClientRect().top -
          el.querySelector('[slot=helper]').getBoundingClientRect().bottom;
        expect(gap(field)).to.be.closeTo(gap(textField), 0.5);
      });

      it('should put the helper above the box with helper-above-field', async () => {
        await both((el) => el.setAttribute('theme', 'helper-above-field'));
        const above = (el) =>
          el.querySelector('[slot=helper]').getBoundingClientRect().bottom <=
          el.shadowRoot.querySelector('[part="input-field"]').getBoundingClientRect().top;
        expect(above(field)).to.equal(above(textField));
        expect(above(field)).to.be.true;
      });

      it('should mirror the chrome under dir="rtl"', async () => {
        await both((el) => {
          el.setAttribute('dir', 'rtl');
          el.required = true;
          el.errorMessage = 'Too short';
          el.invalid = true;
        });
        const ind = (el) => {
          const s = style(el.shadowRoot.querySelector('[part="required-indicator"]'), '::after');
          return `${s.left} ${s.right}`;
        };
        const err = (el) => {
          const s = style(el.shadowRoot.querySelector('[part="error-message"]'));
          return `${s.marginLeft} ${s.marginRight}`;
        };
        expect(ind(field)).to.equal(ind(textField));
        expect(err(field)).to.equal(err(textField));
      });

      it('should line the boxes up', () => {
        const top = (el) => el.shadowRoot.querySelector('[part="input-field"]').getBoundingClientRect().top;
        expect(top(field)).to.be.closeTo(top(textField), 1);
      });
    });

    ['disabled', 'invalid', 'readonly'].forEach((state) => {
      it(`should not draw a box around the cells when ${state}`, async () => {
        field[state] = true;
        await nextRender();
        const s = style(field.shadowRoot.querySelector('[part="input-field"]'));
        expect(s.backgroundColor).to.equal('rgba(0, 0, 0, 0)');
        expect(s.borderTopWidth).to.equal('0px');
        expect(s.boxShadow).to.equal('none');
      });
    });

    it('should not draw a box around the cells', async () => {
      // The cells are the boxes; the outer input-field part stays neutral, or the code
      // sits inside a second box (SPEC §5).
      const outer = field.shadowRoot.querySelector('[part="input-field"]');
      field.focus();
      await nextRender();
      const s = style(outer);
      expect(s.backgroundColor).to.equal('rgba(0, 0, 0, 0)');
      expect(s.borderTopWidth).to.equal('0px');
      expect(s.boxShadow).to.equal('none');
      expect(s.outlineStyle).to.equal('none');
    });
  });
}

/** Loads a theme stylesheet into the test page. */
export async function loadTheme(href) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  const loaded = new Promise((resolve) => {
    link.onload = resolve;
  });
  document.head.appendChild(link);
  await loaded;
}
