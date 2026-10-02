/*
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
package dev.cardoso.codefield;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import com.vaadin.flow.data.binder.Binder;
import com.vaadin.flow.data.value.ValueChangeMode;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

/**
 * The server-side API (SPEC §13). Observed through the public Java API and through the element
 * properties it writes, which are the wire contract with the web component. The client is
 * simulated by writing the element's {@code value} property, as Vaadin's own component tests do.
 */
class CodeFieldTest {

    @Nested
    class Length {

        @Test
        void defaultsToSix() {
            assertEquals(6, new CodeField().getLength());
        }

        @Test
        void isWrittenToTheClient() {
            CodeField field = new CodeField();
            field.setLength(4);

            assertEquals(4, field.getLength());
            assertEquals(4, field.getElement().getProperty("length", 0));
        }

        @Test
        void isValidatedByTheConstructorToo() {
            assertThrows(IllegalArgumentException.class, () -> new CodeField(0));
        }

        @Test
        void rejectsLessThanOne() {
            // §6.5.4 rejects on the client by warning and reverting; a Java caller gets the
            // Java idiom instead.
            CodeField field = new CodeField();

            assertThrows(IllegalArgumentException.class, () -> field.setLength(0));
            assertThrows(IllegalArgumentException.class, () -> field.setLength(-1));
            assertEquals(6, field.getLength());
        }
    }

    /**
     * §6.5 on the server. The client sanitises a programmatic value too, but fires no
     * {@code change} for it (§7.7), so in ON_CHANGE mode its adjustment never syncs back: the
     * server must apply the same rules itself or hold a value the field does not show.
     */
    @Nested
    class ValueSetter {

        private final ListAppender<ILoggingEvent> log = new ListAppender<>();
        private final Logger logger = (Logger) LoggerFactory.getLogger(CodeField.class);

        @BeforeEach
        void captureWarnings() {
            log.start();
            logger.addAppender(log);
        }

        @AfterEach
        void releaseWarnings() {
            logger.detachAppender(log);
        }

        private List<String> warnings() {
            return log.list.stream().filter(e -> e.getLevel() == Level.WARN)
                    .map(ILoggingEvent::getFormattedMessage).toList();
        }

        @Test
        void stripsWhitespace() {
            CodeField field = new CodeField();
            field.setValue("12 34");
            assertEquals("1234", field.getValue());
        }

        @Test
        void stripsCharactersThePatternRejects() {
            CodeField field = new CodeField();
            field.setAllowedCharPattern("[0-9]");

            field.setValue("12-34");

            assertEquals("1234", field.getValue());
        }

        @Test
        void sanitisesBeforeTruncating() {
            // §7.8.4: truncating "123-456" first would keep "12345", one digit short.
            CodeField field = new CodeField();
            field.setAllowedCharPattern("[0-9]");

            field.setValue("123-456");

            assertEquals("123456", field.getValue());
        }

        @Test
        void truncatesToLength() {
            CodeField field = new CodeField();
            field.setLength(4);

            field.setValue("123456");

            assertEquals("1234", field.getValue());
        }

        @Test
        void writesTheEffectiveValueToTheClient() {
            CodeField field = new CodeField();
            field.setLength(4);

            field.setValue("12 3456");

            assertEquals("1234", field.getElement().getProperty("value"));
        }

        @Test
        void warnsNamingTheInputAndTheResult() {
            // §6.5.2: silent adjustment through a Binder-bound bean is data loss with no
            // symptom.
            CodeField field = new CodeField();
            field.setLength(4);

            field.setValue("123456");

            assertEquals(1, warnings().size());
            assertTrue(warnings().get(0).contains("\"123456\""), warnings().get(0));
            assertTrue(warnings().get(0).contains("\"1234\""), warnings().get(0));
        }

