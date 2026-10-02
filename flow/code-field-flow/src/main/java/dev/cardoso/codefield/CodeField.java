/*
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
package dev.cardoso.codefield;

import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.vaadin.flow.component.AbstractField;
import com.vaadin.flow.component.AbstractSinglePropertyField;
import com.vaadin.flow.component.Focusable;
import com.vaadin.flow.component.HasAriaLabel;
import com.vaadin.flow.component.HasHelper;
import com.vaadin.flow.component.HasLabel;
import com.vaadin.flow.component.HasSize;
import com.vaadin.flow.component.HasStyle;
import com.vaadin.flow.component.Tag;
import com.vaadin.flow.component.dependency.JsModule;
import com.vaadin.flow.component.dependency.NpmPackage;
import com.vaadin.flow.component.shared.HasAllowedCharPattern;
import com.vaadin.flow.component.shared.HasTooltip;
import com.vaadin.flow.component.shared.HasValidationProperties;
import com.vaadin.flow.component.shared.InputField;
import com.vaadin.flow.data.binder.HasValidator;
import com.vaadin.flow.data.value.HasValueChangeMode;
import com.vaadin.flow.data.value.ValueChangeMode;

/**
 * A single-value field for short fixed-length codes: one-time passwords, verification codes,
 * redeem codes. Server-side API for the {@code <dc-code-field>} web component.
 * <p>
 * The value is one string, without separators; the empty value is {@code ""}. Lengths count
 * characters (code points), so an emoji fills one cell — though editing next to one in the
 * browser is a known limitation of the web component (SPEC §6.5.6). Values set from Java are sanitised
 * and truncated on the server by the rules the web component applies (see
 * {@link #setValue(String)}), so a value set on the server is the value the field shows.
 * Values arriving from the client are taken as they are: the web component has already applied
 * those rules, but a tampered client could send anything, so validate before acting on one.
 * <p>
 * The value synchronises on the client's {@code change} by default
 * ({@link ValueChangeMode#ON_CHANGE}), so while the user is typing {@link #getValue()} and
 * {@link #isComplete()} still return the last committed value. Completing the code commits it.
 */
