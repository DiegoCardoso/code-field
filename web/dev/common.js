/**
 * @license
 * Copyright (c) 2026 Diego Cardoso
 * SPDX-License-Identifier: Apache-2.0
 */
import { css, html, LitElement } from 'lit';

/**
 * Theme switcher for the dev pages. Adapted from `vaadin/web-components`'
 * `dev/common.js` (Apache-2.0) so switching themes here works exactly as it does
 * there — same `?theme=<theme>:<scheme>` contract, same buttons.
 *
 * It only writes the URL parameter and reloads; `web-dev-server.config.js` is
 * what applies the theme.
 */
class ThemeSwitcher extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      display: flex;
      gap: 0.25rem;
      padding: 0.5rem;
      background: white;
      border-radius: 0.5rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      z-index: 9999;
    }

    button {
      padding: 0.25rem 0.5rem;
      border: 1px solid #ccc;
      border-radius: 0.25rem;
      background: #f5f5f5;
      cursor: pointer;
      font-size: 0.75rem;
      color: #000;
    }

    button:hover {
      background: #e5e5e5;
    }

    button[active] {
      background: #0066cc;
      color: white;
      border-color: #0066cc;
    }

    button svg {
      width: 1rem;
      height: 1rem;
      vertical-align: middle;
    }
  `;

  get currentTheme() {
    return document.documentElement.dataset.theme?.split(':')[0] || 'base';
  }

  get currentColorScheme() {
    return document.documentElement.dataset.theme?.split(':')[1] || 'light';
  }

  renderColorSchemeIcon() {
    if (this.currentColorScheme === 'dark') {
      return html`<svg viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"
        />
      </svg>`;
    }
    return html`<svg viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 0 0 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"
      />
    </svg>`;
  }

  render() {
    return html`
      <button ?active=${this.currentTheme.startsWith('base')} @click=${() => this.switchTheme('base')}>Base</button>
      <button ?active=${this.currentTheme.startsWith('lumo')} @click=${() => this.switchTheme('lumo')}>Lumo</button>
      <button ?active=${this.currentTheme.startsWith('aura')} @click=${() => this.switchTheme('aura')}>Aura</button>
      <button
        @click=${() => this.toggleColorScheme()}
        title="${this.currentColorScheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}"
      >
        ${this.renderColorSchemeIcon()}
      </button>
    `;
  }

  switchTheme(theme) {
    this.#navigate(`${theme}:${this.currentColorScheme}`);
  }

  toggleColorScheme() {
    this.#navigate(`${this.currentTheme}:${this.currentColorScheme === 'dark' ? 'light' : 'dark'}`);
  }

  #navigate(theme) {
    const url = new URL(window.location);
    url.searchParams.set('theme', theme);
    history.replaceState(null, '', url);
    location.reload();
  }
}

customElements.define('theme-switcher', ThemeSwitcher);
