/*
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
package dev.cardoso.codefield.it;

import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.router.Route;

import dev.cardoso.codefield.CodeField;

/**
 * F-1's exit check, kept as a smoke test: a clean checkout starts a dev server that resolves
 * the web component through {@link CodeField}'s {@code file:} npm dependency.
 */
@Route("")
public class SmokeView extends Div {

    public SmokeView() {
        CodeField field = new CodeField("Code");
        field.setId("code");
        field.setLength(4);
        field.setValue("12");
        add(field);
    }
}