        @Test
        void shrinkingLengthTruncatesTheValueAndWarns() {
            // §6.5.3, and PLAN F-2's exit: the server model must agree with the client,
            // which truncates on the same change — and say so through a value change, which
            // is what reaches a Binder-bound bean (SPEC §13.2).
            CodeField field = new CodeField();
            field.setValue("123456");
            List<String> changes = new ArrayList<>();
            field.addValueChangeListener(e -> changes.add(e.getOldValue() + "->" + e.getValue()));

            field.setLength(4);

            assertEquals("1234", field.getValue());
            assertEquals(List.of("123456->1234"), changes);
            assertEquals(1, warnings().size());
        }

        @Test
        void growingLengthLeavesTheValueAlone() {
            CodeField field = new CodeField();
            field.setLength(4);
            field.setValue("1234");

            field.setLength(6);

            assertEquals("1234", field.getValue());
            assertTrue(warnings().isEmpty(), warnings().toString());
        }

        @Test
        void narrowingThePatternFiltersTheValue() {
            // SPEC §13.2: narrowing allowedCharPattern under an existing value filters it on
            // the client, and must do so on the server too.
            CodeField field = new CodeField();
            field.setValue("12ab");
            List<String> changes = new ArrayList<>();
            field.addValueChangeListener(e -> changes.add(e.getOldValue() + "->" + e.getValue()));

            field.setAllowedCharPattern("[0-9]");

            assertEquals("12", field.getValue());
            assertEquals(List.of("12ab->12"), changes);
            assertEquals(1, warnings().size());
        }

        @Test
        void stripsExactlyJavaScriptsWhitespace() {
            // The client's /\s/u: U+00A0, U+3000 and U+FEFF (a code copied out of an email or
            // a PDF) are whitespace; U+0085 is not, although Java's Unicode \s says it is.
            CodeField field = new CodeField();

            field.setValue("1\u00A02\u30003\uFEFF4");
            assertEquals("1234", field.getValue());

            field.setValue("1\u00852");
            assertEquals("1\u00852", field.getValue());
        }

        @Test
        void countsCharactersNotUtf16Units() {
            // As the client since the F-2 review: one emoji is one cell.
            CodeField field = new CodeField();
            field.setLength(2);

            field.setValue("1\uD83D\uDE00");
            assertEquals("1\uD83D\uDE00", field.getValue());
            assertTrue(field.isComplete());

            field.setValue("\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00");
            assertEquals("\uD83D\uDE00\uD83D\uDE00", field.getValue());
        }

        @Test
        void keepsLineBreaksInTheValueOutOfTheLog() {
            // The value can come from an untrusted source through a Binder; a raw line break
            // in it would let it forge a log line.
            CodeField field = new CodeField();
            field.setLength(4);

            field.setValue("12\n34\r\nFORGED");

            assertEquals(1, warnings().size());
            assertFalse(warnings().get(0).contains("\n"), warnings().get(0));
            assertFalse(warnings().get(0).contains("\r"), warnings().get(0));
        }

        @Test
        void doesNotWarnWhenNothingChanged() {
            CodeField field = new CodeField();
            field.setValue("1234");
            assertTrue(warnings().isEmpty(), warnings().toString());
        }
    }

    @Nested
    class Value {

        @Test
        void isEmptyStringWhenEmpty() {
            // SPEC §13.2: "", not null, as TextField.
            CodeField field = new CodeField();
            assertEquals("", field.getValue());
            assertTrue(field.isEmpty());
        }

        @Test
        void takesAValueFromTheClient() {
            CodeField field = new CodeField();

            field.getElement().setProperty("value", "1234");

            assertEquals("1234", field.getValue());
        }

        @Test
        void isCompleteWhenTheValueFillsEveryCell() {
            CodeField field = new CodeField();
            field.setLength(4);

            field.setValue("123");
            assertFalse(field.isComplete());

            field.setValue("1234");
            assertTrue(field.isComplete());
        }

        @Test
        void isCompleteFollowsALengthChange() {
            CodeField field = new CodeField();
            field.setValue("1234");
            assertFalse(field.isComplete());

            field.setLength(4);

            assertTrue(field.isComplete());
        }
    }

    @Nested
    class ValueChangeModeTest {

        @Test
        void defaultsToOnChange() {
            // SPEC §13: otherwise a 6-digit code costs six round-trips.
            assertEquals(ValueChangeMode.ON_CHANGE, new CodeField().getValueChangeMode());
        }

