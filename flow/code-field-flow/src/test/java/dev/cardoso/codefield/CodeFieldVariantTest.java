/*
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
package dev.cardoso.codefield;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class CodeFieldVariantTest {

    @Test
    void smallSetsTheSmallTheme() {
        // The name the themes key on, as every other field's small variant (SPEC §9).
        CodeField field = new CodeField();

        field.addThemeVariants(CodeFieldVariant.SMALL);

        assertEquals("small", field.getElement().getAttribute("theme"));
    }
}
