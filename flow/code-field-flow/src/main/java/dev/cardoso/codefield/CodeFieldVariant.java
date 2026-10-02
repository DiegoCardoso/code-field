/*
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
package dev.cardoso.codefield;

import com.vaadin.flow.component.shared.ThemeVariant;

/**
 * Theme variants for {@link CodeField} (SPEC §9, §13.2).
 */
public enum CodeFieldVariant implements ThemeVariant {

    /** The compact size, matching the other fields' {@code small} variant. */
    SMALL("small");

    private final String variant;

    CodeFieldVariant(String variant) {
        this.variant = variant;
    }

    @Override
    public String getVariantName() {
        return variant;
    }
}
