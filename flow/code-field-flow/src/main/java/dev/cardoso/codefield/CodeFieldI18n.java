/*
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
package dev.cardoso.codefield;

import java.io.Serializable;

/**
 * Error messages for {@link CodeField}'s two constraints (SPEC §8). Plain strings only: a
 * function could not cross to the client, and validation runs on the server anyway.
 * <p>
 * An error message set with {@link CodeField#setErrorMessage(String)} takes priority over
 * both.
 */
public class CodeFieldI18n implements Serializable {

    private String requiredErrorMessage;

    private String incompleteErrorMessage;

    /**
     * @return the message for a required field left empty, or {@code null}
     */
    public String getRequiredErrorMessage() {
        return requiredErrorMessage;
    }

    /**
     * Sets the message shown when a required field is empty.
     *
     * @param requiredErrorMessage
     *            the message, or {@code null} for none
     * @return this object, for chaining
     */
    public CodeFieldI18n setRequiredErrorMessage(String requiredErrorMessage) {
        this.requiredErrorMessage = requiredErrorMessage;
        return this;
    }

    /**
     * @return the message for a partially entered code, or {@code null}
     */
    public String getIncompleteErrorMessage() {
        return incompleteErrorMessage;
    }

    /**
     * Sets the message shown when the code is only partly entered.
     *
     * @param incompleteErrorMessage
     *            the message, or {@code null} for none
     * @return this object, for chaining
     */
    public CodeFieldI18n setIncompleteErrorMessage(String incompleteErrorMessage) {
        this.incompleteErrorMessage = incompleteErrorMessage;
        return this;
    }
}
