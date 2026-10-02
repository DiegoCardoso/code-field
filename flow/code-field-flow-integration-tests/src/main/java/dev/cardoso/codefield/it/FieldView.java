/*
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
package dev.cardoso.codefield.it;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.html.Input;
import com.vaadin.flow.component.html.NativeButton;
import com.vaadin.flow.component.html.Pre;
import com.vaadin.flow.component.html.Span;
import com.vaadin.flow.data.binder.Binder;
import com.vaadin.flow.data.value.ValueChangeMode;
import com.vaadin.flow.router.BeforeEnterEvent;
import com.vaadin.flow.router.BeforeEnterObserver;
import com.vaadin.flow.router.Route;

import dev.cardoso.codefield.CodeField;
import dev.cardoso.codefield.CodeFieldI18n;

/**
 * The F-5 test view. Query parameters configure the field ({@code mode}, {@code length},
 * {@code required}); buttons perform server actions; and the view renders what the server
 * holds, so an IT reads server state as text and never reaches into Flow or the shadow root.
 * <ul>
 * <li>{@code #log}: one line per ValueChangeEvent and CodeCompleteEvent, in arrival order.</li>
 * <li>{@code #state}: getValue(), isComplete(), isInvalid() and getErrorMessage(), refreshed
 * after every value change and every action.</li>
 * <li>{@code #bean}: what a Binder in setBean mode has written to its bean.</li>
 * </ul>
 */
@Route("field")
public class FieldView extends Div implements BeforeEnterObserver {

    private final CodeField field = new CodeField("Code");
    private final Pre log = new Pre();
    private final Span state = new Span();
    private final Span bean = new Span();
    private final String[] code = { "" };
    private final Binder<String[]> binder = new Binder<>();

    public FieldView() {
        field.setId("field");
        field.setI18n(new CodeFieldI18n().setRequiredErrorMessage("Enter the code")
                .setIncompleteErrorMessage("The code is too short"));
        log.setId("log");
        state.setId("state");
        bean.setId("bean");

        // Bound before the logging listener, so `bean` shows what Binder has just written.
        binder.forField(field).bind(b -> b[0], (b, v) -> b[0] = v);
        binder.setBean(code);

        // Registered after the field's own validation listener, so `state` shows the verdict.
        field.addValueChangeListener(e -> {
            append("value " + e.getValue() + (e.isFromClient() ? " client" : " server"));
            render();
        });
        field.addCodeCompleteListener(
                e -> append("complete " + e.getValue() + " getValue=" + field.getValue()));

        // Somewhere to copy a code from, so a paste goes through the real clipboard.
        Input scratch = new Input();
        scratch.setId("scratch");

        add(field, scratch, button("server-set", () -> field.setValue("98-76 54")),
                button("shrink", () -> field.setLength(4)), button("clear", field::clear),
                button("french", () -> field.setI18n(
                        new CodeFieldI18n().setIncompleteErrorMessage("Code trop court"))),
                button("disable", () -> field.setEnabled(false)),
                button("readonly", () -> field.setReadOnly(true)), log, state, bean);
    }

    @Override
    public void beforeEnter(BeforeEnterEvent event) {
        Map<String, List<String>> params = event.getLocation().getQueryParameters()
                .getParameters();
        param(params, "mode").ifPresent(m -> field.setValueChangeMode(ValueChangeMode.valueOf(m)));
        param(params, "length").ifPresent(l -> field.setLength(Integer.parseInt(l)));
        param(params, "required")
                .ifPresent(r -> field.setRequiredIndicatorVisible(Boolean.parseBoolean(r)));
        param(params, "pattern").ifPresent(field::setAllowedCharPattern);
        // Binder runs its own validation after every change and sets `invalid` from it, so
        // a test of the component's own `required` opts out (binder=false). With Binder,
        // asRequired() is the documented way, as for TextField.
        if (!param(params, "binder").map(Boolean::parseBoolean).orElse(true)) {
            binder.removeBinding(field);
        }
        render();
    }

    private static Optional<String> param(Map<String, List<String>> params,
            String name) {
        return params.getOrDefault(name, List.of()).stream().findFirst();
    }

    private NativeButton button(String id, Runnable action) {
        NativeButton button = new NativeButton(id, e -> {
            action.run();
            render();
        });
        button.setId(id);
        return button;
    }

    private void append(String line) {
        log.setText(log.getText() + line + "\n");
    }

    private void render() {
        state.setText("value=" + field.getValue() + " complete=" + field.isComplete()
                + " invalid=" + field.isInvalid() + " error=" + field.getErrorMessage());
        bean.setText(code[0]);
    }
}
