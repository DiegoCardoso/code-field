/*
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
package dev.cardoso.codefield.it;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * Which client event synchronises `value` per ValueChangeMode (owed since F-2: visible only in
 * a browser), and the EAGER paste the F-2 review found unsynced.
 */
class ValueChangeModeIT extends AbstractIT {

    @Test
    void onChangeSynchronisesOnlyWhenTheValueIsCommitted() {
        open("length=6");

        type("12");
        assertTrue(logNow().isEmpty(), logNow().toString());

        blur();
        assertEquals(List.of("value 12 client"), log(1));
    }

    @Test
    void eagerSynchronisesEveryKeystroke() {
        open("length=6&mode=EAGER");

        type("1");

        assertEquals(List.of("value 1 client"), log(1));
    }

    @Test
    void eagerSynchronisesAPaste() {
        // A paste inserts with setRangeText, which fires no `input`; the web component
        // dispatches one since the F-2 review, or EAGER never saw a pasted code.
        open("length=6&mode=EAGER&" + DIGITS);
        copy("12");

        paste();

        assertEquals(List.of("value 12 client"), log(1));
    }
}
