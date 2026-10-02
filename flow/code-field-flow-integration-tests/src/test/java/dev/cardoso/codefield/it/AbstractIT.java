/*
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
package dev.cardoso.codefield.it;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.Parameter;
import org.junit.jupiter.params.ParameterizedClass;
import org.junit.jupiter.params.provider.ValueSource;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;

/**
 * Base for F-5's ITs (SPEC §14.4): Playwright for Java, in Chromium and Firefox. Tests drive
 * real input on the slotted input and read the server through {@link FieldView}'s rendered
 * text. They never read the shadow root or Flow internals.
 */
@ParameterizedClass(name = "{0}")
@ValueSource(strings = { "chromium", "firefox" })
abstract class AbstractIT {

    /**
     * The first request waits for Vaadin to npm-install and build the dev bundle, which on a
     * cold CI runner takes minutes.
     */
    private static final double FIRST_LOAD_MS = 300_000;

    private static final String MOD = System.getProperty("os.name").startsWith("Mac") ? "Meta"
            : "Control";

    /** {@code allowedCharPattern=[0-9]}, URL-encoded for {@link #open(String)}. */
    protected static final String DIGITS = "pattern=%5B0-9%5D";

    @Parameter
    String browserName;

    private Playwright playwright;
    private Browser browser;
    protected Page page;

    @BeforeEach
    void launch() {
        playwright = Playwright.create();
        BrowserType type = "firefox".equals(browserName) ? playwright.firefox()
                : playwright.chromium();
        browser = type.launch();
        page = browser.newContext().newPage();
    }

    @AfterEach
    void close() {
        playwright.close();
    }

    /** Opens {@link FieldView} with the given query, e.g. {@code "length=4&mode=EAGER"}. */
    protected void open(String query) {
        String port = System.getProperty("it.port", "8890");
        page.navigate("http://localhost:" + port + "/field" + (query.isEmpty() ? "" : "?" + query),
                new Page.NavigateOptions().setTimeout(FIRST_LOAD_MS));
        page.waitForFunction("() => customElements.get('dc-code-field')"
                + " && document.querySelector('#field > input')", null,
                new Page.WaitForFunctionOptions().setTimeout(FIRST_LOAD_MS));
        // Typing while the page's own first requests are in flight lets a commit be
        // overtaken by the next one, and the server never sees it.
        settle();
    }

    /** The real input — light DOM, slotted, so no shadow-root access is needed. */
    protected Locator input() {
        return page.locator("#field > input");
    }

    protected void type(String text) {
        input().focus();
        page.keyboard().type(text);
    }

    protected void blur() {
        input().blur();
    }

    /** Puts {@code text} on the real clipboard by copying it from the view's scratch input. */
    protected void copy(String text) {
        Locator scratch = page.locator("#scratch");
        scratch.fill(text);
        scratch.focus();
        page.keyboard().press(MOD + "+A");
        page.keyboard().press(MOD + "+C");
    }

    protected void paste() {
        input().focus();
        page.keyboard().press(MOD + "+V");
    }

    /** Clicks a server-action button and waits for the server's answer. */
    protected void click(String button) {
        page.locator("#" + button).click();
        settle();
    }

    /** The server's event log, waiting until it has at least {@code lines} lines. */
    protected List<String> log(int lines) {
        page.waitForFunction("n => document.querySelector('#log').textContent"
                + ".split('\\n').filter(Boolean).length >= n", lines);
        return logNow();
    }

    /**
     * The server's event log as it is now, after the server has answered. A frame passes
     * first, so a request the client is about to send — after Lit applies a server update —
     * has left before the wait, and an assertion that nothing arrived is not a false green.
     */
    protected List<String> logNow() {
        page.evaluate("() => new Promise(r => requestAnimationFrame(() => setTimeout(r)))");
        settle();
        return List.of(page.locator("#log").textContent().split("\n")).stream()
                .filter(l -> !l.isEmpty()).toList();
    }

    protected String state() {
        settle();
        return page.locator("#state").textContent();
    }

    protected String bean() {
        settle();
        return page.locator("#bean").textContent();
    }

    /** Waits until Flow has no request in flight, so what the view shows is the server's. */
    protected void settle() {
        page.waitForFunction("() => window.Vaadin && window.Vaadin.Flow"
                + " && Object.values(window.Vaadin.Flow.clients).every(c => !c.isActive())");
    }
}
