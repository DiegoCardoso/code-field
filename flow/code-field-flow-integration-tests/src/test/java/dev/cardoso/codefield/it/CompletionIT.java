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
 * SPEC §14.4's CodeCompleteEvent bullets, and §7.7's forced sync (owed since F-3): the value
 * change arrives first, then the completion, and getValue() inside the listener equals the
 * payload. In ON_CHANGE and EAGER mode, the two ways the value can reach the server.
 */
class CompletionIT extends AbstractIT {

    @Test
    void deliversTheValueBeforeTheCompletionOnChange() {
        open("length=4");

        type("1234");

        assertEquals(List.of("value 1234 client", "complete 1234 getValue=1234"), log(2));
    }

    @Test
    void deliversTheValueBeforeTheCompletionWhenEager() {
        // Holds even without the forced sync: the `input` sync and code-complete leave in
        // one request, and Flow applies property syncs before events. Pinned anyway.
        open("length=4&mode=EAGER");

        type("1234");

        List<String> log = log(2);
        assertEquals("complete 1234 getValue=1234", log.get(log.size() - 1));
        assertEquals("value 1234 client", log.get(log.size() - 2));
    }

    @Test
    void deliversTheValueBeforeTheCompletionOnBlur() {
        // The case the forced sync exists for. ON_BLUR syncs only when the field loses focus,
        // which completion does not do; without the sync, code-complete reaches the server
        // while getValue() is still empty.
        open("length=4&mode=ON_BLUR");

        type("1234");

        assertEquals(List.of("value 1234 client", "complete 1234 getValue=1234"), log(2));
    }

    @Test
    void deliversTheValueBeforeTheCompletionWhenLazy() {
        // LAZY debounces the `input` sync, so it would arrive after code-complete.
        open("length=4&mode=LAZY");

        type("1234");

        // A slow runner may let the debounce fire mid-typing and add an earlier value line,
        // so assert what precedes the completion rather than line positions.
        List<String> log = log(2);
        int complete = log.indexOf("complete 1234 getValue=1234");
        assertTrue(complete > 0, log.toString());
        assertEquals("value 1234 client", log.get(complete - 1));
    }

    @Test
    void completesOnAPaste() {
        open("length=4&" + DIGITS);
        copy("12-34");

        paste();

        assertEquals("complete 1234 getValue=1234", log(2).get(1));
    }

    @Test
    void isNotFiredForAValueSetOnTheServer() {
        // §7.6 / §11.11, the client half: the server's write reaches the client, which must
        // not answer with a completion — or the app's verify handler would loop.
        open("length=6&" + DIGITS);

        click("server-set");

        assertEquals(List.of("value 987654 server"), logNow());
        assertEquals("987654", input().inputValue());
    }

    @Test
    void sendsAServerClearAfterACompletion() {
        // The hazard F-3's forced-sync design avoids: had the server applied the payload
        // itself, the element's `value` would stay "" and this clear would never be sent.
        open("length=4");
        type("1234");
        log(2);

        click("clear");

        assertEquals("", input().inputValue());
        assertEquals("value  server", logNow().get(2));
    }
}
