# Phase 0 — Findings

Probe: `@vaadin/*` npm packages installed and read directly (`field-base`, `component-base`,
`vaadin-themable-mixin`, `input-container`, `text-field`); Maven sources jars for
`vaadin-text-field-flow`, `vaadin-flow-components-base`, `flow-server`, `flow-data`.

---

## `P0-5` — Version pin: **RESOLVED — and the original answer was wrong**

**Vaadin 25 is GA.** The compounding risk (deep-importing unversioned internals *from a
moving pre-release base*) does not apply. 25.3 is in beta/rc, so there is a known next bump
for the canary test to guard.

But the first pass read npm `dist-tags` and assumed the Java platform followed. It does not:

| | npm | Maven Central |
|---|---|---|
| Latest 25.2.x | **25.2.12** | **25.2.8** |
| `25.2.10` published? | yes | **never** |

The two release lines are **deliberately decoupled**. Vaadin's own Java artifact
`vaadin-text-field-flow:25.2.8` declares `@NpmPackage(value = "@vaadin/text-field", version =
"25.2.11")` — the Java release points at a *newer* npm patch than its own version. So
"identical in both repos" was never a discipline Vaadin itself keeps, and `25.2.10` was an
npm-only version that has no Java counterpart at all.

**Resolution — one bump policy, two pins:**

- Java / Maven: platform **`25.2.8`** (the newest published).
- `@NpmPackage`: **`25.2.11`**, mirroring what the 25.2.8 platform declares.
- Web `package.json`: `@vaadin/*` as **`peerDependencies: "^25.2.0"`**, exact versions in
  `devDependencies`. See [ADR-0001](./docs/adr/0001-vaadin-deps-are-peer-ranges-not-exact-pins.md)
  — exact-pinning a dependency the host application already owns makes npm install a **second
  copy** of `field-base`, giving two `InputMixin` class identities in one app, which the canary
  test cannot see.

`@vaadin/field-base` declares **no `exports` map** (`"exports": null`, `files: ["src", …]`),
so deep imports of `@vaadin/field-base/src/*.js` are unrestricted. The coupling is to
internal *API stability*, not to packaging — which is why the canary test, not the version
string, is the safety mechanism.

**JDK: 21.** `flow-project`'s POM sets `maven.compiler.release = 21`; `TextField.class` is
bytecode major 65. Pin it explicitly rather than floating on the ambient JDK.

---

## `P0-2` — Third-party Aura authoring: **RESOLVED — and the spec was wrong**

**Vaadin 25 has no `theme/` directories at all.** `find . -type d -name theme` across every
installed package returns nothing. `@vaadin/text-field` ships only `src/`.

The 25 model:

1. **Components ship their own base styles** as plain Lit `css`, parameterised by
   `--vaadin-*` custom properties — e.g. `@vaadin/field-base/src/styles/input-field-shared-styles.js`,
   consumed by `vaadin-text-field.js` as `inputFieldShared`.
2. **Themes are app-level token layers.** Lumo and Aura set the `--vaadin-*` properties; they
   do not carry per-component style modules.
3. `ThemeDetectionMixin` (`@vaadin/vaadin-themable-mixin/vaadin-theme-detection-mixin.js`) is
   **public and documented for exactly our use case** — it stamps
   `data-application-theme="lumo|aura"` on the host "which can be used in component styles to
   apply theme-specific styling."
4. `LumoInjectionMixin` and `ThemeDetector` are explicitly **"For internal use only. Do not
   use in custom components."** Do not touch either.

### Consequence: SPEC §9 is wrong, and the work shrinks

SPEC §9 says "the component ships **no visual opinion**; Lumo and Aura each style it." That
is the Vaadin 24 model. In 25 it inverts: **we ship the base styles**, and the themes only
supply tokens.

So there is no "implement two themes" task. There is:

- **one** base stylesheet authored against `--vaadin-*` conventions (reuse the existing
  `--vaadin-input-field-*` tokens the field chrome already consumes, and define
  `--vaadin-code-field-cell-*` for what is new), and
- **optionally** a few `[data-application-theme='aura']` rules via `ThemeDetectionMixin`,
  only where token parameterisation genuinely cannot express the difference.

`W-8` is materially smaller than planned, and SPEC §9's "Phase 0 gate — not implementable"
block is lifted. The fallback scope decision (Lumo-only v1, Aura v1.1) is **not needed**.

---

## `P0-3` — `field-base` integration: **partially resolved, one blocking conflict found**

### Mixin names in 25.x (SPEC §4.1 needs correcting)

`field-base/src/` provides: `input-mixin`, `input-control-mixin`, `input-constraints-mixin`,
`input-field-mixin`, `field-mixin`, `label-mixin`, `validate-mixin`, `pattern-mixin`,
`clear-button-mixin`, `checked-mixin`, plus `input-controller`, `labelled-input-controller`,
`error-controller`, `helper-controller`, `label-controller`,
`virtual-keyboard-controller`, and `src/styles/*`.

`vaadin-text-field.js` composes: `InputContainer`, `LitElement` + `PolylitMixin`,
`ElementMixin`, `ThemableMixin`, `LumoInjectionMixin` *(internal — we substitute
`ThemeDetectionMixin`)*, `TooltipController`, `TextFieldMixin`, `inputFieldShared` styles.

### The blocking conflict: `allowedCharPattern`'s paste behaviour

`InputControlMixin` **already implements `allowedCharPattern`**, and its per-character path is
exactly what SPEC §7.8.2 specifies:

