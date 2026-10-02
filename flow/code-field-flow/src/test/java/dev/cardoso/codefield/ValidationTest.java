/*
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
package dev.cardoso.codefield;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.vaadin.flow.data.binder.Binder;
import com.vaadin.flow.data.binder.BinderValidationStatus;

/**
 * SPEC §8 on the server, hand-rolled per ADR-0002: two constraints, two i18n messages, and a
 * developer-set error message is never overwritten.
 */
class ValidationTest {

    private CodeField field;

    @BeforeEach
    void setUp() {
        field = new CodeField(4);
        field.setI18n(new CodeFieldI18n().setRequiredErrorMessage("Enter the code")
                .setIncompleteErrorMessage("The code is too short"));
    }

    @Test
    void handsValidationToTheServer() {
        // Otherwise the client validates too, with its own i18n, and the two disagree.
        assertTrue(field.getElement().getProperty("manualValidation", false));
    }

    @Test
    void keepsTheI18nObject() {
        CodeFieldI18n i18n = new CodeFieldI18n();
        field.setI18n(i18n);
        assertEquals(i18n, field.getI18n());
    }

    @Test
    void marksAPartialCodeIncomplete() {
        field.setValue("12");

        assertTrue(field.isInvalid());
        assertEquals("The code is too short", field.getErrorMessage());
    }

    @Test
    void marksAnEmptiedRequiredFieldRequired() {
        field.setRequiredIndicatorVisible(true);
        field.setValue("12");

        field.setValue("");

        assertTrue(field.isInvalid());
        assertEquals("Enter the code", field.getErrorMessage());
    }

    @Test
    void clearsTheErrorOnceTheCodeIsComplete() {
        field.setValue("12");

        field.setValue("1234");

        assertFalse(field.isInvalid());
        assertEquals("", field.getErrorMessage());
    }

    @Test
    void treatsAnEmptyOptionalFieldAsValid() {
        field.setValue("12");

        field.setValue("");

        assertFalse(field.isInvalid());
    }

    @Test
    void keepsAnErrorMessageTheDeveloperSet() {
        // ADR-0002: the one ValidationController behaviour we must reproduce.
        field.setErrorMessage("Ask your administrator for a code");

        field.setValue("12");

        assertTrue(field.isInvalid());
        assertEquals("Ask your administrator for a code", field.getErrorMessage());
    }

    @Test
    void revalidatesWhenLengthGrowsUnderACompleteCode() {
        field.setValue("1234");

        field.setLength(6);

        assertTrue(field.isInvalid());
        assertEquals("The code is too short", field.getErrorMessage());
    }

    @Test
    void doesNotFlagAnUntouchedEmptyFieldWhenItBecomesRequired() {
        // A required field must not load showing an error before the user has done anything.
        field.setRequiredIndicatorVisible(true);

        assertFalse(field.isInvalid());
    }

    @Test
    void leavesValidationAloneInManualMode() {
        field.setManualValidation(true);

        field.setValue("12");

        assertFalse(field.isInvalid());
    }

    @Test
    void reportsTheIncompleteConstraintThroughBinder() {
        // Binder runs the default validator before its own; it skips `required`, which
        // Binder implements itself with asRequired().
        Binder<String[]> binder = new Binder<>();
        binder.forField(field).bind(b -> b[0], (b, v) -> b[0] = v);
        binder.setBean(new String[] { "" });

        field.setValue("12");
        BinderValidationStatus<String[]> status = binder.validate();

        assertFalse(status.isOk());
        assertEquals("The code is too short",
                status.getFieldValidationErrors().get(0).getMessage().orElse(null));
    }

    @Test
    void leavesRequiredToBinder() {
        field.setRequiredIndicatorVisible(true);
        Binder<String[]> binder = new Binder<>();
        binder.forField(field).bind(b -> b[0], (b, v) -> b[0] = v);
        binder.setBean(new String[] { "" });

        assertTrue(binder.validate().isOk());
    }

    @Test
    void countsAPartialEmojiCodeInCharacters() {
        // Why the incomplete check is hand-written: ValidationUtil's min-length check counts
        // UTF-16 units, and would call one emoji in a two-cell field complete.
        CodeField emoji = new CodeField(2);

        emoji.setValue("\uD83D\uDE00");
        assertTrue(emoji.isInvalid());

        emoji.setValue("\uD83D\uDE00\uD83D\uDE00");
        assertFalse(emoji.isInvalid());
    }

    @Test
    void showsTheNewI18nMessageAtOnce() {
        // A locale switch must not leave the old language's error on screen until the next
        // commit, which in ON_CHANGE mode can be a long time.
        field.setValue("12");

        field.setI18n(new CodeFieldI18n().setIncompleteErrorMessage("Code trop court"));

        assertEquals("Code trop court", field.getErrorMessage());
    }

    @Test
    void resumesItsOwnMessagesOnceTheDeveloperClearsTheirs() {
        field.setErrorMessage("Ask your administrator for a code");
        field.setValue("12");

        field.setErrorMessage("");
        field.setValue("123");

        assertEquals("The code is too short", field.getErrorMessage());
    }

    @Test
    void revalidatesAPartialCodeWhenItBecomesRequired() {
        field.setManualValidation(true);
        field.setValue("12");
        field.setManualValidation(false);

        field.setRequiredIndicatorVisible(true);

        assertTrue(field.isInvalid());
    }

    @Test
    void clearsTheErrorWhenLengthShrinksToFitAPartialCode() {
        field.setValue("12");

        field.setLength(2);

        assertFalse(field.isInvalid());
    }

    @Test
    void isInvalidWithAnEmptyMessageWithoutI18n() {
        CodeField bare = new CodeField(4);

        bare.setValue("12");

        assertTrue(bare.isInvalid());
        assertEquals("", bare.getErrorMessage());
    }

    @Test
    void keepsAPartialCodeOutOfABinderBean() {
        // The §6.5 trade-off made visible: the field shows the sanitised partial code, but
        // Binder will not write an invalid value to the bean.
        CodeField six = new CodeField();
        six.setAllowedCharPattern("[0-9]");
        Binder<String[]> binder = new Binder<>();
        binder.forField(six).bind(b -> b[0], (b, v) -> b[0] = v);
        String[] bean = { "" };
        binder.setBean(bean);

        six.setValue("12-34");

        assertEquals("1234", six.getValue());
        assertTrue(six.isInvalid());
        assertEquals("", bean[0]);
    }
}
