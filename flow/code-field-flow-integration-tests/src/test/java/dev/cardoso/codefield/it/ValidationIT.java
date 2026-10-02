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
 * Server validation (SPEC §8, ADR-0002) as a user meets it: both constraint messages, Binder,
 * and an i18n switch while an error shows.
 */
class ValidationIT extends AbstractIT {

    @Test
    void flagsAPartialCodeOnBlurAndKeepsItOutOfTheBean() {
        open("length=4");

        type("12");
        blur();

        assertTrue(state().contains("invalid=true error=The code is too short"), state());
        assertEquals("", bean());
        // The client shows the server's verdict: it validates nothing itself (manualValidation).
        assertEquals("", page.locator("#field").getAttribute("invalid"));
        assertEquals("The code is too short",
                page.locator("#field > [slot=error-message]").textContent());
    }

    @Test
    void clearsTheErrorAndFillsTheBeanOnceComplete() {
        open("length=4");
        type("12");
        blur();
        // Wait for the server to record "12" before typing on. Flow coalesces a property
        // sync queued while a request is in flight, so without the wait the server may see
        // only "1234" — measured: 9 of 30 runs, mostly Chromium. Not a lost keystroke.
        log(1);

        type("34");

        log(3);
        assertTrue(state().contains("invalid=false"), state());
        assertEquals("1234", bean());
    }

    @Test
    void flagsAnEmptiedRequiredField() {
        open("length=4&required=true&binder=false");
        type("12");
        blur();
        log(1);

        input().focus();
        page.keyboard().press("Backspace");
        page.keyboard().press("Backspace");
        blur();

        assertTrue(state().contains("invalid=true error=Enter the code"), state());
    }

    @Test
    void switchesTheShownMessageWithTheLocale() {
        open("length=4");
        type("12");
        blur();

        click("french");

        assertTrue(state().contains("error=Code trop court"), state());
        assertEquals("Code trop court",
                page.locator("#field > [slot=error-message]").textContent());
    }
}
