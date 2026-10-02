/*
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
package dev.cardoso.codefield;

import com.vaadin.flow.component.ComponentEvent;
import com.vaadin.flow.component.DomEvent;
import com.vaadin.flow.component.EventData;

/**
 * Fired when the user completes the code: a user edit — typing, paste or autofill — leaves
 * the field full with a new value (SPEC §7.6). Never fired for a value set from the server,
 * so a server that echoes the value back cannot re-trigger its own verification.
 * <p>
 * Completion is a commit (§7.7): the {@code ValueChangeEvent} for the completed value is
 * delivered <em>before</em> this event, so {@link CodeField#getValue()} inside a listener
 * returns the same code as {@link #getValue()}.
 */
@DomEvent("code-complete")
public class CodeCompleteEvent extends ComponentEvent<CodeField> {

    private final String value;

    /**
     * Creates the event.
     *
     * @param source
     *            the field
     * @param fromClient
     *            always {@code true} in practice: the event is only fired by the client
     * @param value
     *            the completed code
     */
    public CodeCompleteEvent(CodeField source, boolean fromClient,
            @EventData("event.detail.value") String value) {
        super(source, fromClient);
        this.value = value;
    }

    /**
     * The completed code, from the event payload. The documented way to read it.
     *
     * @return the completed code
     */
    public String getValue() {
        return value;
    }
}
