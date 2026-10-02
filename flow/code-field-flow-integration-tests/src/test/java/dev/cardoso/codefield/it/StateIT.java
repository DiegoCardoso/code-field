/*
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
package dev.cardoso.codefield.it;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

/** Disabled and readonly fields take no input (SPEC §7.8.5), so nothing reaches the server. */
class StateIT extends AbstractIT {

    @Test
    void disabledTakesNoInput() {
        open("length=4");
        click("disable");

        input().focus();
        page.keyboard().type("12");
        // ON_CHANGE syncs on commit, so blur: without it, an empty log proves nothing.
        blur();

        assertTrue(logNow().isEmpty(), logNow().toString());
        assertEquals("", input().inputValue());
    }

    @Test
    void readonlyTakesNoInput() {
        open("length=4");
        click("readonly");

        input().focus();
        page.keyboard().type("12");
        blur();

        assertTrue(logNow().isEmpty(), logNow().toString());
        assertEquals("", input().inputValue());
    }
}