- `_onBeforeInput` — `preventDefault()` when `e.data` fails the pattern. Reusable as-is.
- `_onKeyDown` — `preventDefault()` on a non-matching key. Reusable as-is.
- An `input-prevented` host attribute set for 200ms on rejection. **An existing state
  attribute we should reuse rather than invent** — add it to SPEC §9.

But its paste and drop handlers gate the **entire** payload:

```js
// input-control-mixin.js:202
if (this.allowedCharPattern) {
  const pastedText = e.clipboardData.getData('text');
  if (!this.__allowedTextRegExp.test(pastedText)) {
    e.preventDefault();      // ← the whole paste is dropped
  }
}
```

This is precisely the failure SPEC §7.4 forbids: pasting `123-456` into a digits-only field
yields **nothing**, not `123456`.

**Resolution — supersede on paste, reuse on keydown/beforeinput:**

| Base hook | Action | Why |
|---|---|---|
| `_onBeforeInput` | **call `super`** | Per-character, matches SPEC §7.8.2's fast path |
| `_onKeyDown` | **call `super`** | Same, plus the `input-prevented` affordance |
| `_onPaste` | **replace** — do not call `super` | Base is all-or-nothing; SPEC §7.4 needs sanitise → splice → truncate |
| `_onDrop` | **replace** — do not call `super` | Same |
| `_onInput` | **wrap** — sanitiser (SPEC §7.8.3) runs before `super` | `super` performs the value commit |
| `_onChange` | **wrap** | Completion commit ordering, SPEC §7.7 |
| `_valueChanged` / `_toggleHasValue` | **call `super`** | Drives `has-value`; cell rendering hangs off it |
| `_inputElementChanged` | **call `super`** | Base adds `input`/`change`/`paste`/`drop`/`beforeinput` listeners here |

This is the "do not end up with two rejection mechanisms" item, now answered: **one mechanism
per path** — the base's for keystrokes, ours for paste and drop.

### Flow interface verification: **RESOLVED** — SPEC §13's base assumption holds

Source-verified against `vaadin-text-field-flow:25.2.8` / `vaadin-flow-components-base:25.2.8`
/ `flow-server`+`flow-data:25.2.9` sources jars.

| Type | FQN | Artifact |
|---|---|---|
| `HasAllowedCharPattern` | `com.vaadin.flow.component.shared.HasAllowedCharPattern` | `vaadin-flow-components-base` |
| `HasTooltip` | `com.vaadin.flow.component.shared.HasTooltip` | `vaadin-flow-components-base` |
| `HasValidationProperties` | `com.vaadin.flow.component.shared.HasValidationProperties` | `vaadin-flow-components-base` |
| `ValidationUtil` | `com.vaadin.flow.component.shared.ValidationUtil` | `vaadin-flow-components-base` |
| `InputField<E,V>` | `com.vaadin.flow.component.shared.InputField` | `vaadin-flow-components-base` |
| `HasValueChangeMode` | `com.vaadin.flow.data.value.HasValueChangeMode` | `flow-data` |
| `HasValidator<V>` | `com.vaadin.flow.data.binder.HasValidator` | `flow-data` |
| `ValidationController` | `com.vaadin.flow.component.shared.**internal**.ValidationController` | `vaadin-flow-components-base` |

**`AbstractSinglePropertyField` is still the base Vaadin's own fields use**, not deprecated,
with no newer replacement (`AbstractValidationBase` does not exist). `TextField extends
TextFieldBase<TextField, String>`, and `TextFieldBase extends AbstractSinglePropertyField`
implementing — among others — `HasValidationProperties`, `HasValidator<TValue>`,
`HasValueChangeMode` and `InputField<…, TValue>`.

Three corrections for SPEC §13:

1. **Add `HasValidator<V>` and `InputField<…, V>`** to the interface list. `InputField` already
   extends `HasTooltip`, `HasLabel`, `HasHelper`, `HasSize`, `HasStyle`, `HasEnabled` — so
   listing `HasTooltip` separately is redundant.
2. **`HasValueChangeMode`'s two methods are abstract**, and the interface defines no default
   mode. `ON_CHANGE` must be set in the constructor, exactly as `TextField` does.
3. **`vaadin-flow-components-base` must be an explicit Maven dependency.** It is not pulled in
   transitively by `flow-server` / `flow-data`.

`HasAllowedCharPattern` is all-default and merely mirrors the `allowedCharPattern` element
property — the web component still owns the actual filtering.

### Still open in `P0-3`

- `<vaadin-input-container>` tolerance for a sibling decorative layer plus an
  absolutely-positioned slotted input — needs the throwaway prototype, not source reading.
- The canary test itself (`P0-3.6`), which should now assert the eight hooks in the table
  above.

---

## Net effect on the plan

| Task | Status |
|---|---|
| `P0-5` | Resolved. Maven `25.2.8` + `@NpmPackage` `25.2.11` + peer range `^25.2.0`; JDK 21. "Identical pins" criterion retired. |
| `P0-2` | Resolved. SPEC §9 rewritten; `W-8` shrinks; no scope fallback needed. |
| `P0-3` | Mixin list corrected; paste conflict resolved; **Flow interfaces verified**. Container prototype + canary test outstanding. |
| `P0-4` | **Decided:** build the animated prototype anyway; solo review a day later (no design function to sign off). |
| `P0-1` | **Narrowed:** always-widen decided up front (no runtime detection); one probe — 1Password on Chrome — for the constant and the clip mechanism. |
| `P0-6` | Resolved. Prefix `dc-`; one public GitHub repo; local link until `W-7`; CI push/nightly split; Vaadin's test stack; `small` subset confirmed. |
