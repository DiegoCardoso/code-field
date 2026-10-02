/*
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
package dev.cardoso.codefield;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.vaadin.flow.component.ComponentUtil;
import com.vaadin.flow.internal.nodefeature.ElementListenerMap;

/**
 * SPEC §13.1. The client's {@code code-complete} is delivered with ComponentUtil.fireEvent, as
 * Vaadin's own component tests simulate a DOM event. The forced value sync rides on the wire
 * (synchronizeProperty), so its ordering is F-5's to verify in a browser.
 */
class CodeCompleteEventTest {

    @Test
    void deliversTheCompletedCodeToAListener() {
        CodeField field = new CodeField();
        List<CodeCompleteEvent> events = new ArrayList<>();
        field.addCodeCompleteListener(events::add);

        ComponentUtil.fireEvent(field, new CodeCompleteEvent(field, true, "123456"));

        assertEquals(1, events.size());
        assertEquals("123456", events.get(0).getValue());
        assertSame(field, events.get(0).getSource());
        assertTrue(events.get(0).isFromClient());
    }

    @Test
    void isNotFiredForAValueSetOnTheServer() {
        // §7.6 / §11.11: the server half. Only the client fires code-complete, so a complete
        // value set here must not reach a listener. F-5 covers the client half.
        CodeField field = new CodeField(4);
        List<CodeCompleteEvent> events = new ArrayList<>();
        field.addCodeCompleteListener(events::add);

        field.setValue("1234");

        assertTrue(events.isEmpty());
    }

    @Test
    void synchronisesTheValueWithEveryCompletion() {
        // The only unit-level guard on §7.7's forced sync, which otherwise exists only on the
        // wire until F-5's ITs. It reads Flow's internal listener map, as Vaadin's own
        // component tests do; "}value" is how Flow marks a synchronised property.
        CodeField field = new CodeField();
        field.addCodeCompleteListener(event -> {
        });

        var expressions = field.getElement().getNode().getFeature(ElementListenerMap.class)
                .getExpressions("code-complete");

        assertTrue(expressions.contains("}value"), expressions.toString());
        assertTrue(expressions.contains("event.detail.value"), expressions.toString());
    }
}