        // Which client event synchronises `value` is observable only through Flow internals
        // or a real browser; F-5's ITs cover it. Vaadin's own field tests do the same.
    }

    @Nested
    class BinderIntegration {

        static class Bean {
            private String code = "";

            public String getCode() {
                return code;
            }

            public void setCode(String code) {
                this.code = code;
            }
        }

        @Test
        void writesTheSanitisedValueBackToTheBean() {
            // The server model must agree with what the field shows: a bean holding "12-34"
            // while the field shows "1234" is §6.5's silent divergence.
            CodeField field = new CodeField();
            field.setAllowedCharPattern("[0-9]");
            Binder<Bean> binder = new Binder<>(Bean.class);
            binder.forField(field).bind(Bean::getCode, Bean::setCode);
            Bean bean = new Bean();
            bean.setCode("12-34");

            binder.setBean(bean);

            assertEquals("1234", field.getValue());
            assertEquals("1234", bean.getCode());
        }

        @Test
        void writesAClientValueToTheBean() {
            CodeField field = new CodeField();
            Binder<Bean> binder = new Binder<>(Bean.class);
            binder.forField(field).bind(Bean::getCode, Bean::setCode);
            Bean bean = new Bean();
            binder.setBean(bean);

            field.getElement().setProperty("value", "1234");

            assertEquals("1234", bean.getCode());
        }
    }

    @Nested
    class Configuration {

        @Test
        void oneTimeCodeIsOffByDefaultAndWrittenToTheClient() {
            // Opt-in (SPEC §1.1): the same UI serves redeem codes, which are not OTPs.
            CodeField field = new CodeField();
            assertFalse(field.isOneTimeCode());

            field.setOneTimeCode(true);

            assertTrue(field.isOneTimeCode());
            assertTrue(field.getElement().getProperty("oneTimeCode", false));
        }

        @Test
        void inputModeDefaultsToNumericAndIsWrittenToTheClient() {
            CodeField field = new CodeField();
            assertEquals("numeric", field.getInputMode());

            field.setInputMode("text");

            assertEquals("text", field.getInputMode());
            assertEquals("text", field.getElement().getProperty("inputMode"));
        }

        @Test
        void clearEmptiesTheValue() {
            CodeField field = new CodeField();
            field.setValue("1234");

            field.clear();

            assertEquals("", field.getValue());
        }
    }

    @Nested
    class Constructors {

        @Test
        void label() {
            assertEquals("Code", new CodeField("Code").getLabel());
        }

        @Test
        void length() {
            assertEquals(4, new CodeField(4).getLength());
        }

        @Test
        void labelAndValueChangeListener() {
            List<String> values = new ArrayList<>();
            CodeField field = new CodeField("Code", e -> values.add(e.getValue()));

            field.setValue("1234");

            assertEquals("Code", field.getLabel());
            assertEquals(List.of("1234"), values);
        }
    }

    /**
     * allowedCharPattern is JavaScript regex source (SPEC §6.1), and the server approximates it
     * with java.util.regex. A pattern the server cannot compile is refused at the call site,
     * rather than accepted and then thrown from every later setValue.
     */
    @Nested
    class AllowedCharPattern {

        @Test
        void rejectsAnInvalidPatternAndKeepsThePreviousOne() {
            CodeField field = new CodeField();
            field.setAllowedCharPattern("[0-9]");
            field.setValue("12");

            assertThrows(IllegalArgumentException.class, () -> field.setAllowedCharPattern("[0-9"));

            assertEquals("[0-9]", field.getAllowedCharPattern());
            field.setValue("3a4");
            assertEquals("34", field.getValue());
        }

        @Test
        void rejectsJavaScriptOnlySyntax() {
            // Valid with JavaScript's u flag, unknown to java.util.regex.
            CodeField field = new CodeField();
            assertThrows(IllegalArgumentException.class,
                    () -> field.setAllowedCharPattern("\\p{Emoji}"));
            assertEquals("", field.getAllowedCharPattern() == null ? "" : field.getAllowedCharPattern());
        }
    }
}
