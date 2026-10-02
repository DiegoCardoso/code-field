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
 * `setLength` after attach, with truncation (SPEC §13.2, PLAN F-2's exit): the server truncates
 * itself, says so through a value change, and the client shows what the server holds.
 */
class LengthIT extends AbstractIT {

    @Test
    void shrinkingTruncatesOnBothSides() {
        open("length=6");
        type("123456");
        log(2);

        click("shrink");

        // The whole log: a completion after the server's truncation would break §7.6.
        assertEquals(List.of("value 123456 client", "complete 123456 getValue=123456",
                "value 1234 server"), logNow());
        assertTrue(state().startsWith("value=1234 complete=true"), state());
        assertEquals("1234", input().inputValue());
    }
}
