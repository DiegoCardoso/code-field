/*
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
package dev.cardoso.codefield.it;

import com.vaadin.flow.component.Component;
import com.vaadin.flow.component.Tag;
import com.vaadin.flow.component.dependency.JsModule;
import com.vaadin.flow.component.dependency.NpmPackage;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.router.Route;

/**
 * F-1's exit check: a clean checkout starts a dev server that resolves the web component
 * through the relative path. The npm annotations live here rather than on a
 * {@code CodeField} class so that F-1 does not cut the Java API before F-2.
 */
@Route("")
public class SmokeView extends Div {

    /**
     * The web component, unwrapped. Replaced by {@code CodeField} in F-2.
     *
     * <p>{@code file:../../web} resolves from this module's directory, where Vaadin writes
     * package.json. It switches to a published {@code 0.0.x} once there is something for the
     * Flow ITs to run (P0-6.1).
     */
    @Tag("dc-code-field")
    @NpmPackage(value = "@cardoso/code-field", version = "file:../../web")
    @JsModule("@cardoso/code-field/src/code-field.js")
    static class RawCodeField extends Component {
    }

    public SmokeView() {
        RawCodeField field = new RawCodeField();
        field.setId("code");
        field.getElement().setProperty("label", "Code");
        add(field);
    }
}