@Tag("dc-code-field")
@NpmPackage(value = "@cardoso/code-field", version = "file:../../web")
@JsModule("@cardoso/code-field/src/code-field.js")
public class CodeField extends AbstractSinglePropertyField<CodeField, String>
        implements Focusable<CodeField>, HasAllowedCharPattern, HasAriaLabel, HasHelper,
        HasLabel, HasSize, HasStyle, HasTooltip, HasValidationProperties, HasValidator<String>,
        HasValueChangeMode,
        InputField<AbstractField.ComponentValueChangeEvent<CodeField, String>, String> {
    // SPEC §13 lists HasLabel, HasHelper, HasSize, HasStyle and HasTooltip explicitly although
    // InputField already extends them; kept so the declaration reads like the spec.
    // HasThemeVariant<CodeFieldVariant> arrives with the variant enum in F-3.

    private static final Logger LOGGER = LoggerFactory.getLogger(CodeField.class);

    private static final int DEFAULT_LENGTH = 6;

    /**
     * Exactly the characters JavaScript's {@code \s} matches (ECMAScript WhiteSpace and
     * LineTerminator), which the client strips. Neither of Java's {@code \s} variants is the
     * same set: the ASCII one misses U+00A0 and U+FEFF, the Unicode one adds U+0085.
     */
    private static final Pattern WHITESPACE = Pattern.compile(
            "[\\t\\n\\u000B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]");

    /**
     * {@link #getAllowedCharPattern()} compiled, or {@code null} for no pattern. Refreshed only
     * by {@link #setAllowedCharPattern(String)}: writing the element property directly
     * bypasses it.
     */
    private Pattern allowed;

    private ValueChangeMode valueChangeMode;

    private int valueChangeTimeout = DEFAULT_CHANGE_TIMEOUT;

    /** Constructs an empty field. */
    public CodeField() {
        super("value", "", false);
        // HasValueChangeMode defines no default, so it is set here, as TextField does.
        setValueChangeMode(ValueChangeMode.ON_CHANGE);
    }

    /**
     * Constructs an empty field with the given label.
     *
     * @param label
     *            the label text
     */
    public CodeField(String label) {
        this();
        setLabel(label);
    }

    /**
     * Constructs an empty field with the given number of cells.
     *
     * @param length
     *            the number of cells, at least 1
     * @throws IllegalArgumentException
     *             if {@code length} is less than 1
     */
    public CodeField(int length) {
        this();
        setLength(length);
    }

    /**
     * Constructs an empty field with the given label and value change listener.
     *
     * @param label
     *            the label text
     * @param listener
     *            the value change listener
     */
    public CodeField(String label,
            ValueChangeListener<ComponentValueChangeEvent<CodeField, String>> listener) {
        this(label);
        addValueChangeListener(listener);
    }

    /**
     * Sets {@code autocomplete="one-time-code"} on the input, which lets iOS and Android offer
     * a code received by SMS. Off by default: the same field serves redeem codes and license
     * keys, which are not one-time passwords.
     *
     * @param oneTimeCode
     *            whether the field holds a one-time code
     */
    public void setOneTimeCode(boolean oneTimeCode) {
        getElement().setProperty("oneTimeCode", oneTimeCode);
    }

    /**
     * Whether the field holds a one-time code.
     *
     * @return {@code true} if {@code autocomplete="one-time-code"} is set
     */
    public boolean isOneTimeCode() {
        return getElement().getProperty("oneTimeCode", false);
    }

    /**
     * Sets the input's {@code inputmode}, which picks the on-screen keyboard.
     *
     * @param inputMode
     *            the input mode, e.g. {@code "numeric"} (the default) or {@code "text"}
     */
    public void setInputMode(String inputMode) {
        getElement().setProperty("inputMode", inputMode);
    }

    /**
     * Gets the input's {@code inputmode}.
     *
     * @return the input mode; {@code "numeric"} unless set
     */
    public String getInputMode() {
        return getElement().getProperty("inputMode", "numeric");
    }

    /**
     * Whether the value fills every cell. Computed from {@link #getValue()} and
     * {@link #getLength()} rather than read from the client's {@code complete} property,
     * which never synchronises on its own; this way it always agrees with {@code getValue()}.
     *
     * @return {@code true} if the value is exactly {@code getLength()} characters (code
     *         points) long
     */
    public boolean isComplete() {
        String value = getValue();
        return value.codePointCount(0, value.length()) == getLength();
    }

    /**
     * {@inheritDoc}
     * <p>
     * The default is {@link ValueChangeMode#ON_CHANGE}: eager synchronisation would cost one
     * round-trip per character.
     */
    @Override
    public ValueChangeMode getValueChangeMode() {
        return valueChangeMode;
    }

    @Override
    public void setValueChangeMode(ValueChangeMode valueChangeMode) {
        this.valueChangeMode = valueChangeMode;
        setSynchronizedEvent(ValueChangeMode.eventForMode(valueChangeMode, "input"));
        applyChangeTimeout();
    }

    @Override
    public void setValueChangeTimeout(int valueChangeTimeout) {
        this.valueChangeTimeout = valueChangeTimeout;
        applyChangeTimeout();
    }

    @Override
    public int getValueChangeTimeout() {
        return valueChangeTimeout;
    }

    private void applyChangeTimeout() {
        ValueChangeMode.applyChangeTimeout(getValueChangeMode(), getValueChangeTimeout(),
                getSynchronizationRegistration());
    }

    /**
     * Sets the number of cells, which is also the maximum length of the value.
     *
     * @param length
     *            the number of cells, at least 1
     * @throws IllegalArgumentException
     *             if {@code length} is less than 1
     */
    public void setLength(int length) {
        if (length < 1) {
            throw new IllegalArgumentException("length must be at least 1, got " + length);
        }
        getElement().setProperty("length", length);
        // §6.5.3: shrinking truncates the value, with the setter's warning. The client
        // truncates too, but reports nothing back.
        reapplyValueRules();
    }

    /**
     * Gets the number of cells.
     *
     * @return the number of cells; 6 unless set
     */
    public int getLength() {
        return getElement().getProperty("length", DEFAULT_LENGTH);
    }

    /**
     * {@inheritDoc}
     * <p>
     * Narrowing the pattern also filters the current value, as the web component does
     * (SPEC §13.2).
     * <p>
     * The pattern is JavaScript regular-expression source, which the web component compiles
     * with the {@code u} flag; the server applies it with {@code java.util.regex}. Ordinary
     * character classes such as {@code [0-9]} or {@code [A-Z0-9]} behave identically. Syntax
     * only one of the two dialects understands is not supported.
     *
     * @throws IllegalArgumentException
     *             if the server cannot compile {@code pattern} — invalid, or JavaScript-only
     *             such as {@code \p{Emoji}}; the previous pattern is kept
     */
    @Override
    public void setAllowedCharPattern(String pattern) {
        Pattern compiled = compile(pattern);
        HasAllowedCharPattern.super.setAllowedCharPattern(pattern);
        allowed = compiled;
        reapplyValueRules();
    }

    private static Pattern compile(String pattern) {
        if (pattern == null || pattern.isEmpty()) {
            return null;
        }
        try {
            // Per character, as the client: ^pattern$ against each one.
            return Pattern.compile("^" + pattern + "$");
        } catch (PatternSyntaxException e) {
            throw new IllegalArgumentException("allowedCharPattern \"" + pattern
                    + "\" cannot be applied on the server: " + e.getDescription(), e);
        }
    }

    /**
     * Clears the value. This is a method only: the field renders no clear button (SPEC §6.1),
     * so an application that wants one composes it into the {@code suffix} slot.
     */
    @Override
    public void clear() {
        super.clear();
    }

    private void reapplyValueRules() {
        setValue(getValue());
    }

    /**
     * Sets the value, sanitised and truncated by the web component's rules (SPEC §6.5):
     * whitespace (as JavaScript's {@code \s}) and characters {@link #getAllowedCharPattern()}
     * rejects are stripped, then the result is cut to {@link #getLength()} characters. If that
     * changes the value, a warning names the input and the result.
     * <p>
     * The server applies the rules itself because the client does not report them back: a
     * programmatic value fires no {@code change} on the client (§7.7), so in
     * {@code ON_CHANGE} mode a client-side adjustment would leave the server holding a value
     * the field does not show.
     *
     * @param value
     *            the new value, not {@code null}; use {@code ""} or {@link #clear()} to empty
     *            the field
     * @throws NullPointerException
     *             if {@code value} is {@code null}, as for {@code TextField}
     */
    @Override
    public void setValue(String value) {
        super.setValue(normalise(value));
    }

    private String normalise(String value) {
        if (value == null) {
            // Passed through so that super rejects it, as TextField does.
            return null;
        }

        String effective = sanitise(value);
        if (effective.codePointCount(0, effective.length()) > getLength()) {
            effective = effective.substring(0, effective.offsetByCodePoints(0, getLength()));
        }

        if (!effective.equals(value)) {
            // §6.5.2: name the input and the result. Silent adjustment through a
            // Binder-bound bean is data loss with no symptom.
            LOGGER.warn("<dc-code-field> value \"{}\" was adjusted to \"{}\" (length {}).",
                    forLog(value), forLog(effective), getLength());
        }
        return effective;
    }

    /** Escapes line breaks, so a value from an untrusted source cannot forge a log line. */
    private static String forLog(String value) {
        return value.replace("\r", "\\r").replace("\n", "\\n");
    }

    /**
     * The server half of SPEC §6.5.1's one sanitiser, and deliberately the same rules as the
     * client's: each character is tested on its own against {@code ^pattern$}.
     */
    private String sanitise(String value) {
        StringBuilder result = new StringBuilder();
        value.codePoints().forEach(codePoint -> {
            String character = Character.toString(codePoint);
            if (WHITESPACE.matcher(character).matches()) {
                return;
            }
            if (allowed != null && !allowed.matcher(character).matches()) {
                return;
            }
            result.appendCodePoint(codePoint);
        });
        return result.toString();
    }
}
