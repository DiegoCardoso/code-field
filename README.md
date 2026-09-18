# `<dc-code-field>`

A single-value field for entering short fixed-length codes — one-time passwords, 2FA/TOTP
codes, email verification codes, PINs, redeem and license keys — rendered as a row of
per-character cells, for **Vaadin 25**.

> **Status: in progress, unpublished.** The web component types, selects, pastes, deletes and
> renders its cells; clicking a cell places the caret by native hit testing. Validation and
> events (`W-7`), the theme stylesheet (`W-8`) and the whole Flow module are still to come,
> and nothing is published to npm or Maven.
>
> [PLAN.md](./PLAN.md) opens with the current state of every task, the open issues, and the
> spec claims that measurement disproved. Read that first.

## What makes it different

One real `<input>` in the light DOM, visually transparent, with decorative cells rendered
over it — not _N_ inputs of `maxlength="1"`. That is why one tab stop, one accessible name,
SMS autofill, password-manager and TOTP fill, partial paste, select-all and shift+arrow all
work natively instead of being reimplemented. [SPEC.md §4](./SPEC.md) has the comparison.

## Repository layout

| Path             | What                                                                               |
| ---------------- | ---------------------------------------------------------------------------------- |
| `web/`           | The web component, npm `@cardoso/code-field`                                       |
| `flow/`          | The Vaadin Flow Java module, Maven `dev.cardoso:code-field-flow` (not yet created) |
| `SPEC.md`        | Decision-locked specification                                                      |
| `PLAN.md`        | Delivery plan, task by task                                                        |
| `P0-FINDINGS.md` | What the Phase 0 probes established                                                |
| `docs/adr/`      | Architecture decisions                                                             |
| `docs/design/`   | Visual direction                                                                   |

## Development

```sh
npm install
npm test          # unit tests (Chromium)
npm run lint      # eslint + prettier
npm start         # dev server, opens the dev page
```

Firefox coverage is a separate config, because it carries the backward-selection case
Chromium cannot exercise:

```sh
npm test --workspace web -- --config web-test-runner-firefox.config.js
```

## Licence

Apache-2.0 — matching Vaadin's own components, so upstreaming stays possible.
