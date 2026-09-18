# `<dc-code-field>` — Component Specification

**Status:** Decision-locked draft (v2)
**Supersedes:** v1 RFC (`code-field` spec, Draft/RFC)
**Repo:** one repo, two packages — `web/` (npm `@cardoso/code-field`) · `flow/` (Maven `dev.cardoso:code-field-flow`)
**Target platform:** Vaadin **25.x** — Maven `25.2.8`, `@NpmPackage` `25.2.11`, npm peer range `^25.2.0` (§12, ADR-0001) · JDK **21** · Themes: Lumo **and** Aura
**Element prefix:** `dc-` — **confirmed**; see §1.1

> **What changed from v1.** All seven of v1's open questions are closed. Five internal
> contradictions are removed (clear button, RTL scope, `input` re-dispatch, `part="slot"`
> naming, the i18n callback across the Flow boundary). Four new hazards are documented
> (§11.9–§11.12). The architecture is unchanged; the input pipeline, geometry model and
> commit semantics are now specified rather than implied.

---

## 1. Summary

A single-value field for entering short fixed-length codes — one-time passwords, 2FA/TOTP
codes, email verification codes, PINs, redeem and license keys — rendered as a row of
per-character cells.

The component holds **one string value**. The cells are a presentation of that value, not
separate fields.

### 1.1 Naming

The noun is **`code-field`**, closed. `otp-field` / `pin-field` were rejected: the same UI
is routinely used for redeem codes, license keys and recovery codes, none of which are
one-time passwords, and the OTP-specific behaviour (`autocomplete="one-time-code"`) is a
single opt-in property rather than the component's identity.

The **prefix** is a separate axis, and exists because this ships outside the Vaadin org.
Registering `vaadin-*` from a non-Vaadin package guarantees a `CustomElementRegistry`
collision if Vaadin ever ships the name, and misrepresents provenance. Therefore:

| Identity | Value |
|---|---|
| Custom element | `dc-code-field` |
| npm package | `@cardoso/code-field` |
| Java class | `CodeField` |
| Maven coordinates | `dev.cardoso:code-field-flow` |
| TestBench element | `CodeFieldElement` (`@Element("dc-code-field")`) |
| Shadow parts | unprefixed (`cell`, `separator`, …) |

The **API surface is Vaadin-shaped verbatim** — property names, part names, event names,
mixin composition and Flow interfaces all match what an in-tree Vaadin component would
have. Upstreaming later is then a rename across four places (element tag, npm name,
`@Tag`/`@NpmPackage`/`@JsModule`, `@Element`) and nothing else.

The prefix `dc-` is **confirmed** (`P0-6.6`). Changing it is mechanical; changing it *after
publish* is not — so it is settled before `W-1`.

> **Repo shape (revised).** v2 specified "two standalone repos". It is **one repo** with `web/`
> and `flow/` as sibling packages, published as two artifacts. The Flow module resolves the web
> package by relative path (`file:../web`) until `W-7`, which is reproducible on any checkout;
> two repos would have made that per-machine `npm link` state CI cannot reproduce. Splitting
> later is cheap, and upstreaming sends the web half into `vaadin/web-components`, itself a
> monorepo.

---

## 2. Goals

- One tab stop, one accessible name, one value, one `FormData` entry.
- SMS / keyboard OTP autofill works on iOS and Android without per-cell hacks.
- Password-manager fill (including TOTP fill into `autocomplete="one-time-code"`) works.
- Full paste support, including partial paste into a half-filled code.
- Native text-editing keybindings keep working: select-all, shift+arrow range selection,
  the iOS long-press menu, and undo/redo **on the uninterrupted path** (§11.9).
- Configurable length, character constraints, and visual grouping (`XXX-XXX`, v1.1).
- Themable under both Lumo and Aura without either theme forking behaviour.
- Full parity between the web component and the Flow Java API — including commit
  semantics (§7.7).

## 3. Non-goals

- Generating, sending or validating codes. The component is input only.
- Multi-line or variable-length input. Use a text field.
- Arbitrary input masking (phone numbers, dates, IBAN). Fixed-length grouping with static
  separators only.
- Countdown timers and "resend code" buttons. The app composes those around the field.
- **Secrecy.** `mask` is display-only; the characters live in a plain light-DOM `<input>`.
  `mask` is not `type="password"` and must not be documented as protection.
- Native form auto-submission (`autoSubmit`). Cut — see §12.

---

## 4. Architecture decision

**One real `<input>`, in the light DOM, visually transparent, with decorative cell
elements rendered over it in the shadow root.**

The input is created by `field-base`'s `InputController` and slotted as
`<input slot="input">` into the host's light DOM — the same as every other Vaadin field.
This is load-bearing: it is why `document.querySelectorAll('input')` finds it, and
therefore why password managers and the browser's own autofill work at all (§11.6).

The alternative — *N* inputs of `maxlength="1"` wired together with focus-shuffling
keydown handlers, as Zag/Ark, Chakra, Mantine and CoreUI do — is rejected:

| Concern | *N* inputs | Single input |
|---|---|---|
| Tab stops | *N* | 1 |
| Accessible name | one per box, must be synthesised | the field's own label |
| `autocomplete="one-time-code"` | only meaningful on one field; OS pastes the whole code into the focused box | works as designed |
| Select-all, shift+arrow, iOS long-press menu | must be reimplemented, usually isn't | native |
| Partial paste into a half-filled code | manual | native |
| Password-manager / TOTP fill | fills one box | fills the field |
| Flow value binding | needs custom serialisation | reuses existing field infrastructure |
| TestBench | bespoke element | reuses text-field patterns |

The cost is a large edge-case surface (§7.8, §7.9, §11). Accepted; mitigations specified.

### 4.1 Base composition

The component deep-depends on `@vaadin/field-base` internals — `InputMixin`,
`InputControlMixin`, `InputConstraintsMixin`, `FieldMixin`, `InputController`,
`LabelledInputController`, `src/styles/input-field-shared-styles.js` and
`<vaadin-input-container>` — declared as **`peerDependencies: "^25.2.0"`**, *not* pinned.
Pinning exactly would make npm install a second copy alongside the host application's, giving
two `InputMixin` class identities in one page; see
[ADR-0001](./docs/adr/0001-vaadin-deps-are-peer-ranges-not-exact-pins.md). **The canary test
below is therefore the whole of the safety mechanism.**

`@vaadin/field-base` declares no `exports` map, so deep `src/*.js` imports are unrestricted;
the coupling is to internal API *stability*, not to packaging. Vaadin 25 is GA
(P0-FINDINGS `P0-5`), so this is a stable line rather than a moving pre-release.

This is a deliberate trade: free parity with every other Vaadin field, in exchange for
coupling to unversioned internal API that changes between minors. Two obligations follow,
both non-optional:

1. **One bump policy covering two pins** — Maven `25.2.8` and `@NpmPackage` `25.2.11`, moved
   only deliberately, while `package.json` declares a peer *range*. (v2 said "a single pinned
   version, identical in both"; that is not achievable — the npm and Maven lines are
   deliberately decoupled, and `25.2.10` never existed on Maven at all. See ADR-0001.)
2. **A canary test** whose only job is to fail loudly when the shape of the depended-upon
   mixins changes (asserting the presence and arity of the specific hooks §7.8 overrides).
   Without it, "depend on internals" becomes a decision that gets re-made under pressure.

**`InputControlMixin` already implements `allowedCharPattern`, and its per-character path is
exactly what §7.8.2 specifies** — `_onBeforeInput` calls `preventDefault()` on non-matching
`e.data`, `_onKeyDown` on a non-matching key, and an `input-prevented` attribute is set for
200ms. Reuse both.

**But its paste and drop handlers gate the entire payload** against `/^pattern*$/` and drop
the whole paste on any mismatch — precisely the failure §7.4 forbids (`123-456` into a
digits-only field yields nothing). So: **one mechanism per path** — the base's for keystrokes,
ours for paste and drop.

| Base hook | Action |
|---|---|
| `_onBeforeInput` | call `super` |
| `_onKeyDown` | call `super` |
| `_onPaste` | **replace**, do not call `super` (§7.4) |
| `_onDrop` | **replace**, do not call `super` |
| `_onInput` | wrap — the §7.8.3 sanitiser runs *before* `super`, which commits the value |
| `_onChange` | wrap — completion commit ordering (§7.7) |
| `_valueChanged` / `_toggleHasValue` | call `super` — drives `has-value`; cell rendering hangs off it |
| `_inputElementChanged` | call `super` — the base attaches its listeners here |

Derived from reading the 25.2.x sources; see [P0-FINDINGS.md](./P0-FINDINGS.md) `P0-3`. The
canary test (above) asserts these eight hooks. Still outstanding in `P0-3`:
~~the Flow interface verification~~ (**done** — §13) and `<vaadin-input-container>`'s tolerance for a sibling
decorative layer plus an out-of-flow slotted input (needs a prototype).

### 4.2 Reference implementations reviewed

- `guilhermerodz/input-otp` — the single-invisible-input approach; source of most of
  §7.8/§11. Wrapped by shadcn/ui, shadcn-svelte and Supabase.
- Zag.js / Ark UI `pin-input` — the *N*-input state machine. Source of the keyboard table
  and several API names.
- Ant Design `Input.OTP` — `separator`, and the `formatter` vs `mask` distinction (we take
  only `mask`).
- Mantine `PinInput`, CoreUI `COneTimePassword` — API naming, `oneTimeCode`.

---

## 5. Anatomy

```
<dc-code-field>
  ├─ [slot=label]        → <label>
  ├─ part="container"
  │   └─ part="input-field"                (<vaadin-input-container>)
  │       ├─ part="cells"                  (decorative layer, pointer-events: none,
  │       │   │                             aria-hidden="true")
  │       │   ├─ part="cell" cell-index="0"
  │       │   ├─ part="cell" cell-index="1"
  │       │   ├─ part="cell" cell-index="2"
  │       │   ├─ part="separator" separator-index="0"     (v1.1)
  │       │   ├─ part="cell" cell-index="3"
  │       │   └─ …
  │       └─ <slot name="input">           ← light-DOM <input>, absolutely positioned
  ├─ [slot=prefix] [slot=suffix]
  ├─ [slot=helper]
  └─ [slot=error-message]
```

Each `part="cell"` contains the character (or the mask / placeholder character) and, when
active, a `part="caret"` element rendering a synthetic caret. The real caret is transparent.

**`part="cell"`, not `part="slot"`.** The v1 name collided with real `<slot>` elements and
with the `slot="input"` attribute in the same subtree, making `::part(slot)` vs `[slot]`
ambiguous for every themer. Renamed now; free now, unfixable after release.

---

## 6. API

### 6.1 Properties

| Property | Attribute | Type | Default | Ver | Notes |
|---|---|---|---|---|---|
| `value` | `value` | `string` | `''` | v1 | The raw code, **without** separators. See §6.5 for setter rules. |
| `length` | `length` | `number` | `6` | v1 | Number of cells. Integer ≥ 1; see §6.5. |
| `allowedCharPattern` | `allowed-char-pattern` | `string` | `''` | v1 | Regex source matched against **each** character. Empty = any. Same name and semantics as the existing Vaadin field property, deliberately. |
| `oneTimeCode` | `one-time-code` | `boolean` | `false` | v1 | Sets `autocomplete="one-time-code"` on the input. |
| `inputMode` | `input-mode` | `string` | `'numeric'` | v1 | Forwarded to the input. |
| `autoSelect` | `auto-select` | `boolean` | `false` | v1.1 | Select the active character on focus. |
| `blurOnComplete` | `blur-on-complete` | `boolean` | `false` | v1.1 | Blur on user-originated completion. |
| `complete` | `complete` | `boolean` (read-only, reflected) | | v1 | `value.length === length`. **Not latched** — see §7.7. |
| `groups` | `groups` | `string` | `''` | v1.1 | Space-separated group sizes, e.g. `"3 3"`. Must sum to `length` or is ignored with a console warning. Purely visual. |
| `separator` | `separator` | `string` | `'-'` | v1.1 | Glyph rendered between groups. Presentation only; never part of `value`. **`''` yields gap-only grouping** — the element keeps its width, only the glyph goes, so geometry is unchanged and §11.10's cost is unchanged with it (§9). |
| `mask` | `mask` | `boolean \| string` | `false` | v1.1 | Renders `•` (or the given single character) instead of the actual characters. Does not alter `value`. Not secrecy (§3). |
| `placeholderChar` | `placeholder-char` | `string` | `''` | v1.1 | Rendered in empty cells. |
| `i18n` | — | `object` | | v1 | `{ requiredErrorMessage, incompleteErrorMessage }`. Plain strings. |

Plus the standard field API from the base mixins: `label`, `helperText`, `errorMessage`,
`required`, `invalid`, `disabled`, `readonly`, `name`, `autofocus`, `manualValidation`,
`theme`, `tooltip`.

**Not included, deliberately:**

- **`formatter`.** Ant Design's `formatter` (rewrites the value) / `mask` (display only)
  pair is a known source of confusion. Only display-only behaviour exists here.
- **`autoSubmit`.** Cut on both platforms. It only works inside a native `<form>`, which
  is not how Flow or most Hilla apps submit. The documented pattern is a `code-complete`
  listener. Removed rather than left as a question mark.
- **A clear button.** `HasClearButton` was in v1's Flow API while the anatomy and property
  table had no clear button at all. Resolved by dropping it: a clear affordance inside the
  cell row fights the 24×24 target-size floor (§10) and the overlay geometry (§7.9). Apps
  that want one compose it into the `suffix` slot. `clear()` / `HasValue.clear()` remain —
  they are a method, not an affordance, and the javadoc must not imply otherwise.

  **The web component must still override `get clearElement()` to return `null`.**
  `ClearButtonMixin` arrives regardless, because `allowedCharPattern` is declared in
  `InputControlMixin`, which composes it directly — the two cannot be separated, and §4.1
  deliberately reuses that per-character rejection. (`vaadin-slider` avoids the mixin entirely
  by extending `FieldMixin`; that route is closed to us for the same reason.) Without the
  override, every instance logs *"Please implement the 'clearElement' property"* into the
  consuming application's console — once per field. `null` is a documented return value and
  the base's only consumer is `if (this.clearElement)`, so this is the accurate answer rather
  than a workaround.
- **Per-cell content slots.** Composable slots would let the app desynchronise the visual
  cell count from `length`.
- **`maxlength` on the inner input.** See §7.8.4.

### 6.2 Methods

| Method | Description |
|---|---|
| `focus()` | Focuses the field; caret placement per §7.3. |
| `blur()` | |
| `clear()` | Sets the value to `''`. Programmatic: fires no `code-complete`, no `change`. |
| `checkValidity()` | Whether the current value satisfies the constraints (§8). |
| `validate()` | Standard Vaadin semantics. |

### 6.3 Events

| Event | Detail | When |
|---|---|---|
| `value-changed` | `{ value }` | Any value change, programmatic included. |
| `code-complete` | `{ value }` | **User-originated** transition to a full value (§7.6). |
| `change` | — | Commit: blur, Enter, **and user-originated completion** (§7.7). |
| `input` | — | Native, from the light-DOM input. **Not re-dispatched** — `input` is already `composed: true` and crosses the boundary retargeted; v1's re-dispatch would have delivered every listener two events. |
| `validated` | `{ valid }` | Standard. |

`unparsable-change` does not apply: the value is always a string. A partially entered code
is exposed as the partial string and is invalid (§8) — it is not coerced to `''`.

### 6.4 Slots

`label`, `helper`, `error-message`, `prefix`, `suffix`, and the internal `input`.

### 6.5 Value and length invariants

v1 said only "never longer than `length`" and "`allowedCharPattern` is enforced at input
time", which together meant `value = "abc"` on a digits-only field was accepted and
`value = "12345678"` on a 6-cell field was silently truncated — silent data loss through a
`Binder`-bound bean. Resolved:

1. **The setter sanitises.** Assigned values are filtered character-by-character against
   `allowedCharPattern` and stripped of whitespace and (when set) the `separator` glyph, so
   `value = "123-456"` yields `"123456"`. The same sanitiser as §7.8, one code path.
2. **The setter truncates to `length`**, and if sanitising or truncation changed the value,
   `value-changed` fires with the *effective* value and a **console warning** naming the
   input and the result. Silent truncation is the failure mode; a warned truncation is a bug
   the developer can find.
3. **Shrinking `length`** truncates the value under the same rule, warning included.
   **Growing `length`** leaves the value untouched.
4. `length` is coerced to an integer ≥ 1; anything else is rejected with a warning and the
   previous value retained.
5. **`code-complete` never fires from the setter** (§7.6), even when the assigned value is
   complete — including the truncation path.

---

## 7. Behaviour

### 7.1 Editing model — compact string

The value is a compact string. The active cell is a **one-character native selection**
(§7.8), so:

- **Typing replaces** the selected character and advances.
- At the append position (a collapsed caret at the end of a not-yet-full value) typing
  **appends**.
- **Deleting shifts left.** `"1234"` in a 6-cell field with the caret on cell 1, Backspace
  → `"134"`: cells 2–3 slide left and cell 3 empties.
- Characters failing `allowedCharPattern` are rejected (§7.8); the value does not change
  and no event fires.
- Typing when the value is full and the last cell is active replaces the last character.

Both halves fall out of native single-input semantics given the selection trick, which is
why they are consistent even though they look asymmetric. It is stated explicitly because
*N*-input implementations leave a hole instead, and because **the visible consequence is a
code sliding sideways mid-edit** — that needs design sign-off against an animation, not a
still (PLAN.md `P0-4`).

### 7.2 Deletion

| Key | Behaviour |
|---|---|
| `Backspace` | Deletes the one-character selection and shifts left. At the append position, deletes the preceding character. |
| `Delete` | Deletes the one-character selection and shifts left. On cell 0 of a full code this drops the length below `length`, so `complete` flips false. |
| `Ctrl/Cmd+Backspace`, word delete | Native; the decorative layer re-syncs from the resulting value. |
| Selection + any deletion | Removes the selected range. |

### 7.3 Focus and caret

- Focusing an **empty** field puts the active cell at index 0.
- Focusing a **partially filled** field puts the caret at the first empty position (append
  mode, collapsed caret).
- Focusing a **full** field clamps the active cell to `length - 1` — otherwise the caret
  sits one past the last cell and nothing is highlighted.
- **Clicking a cell** places the caret at that character by native hit testing, not click
  handlers: the decorative layer is `pointer-events: none`, the input is `pointer-events:
  all`, and the browser resolves the position itself. Requires §11.4.1's text metrics.
- **Focus placement must not run when focus arrived from a pointer.** Clicking an unfocused
  full field focuses it, and the clamp above then moves the caret away from the cell the user
  aimed at — silently overruling every click. Track pointer-originated focus and skip
  placement for it.
- `ArrowLeft`/`ArrowRight` move by one cell. `Home`/`End` jump to first/last.
  `Shift+Arrow` extends a native selection.

### 7.4 Paste

- `Ctrl/Cmd+V` and the platform context menu both work.
- Pasted text goes through the sanitiser **before** validation: strip every character not
  matching `allowedCharPattern`; when no pattern is set, strip whitespace and the
  configured `separator`. Required — a naive implementation gates the whole prospective
  value against the pattern, so pasting `123-456` into a digits-only field yields *nothing*
  rather than `123456`.
- Paste splices at the caret, replacing any selection, then truncates to `length`.
- Partial paste into a half-filled code is supported.
- After a full paste the selection is restored so the last cell is active, not a caret past
  the end.

### 7.5 Autofill and external fill

Three fill sources, one pipeline:

1. **OS security-code autofill** (iOS/macOS Security Code AutoFill, Android keyboard
   suggestions) — keyed off `autocomplete="one-time-code"`, which `oneTimeCode` sets.
   `inputMode="numeric"` is the default. `type="number"` is **never** used: browsers treat
   it as a countable number rather than a digit sequence.
2. **Browser autofill** — see §11.3.
3. **Password-manager extensions**, including TOTP fill into `one-time-code` inputs. This
   is a **supported feature**, not merely a survived hazard, and works because the input is
   light DOM (§4).

All three write `input.value` directly, bypassing the host property, and none reliably
fires `input`. Therefore: the component polls for an unannounced value change on a short
schedule after focus/attach and dispatches a synthetic `input`, and **all three count as
user-originated** (§7.6) — a filled code must behave exactly like a typed one.

### 7.6 Completion and origin

`code-complete` fires on the **user-originated transition** to a full value: previous
length < `length`, new length === `length`, change not originated by the property setter.

- It must not fire on every render while the value happens to be full — a documented source
  of duplicated verification requests.
- Editing a complete code and refilling it fires again, correctly.
- **It never fires for programmatic values.** A server that echoes the value back would
  otherwise re-trigger the app's own "verify this code" handler — an infinite loop across
  the Flow boundary.

**Origin is an explicit internal flag set by the property setter — never `event.isTrusted`.**
`isTrusted` is unusable here because §11.3 and §7.5 require dispatching *synthetic* `input`
events for fill detection, and fill must count as user-originated.

One rule, applied uniformly: **all completion side-effects are user-originated only** —
`code-complete`, the completion commit (§7.7), and `blurOnComplete`. A server-set value
must never blur the user's field.

### 7.7 Commit semantics — completion is a commit

A user-originated completion **commits the value** on both platforms:

```
value updated → value-changed → change → code-complete → (blurOnComplete: blur)
```

- This deviates from every other Vaadin field, where only blur/Enter commit. It is
  deliberate: the Flow side forces a value sync alongside the completion event, so
  `getValue()` inside a `CodeCompleteEvent` listener returns the completed code. Without a
  matching commit on the web component, the two platforms would have different commit
  points — a parity bug guaranteed to be reported.
- **`change` fires at most once per distinct committed value.** A subsequent `blurOnComplete`
  blur must not re-fire it. The triple `code-complete` + `change` + blur-driven `change` is
  exactly where someone reports a duplicate verification request.
- `complete` is **not latched**: it tracks `value.length === length` literally and flips
  back to `false` mid-edit (§7.2). Theme rules keyed on `[complete]` must be written knowing
  they will repaint during editing.

### 7.8 Selection model and input pipeline

The active cell is derived from the input's selection. This is the hardest part of the
component and the source of most bugs in comparable implementations.

#### 7.8.1 Selection widening

1. A collapsed caret sits *between* characters and cannot identify a cell. On every
   `selectionchange`, widen a collapsed caret into a one-character range with
   `setSelectionRange(start, end, direction)`.
2. **Except at the append position** — a collapsed caret at the end of a not-yet-full value
   is meaningful. Widening it there turns the next keystroke into an overwrite instead of an
   append.
3. `ArrowLeft` appears to skip a cell unless direction is inferred by comparing against the
   previous selection range, with a guard for the transition out of append mode.
4. ~~No browser fires `selectionchange` on deletion or cut. Detect a shrinking value in the
   input handler and dispatch the event manually.~~ **Disproved in `W-3`, and no manual
   dispatch is implemented.** Chromium and Firefox both fire `selectionchange` after a
   Backspace deletion *and* after a cut: with the listener removed the post-deletion test
   fails, so the re-widening demonstrably runs off a real browser-fired event.

   **Still unverified:** Safari/WebKit, which is not in the automated matrix (§14.3), and
   deletion paths other than Backspace — `Delete`, and deletion via the iOS long-press menu.
   If one of those turns out not to fire, the manual dispatch comes back **for that path
   only**. It is not implemented speculatively, because a behaviour with no failing test is a
   behaviour nobody can show is needed.
5. **Always pass the third `direction` argument** to `setSelectionRange` — omitting it
   defaults to `forward` and collapses backward selections in Firefox.

#### 7.8.2 Character rejection — `beforeinput` first

On `beforeinput` for `insertText` / `insertFromPaste` / `insertFromDrop`:

- Sanitise the incoming data character-by-character.
- If nothing was stripped, let the native insertion proceed untouched (undo history intact,
  no value rewriting).
- If anything was stripped, `preventDefault()` and, if any characters survive, insert them
  with `setRangeText(sanitised, start, end, 'end')` — which preserves the native undo stack.
- Then truncate to `length` (§7.8.4).

#### 7.8.3 Composition — the post-hoc sanitiser

`beforeinput` with `inputType: insertCompositionText` cannot be reliably prevented, and
Android GBoard sends composition, autocorrect and `keydown` with `keyCode 229` for ordinary
typing. So a second pass is required:

- On `input` / `compositionend`, if the value contains characters the pattern rejects,
  rewrite **only the offending range** via `setRangeText` — never a whole-value assignment —
  then restore the selection and dispatch a synthetic `selectionchange`.
- This is the only path that damages undo history (§11.9), and it is why the sanitiser is
  scoped to the bypass path rather than run unconditionally.
- v1 had eight iOS/autofill hazards and **zero** Android composition hazards. This is the
  highest-risk untested path in the component and gets its own device-matrix row (§14.3).

#### 7.8.4 No `maxlength` on the input

`maxlength` is deliberately not set, and truncation is done in the pipeline instead:

- Some engines drop an over-long autofilled value **entirely** rather than truncating it,
  so a 6-`maxlength` input can silently reject a 7-character SMS payload.
- `maxlength` also pre-empts sanitise-then-truncate: `123-456` is 7 characters and would be
  clipped to `123-45` before the separator is stripped.

*Assumption flagged for review: this trades a native guarantee for pipeline correctness, on
the basis that every insertion path already passes through the sanitiser.*

#### 7.8.5 `disabled` and `readonly`

- `disabled`: the input is not focusable and holds no selection. No active cell, no
  synthetic caret; the decorative layer renders the value in its disabled treatment only.
- `readonly`: the input remains focusable and selectable (native behaviour), so the field
  keeps one tab stop and select-all/copy keep working — but **no active-cell highlight and
  no synthetic caret** are rendered, since nothing can be typed. Selection-based copy is
  still possible.

### 7.9 Geometry

1. **Cells shrink in CSS, not JS.** Cells are flex items with `min-width: 24px` (§10) and
   `flex-shrink`, so the whole shrink-to-fit behaviour is declarative. JS-computed cell
   sizing would force Lumo and Aura to know about the measurement code, violating §9's "the
   themes do not fork behaviour".
2. **Past the 24px floor the field overflows its container.** It does not shrink below the
   target-size floor and does not wrap. The parent deals with the overflow. A field wider
   than its parent is a problem the app can see; a sub-minimum touch target is one the app
   cannot.
3. **Cells never wrap.** A wrapped row makes a multi-cell selection render as two
   disconnected fragments.
4. **The input is out of flow** — absolutely positioned, contributing nothing to the field's
   own sizing. Two independent reasons, both of which must be in the code comment or someone
   will "simplify" it back:
   - §11.4 derives the input's `font-size` from the field's height via `ResizeObserver`. If
     the input participated in layout, its font-size would feed back into the height that
     produced it — a resize loop that only appears at some zoom levels.
   - §11.6's widen-and-clip badge avoidance makes the input wider than the cell row; out of
     flow, that overhang is free.
5. **One `ResizeObserver`**, one direction: field height → input `font-size`. Cell size never
   depends on it.
6. **Cells are always LTR**, enforced with an explicit `direction: ltr` on the cell row and
   on the input. Chrome (label, helper, error) mirrors via `DirMixin`. Codes read
   left-to-right regardless of document direction, and this removes the
   selection-index-versus-visual-order mismatch by construction rather than by care. Stated
   in §9 too, so a theme does not helpfully "fix" it.

---

## 8. Validation

| Constraint | Behaviour | Message |
|---|---|---|
| `required` | Invalid when `value` is empty. | `i18n.requiredErrorMessage` |
| Implicit length | Invalid when `0 < value.length < length`. A partially entered code is always invalid. | `i18n.incompleteErrorMessage` |
| `allowedCharPattern` | Enforced at input time (§7.8) and in the setter (§6.5). Never a validation-time failure. | — |

- The two constraints are **distinct**, with **distinct messages**. v1 introduced the
  incomplete constraint with no message and no i18n slot for one.
- Constraint validation runs **on blur and on explicit `validate()`**, not on every
  keystroke, so a user typing a 6-digit code does not see an error after the first character.
- `manualValidation` and `validated` follow standard Vaadin field semantics.
- The partial value is exposed as-is on `value` (§6.3); invalidity is the signal, not
  coercion to `''`.

---

## 9. Theming

The component **ships its own base styles**, parameterised by `--vaadin-*` custom properties.
Lumo and Aura supply tokens; neither carries a per-component style module.

> *(v2 said "the component ships no visual opinion; Lumo and Aura each style it". That was the
> Vaadin 24 model and is superseded — see the `P0-2` note below. Any design artefact still
> repeating that sentence, including the mockup in §9.2, predates the correction.)*

> **`P0-2` resolved — and this section's premise was a Vaadin 24 assumption.** See
> [P0-FINDINGS.md](./P0-FINDINGS.md). Vaadin 25 has **no `theme/` directories at all**.
> Components ship their own base styles as Lit `css` parameterised by `--vaadin-*` custom
> properties; Lumo and Aura are app-level *token layers*, not per-component style modules.
>
> So the model inverts: **we ship the base styles**, and the themes supply tokens. There is
> no "implement two themes" task. There is one base stylesheet authored against `--vaadin-*`
> conventions — reusing the existing `--vaadin-input-field-*` tokens the field chrome already
> consumes, and defining `--vaadin-code-field-cell-*` for what is new — plus, only where token
> parameterisation genuinely cannot express a difference, a few
> `[data-application-theme='aura']` rules via the **public** `ThemeDetectionMixin`
> (`@vaadin/vaadin-themable-mixin/vaadin-theme-detection-mixin.js`), which stamps
> `data-application-theme="lumo|aura"` on the host for exactly this purpose.
>
> `LumoInjectionMixin` and `ThemeDetector` are documented **"for internal use only, do not use
> in custom components."** Do not use either, even though `vaadin-text-field.js` does.

**Parts:** `container`, `input-field`, `cells`, `cell`, `separator` (v1.1), `caret`, plus
inherited `label`, `helper-text`, `error-message`, `required-indicator`.

**Host state attributes:** `focused`, `focus-ring`, `disabled`, `readonly`, `invalid`,
`complete`, `has-value`, `has-label`, `has-helper`, `has-error-message`, and
`input-prevented` — the last two inherited: `input-prevented` is set by `InputControlMixin`
for 200ms when a keystroke is rejected by `allowedCharPattern`, and is reused rather than
reinvented (P0-FINDINGS `P0-3`).

**`part="cell"` state attributes:** `active`, `filled`, `cell-index`.

**Theme variants:** `small`, shipping in v1 for size parity with other fields. It adjusts
cell size and font, not chrome spacing, so it composes with shrink-to-fit rather than
competing with it.

**Active-cell treatment (closed):** an **accent border** on the active cell, plus the
synthetic caret inside it; the field-level focus ring is retained in all cases. Chosen over
a filled/inverted cell (competes with the `filled` state attribute and hurts caret and
character legibility) and over caret-only (weakest affordance on touch, and invisible under
`prefers-reduced-motion` if the blink is the only signal).

**The caret renders only where the selection is genuinely collapsed** — the append position.
Everywhere else the active cell is a one-character *selection* (§7.8.1) and typing replaces
it, so an insertion point claims something untrue and strikes through the character. The
accent border carries those cases alone, which is the same property that makes it survive
`prefers-reduced-motion`.

The mockup (§9.2) built all three and reached the same conclusion independently, framing the
chosen one as *"the same 1px-to-2px outline shift a text field already makes on focus"* — the
better articulation, because it makes the treatment a **reuse of existing field behaviour**
rather than a new invention. It also adds an argument against caret-only that this section
missed: with the blink suppressed, nothing at all marks a cell that is *selected* rather than
appended to. **The border is the primary indicator and the caret is secondary** — not a pair
of equals.

**Separator (closed, v1.1):** a **rendered glyph** in `part="separator"`, not a bare gap.
See §11.10 for its structural cost.

**`separator=""` is gap-only grouping**, and needs no separate API: the separator element
stays, at its normal width, with no glyph in it. Cell geometry, hit testing, caret placement
and cross-boundary selection are therefore identical to the glyph case — which is what makes
it free, and equally what makes it **useless as an iOS mitigation**. §11.10's cost is the
separator's *width*; removing the character removes none of it. Offer `separator=""` because
an undashed 6-digit OTP looks better without a dash, not because it fixes anything.

*(Rejected alternative, from the mockup: one outline per group rather than per cell. A
selection crossing the boundary renders as two disconnected fragments — the same defect §9
forbids wrapping for — and the active cell has no outline of its own left to thicken.)*

Constraints on both themes:

- Cell width must accommodate the widest allowed glyph; use tabular numerals.
- Focus indication is on the active *cell*, **and** the field as a whole shows a focus ring
  — the "which control am I in" question.
- The synthetic caret's blink animation must respect `prefers-reduced-motion`, and the
  active cell must remain identifiable with motion disabled (hence the accent border).
- Cells must not wrap; shrink to the floor, then overflow (§7.9).
- Do not override the cell row's `direction: ltr` (§7.9.6).
- Do not restyle the input's five hiding properties (§11.12).

### 9.1 Token derivation — **derive first, invent only what has no analogue**

The base stylesheet derives from the `--vaadin-*` tokens the themes set, so that most of the
Lumo/Aura difference is encoded in tokens rather than in forked CSS.

> **Status: provisional, and partly disproved — see §9.1.2.** The *mechanism* is confirmed;
> the exact per-property mapping below is **not** verified, and measurement through the dev
> page's theme switcher showed most of it does not hold. `W-8` must rewrite it. What is confirmed: the themes set a **primitive scale**
> (Aura's `size.css` defines `--vaadin-padding-block-container`, `--vaadin-radius-s`,
> `--vaadin-gap-*`), and components consume those primitives through computed fallbacks. Do
> not assume a component-level token exists just because a name appears in a `var()`.

**Cell height must reproduce the field's own height computation**, not invent one, so a cell
row lines up with a text field beside it. `field-base-styles.js` computes it as:

```
1lh + --vaadin-padding-block-container × 2 + --vaadin-input-field-border-width × 2
```

`--vaadin-field-baseline-input-height` is **not** a theme-set token — it appears once in the
monorepo, as an override hook wrapping that expression. Use the computation; respect the hook.

| Cell property | Source |
|---|---|
| Rest outline | `--vaadin-input-field-border-width` / `--vaadin-input-field-border-color` |
| Cell fill | `--vaadin-input-field-background` — this alone produces the mockup's "Aura outlines, Lumo fills" difference, because the two themes set it differently |
| Character size / colour | `--vaadin-input-field-value-font-size`, `--vaadin-input-field-value-color` |
| Disabled | `--vaadin-input-field-disabled-background`, `--vaadin-disabled-cursor` |
| Read-only | `--vaadin-input-field-readonly-border` — Lumo defaults it to `1px dashed var(--lumo-contrast-30pct)` over a transparent background; Aura instead zeroes its surface opacity |
| Invalid | `--vaadin-input-field-error-color` |
| Autofill | `--vaadin-input-field-autofill-background`, `--vaadin-input-field-autofill-color` (§11.3) |

Only these are genuinely new, and only these get `--vaadin-code-field-*` names:

`--vaadin-code-field-cell-width` · `--vaadin-code-field-cell-gap` ·
`--vaadin-code-field-cell-radius` · `--vaadin-code-field-cell-active-border-width` ·
`--vaadin-code-field-caret-width` · `--vaadin-code-field-caret-color` ·
`--vaadin-code-field-separator-color`

**Radius — resolved.** There is genuinely no `--vaadin-input-field-border-radius`. But the
platform has a house pattern for exactly this, visible in `checkable-base-styles.js`:

```css
border-radius: var(--vaadin-<component>-border-radius, var(--vaadin-radius-s));
```

a component-scoped token falling back to the **global radius scale**. So use
`var(--vaadin-code-field-cell-radius, var(--vaadin-radius-s))`. The theme difference the
mockup shows (Aura 9px, Lumo 8px) then comes from `--vaadin-radius-s`, which each theme sets
— again, no forking.

### 9.1.2 What the themes actually publish — **measured**

Read off the component with Aura applied (dev page, `?theme=aura:light`):

```
--vaadin-input-field-background        (unset)
--vaadin-input-field-border-color      (unset)
--vaadin-input-field-border-width      (unset)
--vaadin-input-field-value-font-size   (unset)
--vaadin-input-field-readonly-border   (unset)
--vaadin-radius-s                      min(0.25lh, round(3 * 1px + 2px, 1px))   ← set
```

…while `<vaadin-input-container>`'s real background is `oklab(1 0 0 / 0.7)`.

**The themes style `::part(input-field)` directly and publish only *primitives*.** The
component-level `--vaadin-input-field-*` names are consumed-with-fallback inside `field-base`;
they are not a token surface a third-party component can read. Our cells therefore run on
fallbacks, which is why they render transparent in both themes where the mockup expected Lumo
to fill them.

**What does work**, measured the same way: derivation through *primitives*. Identical CSS
yields radius 3px (Lumo) vs 5px (Aura), font 16px vs 14px, cells 31×18 vs 26×22, with no
theme-specific rules — and in Aura the field matches `<vaadin-text-field>` exactly at 82px.

So `W-8`'s real choice is: derive from primitives where possible, and for anything a theme
applies by styling a part rather than setting a token, either match what it does to
`::part(input-field)` or accept a `ThemeDetectionMixin` rule. §9.1 wanted to avoid the latter;
it now has a measured reason to allow it. Tracked as issue #26.

### 9.1.1 Per-state cell treatment

Derived where the platform provides a source; the mockup supplies the intended look.

| State | Cell treatment |
|---|---|
| Rest | Fill from `--vaadin-input-field-background`; outline from `--vaadin-input-field-border-width`/`-color` |
| Active | Outline width doubled — the text field's own focus shift. Fill unchanged. Plus the caret |
| Filled | No treatment of its own; the character is the signal. `filled` exists for themes, not for us |
| Invalid | Outline recoloured to `--vaadin-input-field-error-color`, **on every cell**, filled or not |
| Disabled | `--vaadin-input-field-disabled-background`, muted text, `--vaadin-disabled-cursor` |
| Read-only | Transparent fill, no shadow, `var(--vaadin-input-field-readonly-border, …)` |

**Read-only is derived, not invented — verified in source.** `field-base` sets only
`cursor: default` for `:host([readonly])`, so the visible treatment comes from the themes, and
both have one:

```css
/* @vaadin/vaadin-lumo-styles/src/components/input-container.css:123 (confirmed at 25.2.11) */
:host([readonly])::after {
  background-color: transparent;
  border: var(--vaadin-input-field-readonly-border, 1px dashed var(--lumo-contrast-30pct));
}
```

Aura takes the same shape by a different route — `[readonly]::part(input-field)` zeroes its
surface opacity and the resting box-shadow is scoped to `:not([readonly], [disabled])`.

So the mockup's dashed read-only border is **the platform convention, not a design
invention**, and `--vaadin-input-field-readonly-border` is a real token that carries the
Lumo/Aura difference for free. Apply it to `part="cell"` and the treatment derives like
everything else in §9.1.

`[data-application-theme='aura']` rules via `ThemeDetectionMixin` remain available but are a
**last resort**: every such rule is a place where the two themes have forked, which is what
this section forbids.

**Zero such rules is the target, not a prediction.** Aura and Lumo do not always express the
same treatment the same way — read-only is transparent-plus-dashed-border in Lumo but a
zeroed surface opacity in Aura, reached through `::part(input-field)` rather than a shared
token. Where the two genuinely diverge in *mechanism* rather than in value, a scoped rule is
the honest answer and pretending otherwise produces a stylesheet that quietly looks wrong in
one theme. `W-8` should record each one it adds, with the reason.

### 9.2 Visual direction — [`docs/design/code-field-mockup.html`](./docs/design/code-field-mockup.html)

A design exploration (built with Claude Design) fixing the intended look and feel. It is
**directional, not a specification**: it is an artefact to check the written spec against,
and the spec wins where they differ.

What it contributes: the three-way focus-treatment comparison and the separator options
above; and concrete starting geometry — **Aura** 44×48px cells, 6px gap, 9px radius, 20px
type; **Lumo** 40×40px, 8px gap, 8px radius, 18px type. Those numbers are a sanity check on
the derivation in §9.1, not values to hard-code: if deriving from
`--vaadin-field-baseline-input-height` lands far from them, something is wrong in the
derivation.

**It was built against the v1 spec and disagrees with v2 in five places. None are adopted:**

| Mockup | This spec | Why the spec wins |
|---|---|---|
| `<vaadin-code-field>` | `dc-code-field` | §1.1 — registering `vaadin-*` from outside the Vaadin org guarantees a registry collision |
| "slot", `part="slot"` | **cell**, `part="cell"` | v2 removed `part="slot"` as an internal contradiction; "slot" also collides with the `<slot>` this component genuinely uses for its input |
| "ships no visual opinion" | We ship base styles | `P0-2`; the Vaadin 24 model |
| `maxlength` on the input | No `maxlength` | §7.8.4 — truncation belongs in the pipeline |
| §6.1 / §7.7 / §12.5 refs | v2 numbering | Grouping is §6.4/§11.10; caret widening is §7.8.1 |

---

## 10. Accessibility

- **One tab stop.** The light-DOM input is the only focusable element.
- The field's `label` is the accessible name of the input. The decorative layer is
  `aria-hidden="true"`; no per-cell labels reach the a11y tree.
- `aria-describedby` wires helper text and error message, as with other fields.
- `aria-invalid` reflects `invalid`.
- The input gets `autocomplete`, `inputmode`, `spellcheck="false"` (browsers underline codes
  as typos) and `autocorrect="off"`.
- Screen-reader expectation: focusing announces the label, the value and the field type
  **once** — not once per box.
- **Target size:** cells meet the 24×24 CSS px minimum (WCAG 2.2 SC 2.5.8) in both themes.
  This is the `min-width` floor in §7.9.1, which is why the field overflows rather than
  shrinking past it.
- Per-cell screen-reader labels are **not** in v1. v1's `i18n.slotLabel(index, length)` was
  a *function*, which cannot cross the Flow boundary, and §10 never applied it by default.
  If it returns in v1.1 it will be a template string (`"Character {index} of {length}"`).

---

## 11. Known hazards

Each needs an explicit test.

### 11.1 Never use `opacity: 0` on the input
iOS suppresses the editing menu for inputs it considers non-visible, which kills
long-press → Paste. The input keeps `opacity: 1` and is hidden via transparent `color`,
`-webkit-text-fill-color`, `caret-color`, `background` and `::selection`.

### 11.2 `::selection` needs two declarations — and cannot live in the shadow
`background: transparent` alone leaves the selected text painted in the highlight's
foreground colour. Both `background` and `color` must be transparent.

**`::slotted(input)::selection` is not a valid selector.** It is dropped at parse time, so the
rule appears in the source and does nothing — the selected cell keeps showing the browser's
highlight band behind the character. `field-base` hits the same wall with `::placeholder`
("Needed for Safari, where `::slotted(...)::placeholder` does not work") and solves it the
same way: **`SlotStylesMixin`**, which injects into the light-DOM scope where
`input::selection` works normally. It arrives with `InputControlMixin`.

Two traps around it:

- **Spread `super.slotStyles`, never replace it.** The base supplies the `:autofill`
  overrides §11.3 depends on, and a plain override drops them silently.
- **`getComputedStyle(input, '::selection')` cannot confirm this.** With no `::selection` rule
  it falls back to the element's own `color`, which §11.12 already made transparent — so it
  reports success either way. Check that a rule mentioning `selection` actually exists.

### 11.3 Autofill styling and state
`:autofill` / `:-webkit-autofill` UA styles outrank most author styles; every property they
touch needs overriding, **including `-webkit-text-fill-color`**. Some engines clear the
state only on the next real input event, so a synthetic `input` must be dispatched — and
repeated on a short schedule, since engines settle at different moments and none signals
when they are done. This same polling covers extension fill (§7.5).

### 11.4 Native caret and selection geometry
The native selection band, drag handles and the iOS magnifier are sized from the *text*, not
from the cells. Publish the input's height via a custom property from a `ResizeObserver` and
derive the input's `font-size` from it, so native affordances match the field height. The
input must be out of flow or this observer forms a cycle (§7.9.4).

#### 11.4.1 The horizontal half — text metrics (implemented in `W-5`)

v2 specified only the vertical axis. **§7.3's "native hit testing" does not work without the
horizontal one**: with the text laid out in a narrow default-font run at the left, every click
right of it lands past the end and clamps to the last cell. Measured before the fix: clicking
cell 0 *and* cell 2 both activated cell 5.

The same single `ResizeObserver` publishes three measurements, and the input's
`letter-spacing` and `padding-inline` follow:

| Published | Why measured, not derived from tokens |
|---|---|
| **Cell pitch** (cell 1's left minus cell 0's left) | Needs no knowledge of which token supplies the gap, and a one-cell field has no pitch |
| **Digit advance** | Not `1ch`: `ch` is the width of "0" without the font's own spacing. Using it left ~2.5px of residual error per cell |
| **Offset** between the input's box and the first cell | The input's box is the *container's padding box*, so it starts left of the cells by an amount no token states |

**Align character *boundaries* to cell centres, not glyphs to cells.** A caret is a boundary,
and a click resolves to the nearest one — so centring glyphs puts a centre-click exactly on
the tie between two boundaries. Chrome rounds down, Firefox up, and Firefox was off by one
cell. With boundary *i* at cell *i*'s centre, every point inside cell *i* is nearer boundary
*i* than *i+1* in any engine. The glyphs land half a cell off, which is invisible: §11.12
makes the input's text transparent and the cells render the characters.

**This is not the JS sizing §7.9 forbids.** The cells still shrink purely in CSS; the observer
only reports the width they settled on. §7.9.4's cycle cannot form either, because the output
is consumed only by the input, which is out of flow and so cannot feed back into the cells'
layout — which is the reason §7.9.4 requires it out of flow.

Two implementation constraints, both found by measuring:

- **The metrics must be applied inline**, not through custom properties in the shadow
  stylesheet. The input is slotted twice — into this shadow root, then into
  `<vaadin-input-container>`'s — so the container's own `::slotted(input)` rules win the
  cascade for `padding` and `letter-spacing`.
- **Copy the cell's font properties individually.** `getComputedStyle(cell).font` serialises
  to `""` when `font-variant-numeric` is not `normal`, so the shorthand silently yields
  nothing and the advance is measured against the wrong font.

### 11.5 iOS native selection artefact
iOS paints selection in a native layer that ignores `::selection`, CSS opacity and ancestor
clipping. It respects only rendered text geometry, so the underlying text is compressed with
negative letter-spacing under `@supports (-webkit-touch-callout: none)`. This narrows but
does not eliminate the artefact. Accepted cosmetic limitation — and **worse whenever
`groups` is set** (§11.10).

### 11.6 Password managers — resolved, and now a requirement
v1 recorded this as "extensions generally do not traverse shadow DOM, so the badge may never
appear — but fill may not work either." **The premise was wrong:** the input is in the light
DOM (§4), reachable by `document.querySelectorAll('input')`. So fill works — which is a
feature (§7.5) — and therefore **the badge definitely appears, anchored to the input's
top-right corner, which is the last cell.** Badge avoidance is required, not optional. v1's
note to probe with `elementFromPoint` on the shadow root is also wrong: probe the document.

**Strategy: widen the input past the last cell so the badge anchors outside the cell row,
then clip the overhang back.** Free because the input is out of flow (§7.9.4). Two
sub-decisions are genuinely unanswerable before measurement and are specified as Phase 0
outputs with decision rules (PLAN.md `P0-1`):

- **How wide, and always or on detection.** *Rule:* if measured badge widths across
  1Password / Bitwarden / LastPass fit a single generous constant, always-widen and never
  detect. Only if they diverge badly does per-vendor detection earn its fragility and its
  post-load width change.
- **What clips — `clip-path` on the input, or `overflow` on the container.** *Rule:* prefer
  `clip-path` on the input (it also clips pointer events, which is desirable for the
  overhang) unless the spike shows it breaks native caret resolution at the last cell.
  `overflow` on the container risks clipping the focus ring.

### 11.7 Value restored before upgrade
Browsers restore form state before custom-element upgrade. On first render, adopt the input's
existing value (through the sanitiser) rather than clobbering it.

### 11.8 Shadow DOM stylesheet
Insert rules defensively — a rule an engine cannot parse, or a restrictive CSP, must not take
the component down with it.

### 11.9 Undo history degrades on the sanitiser path *(new)*
§2 promises native undo/redo. Any programmatic write to `input.value` clears the UA undo
stack, so:

- The `beforeinput` fast path (§7.8.2) never rewrites and keeps history intact.
- Rejection and the composition sanitiser use `setRangeText`, which preserves history where
  the engine supports it.
- On Android composition and on fill paths, undo history is **best-effort**. Documented
  limitation, not a promise.

Never assign `input.value` wholesale in an editing path. Property-setter assignment (§6.5) is
allowed to, and does, reset history — that is a programmatic value change, not an edit.

### 11.10 A rendered separator misaligns native selection *by construction* *(new, v1.1)*
The input holds *N* uniformly-spaced characters; the decorative layer spans *N* cells **plus**
one or more separator widths. There is no way to inject that width into a plain input's text
flow, so the native caret, selection band, drag handles and the iOS magnifier **cannot** track
grouped cells.

- Desktop: invisible, since §11.2 hides selection painting.
- iOS: §11.5's accepted artefact gets meaningfully worse whenever `groups` is set.

**The cost is the separator's *width*, not its glyph — and this invalidates the obvious
fallback.** `separator=""` (§9) renders an element of the *same width* with no character in
it, so it misaligns native selection exactly as much as a glyph does. Gap-only grouping is
**not** an iOS mitigation, and neither is a gap implemented as cell margin.

The only things that actually reduce the cost are:

1. **No grouping** — `groups` unset. The one genuine mitigation.
2. **A narrower separator**, which reduces the misalignment proportionally without removing
   it. Palliative, not a fix.

So if `V11-1.4`'s grouped-iOS row comes back bad, the fallback is **not shipping `groups` at
all**, not shipping it gap-only. That is a scope decision, and it must be taken as one.

This is a structural cost of grouping, not a bug to fix, and it is an argument for keeping
`groups` in v1.1 (§12) and for adding a **grouped case to the iOS row** of §14.3 before v1.1
commits.

### 11.11 The `code-complete` echo loop *(new)*
Closed by design — `code-complete` is user-originated only (§7.6) — but recorded here because
it is the failure the design prevents, and any future change to origin handling reopens it.

### 11.12 Page CSS can double-render the code *(new)*
The light-DOM input is reachable by page CSS: `dc-code-field > input`, or any page-wide
`input { color: … }`. On a text field such a rule is harmless. Here, §11.1 hides the *real*
text with a transparent colour — so a page rule setting a colour renders the actual code
**underneath the cells, doubled and offset.**

**Mitigation:** the hiding properties are declared `!important`. Five properties, not four —
`-webkit-text-fill-color` outranks `color` and is what `:autofill` uses (§11.3), so omitting
it means autofill reveals the text:

```
color · -webkit-text-fill-color · caret-color · background · ::selection { background; color }
```

These are load-bearing, not stylistic. Apps lose the ability to override them deliberately;
that is the intended trade.

---

## 12. Decision ledger

v1's §12 "Open questions" is empty. All seven are closed, plus fourteen decisions v1 did not
have a row for.

| Area | Decision |
|---|---|
| Repo | **One repo, two packages** (`web/`, `flow/`), public on GitHub; two published artifacts (§1.1) |
| Platform | Vaadin 25 GA. Maven **`25.2.8`**, `@NpmPackage` **`25.2.11`**, npm **`peerDependencies: ^25.2.0`**. JDK **21**. Lumo **and** Aura in v1 |
| Field base | Deep-depend on `@vaadin/field-base` internals; **the canary test is the safety mechanism, not the version string** (§4.1, ADR-0001) |
| Flow validation | Hand-rolled `getDefaultValidator()`/`setManualValidation()`/`validate()`; **no** `ValidationController` (internal package) (§13, ADR-0002) |
| Release posture | **Published 0.x, best-effort**; solo maintainer; no support promise |
| Theming | We ship base styles against `--vaadin-*` tokens; themes are token layers; `ThemeDetectionMixin` for theme-specific rules (§9) |
| `allowedCharPattern` | Reuse the base's keydown/`beforeinput` rejection; **replace** its all-or-nothing paste/drop gating (§4.1) |
| Identity | Own element prefix, Vaadin-shaped API verbatim; the noun stays `code-field` (§1.1) |
| Flow scope | Full module **with** integration tests |
| Editing model | Compact string: one-character selection, type replaces, delete shifts left (§7.1) |
| Input pipeline | `beforeinput` `preventDefault` + post-hoc sanitiser on the bypass path only; `setRangeText`, never whole-value assignment (§7.8) |
| `maxlength` | Not set; truncation in the pipeline (§7.8.4) |
| `code-complete` | User-originated only; explicit `_programmatic` flag, never `isTrusted`; fill counts as user (§7.6) |
| Side-effects | All completion side-effects are user-originated only (§7.6) |
| Commit | Completion commits on **both** platforms; `change` at most once per committed value (§7.7) |
| Flow sync | `HasValueChangeMode`, default `ON_CHANGE`, plus forced value sync on completion (§13) |
| Overflow | Cells shrink in CSS to a 24px floor, then the field overflows its container (§7.9) |
| Input element | Out of flow — observer cycle **and** badge overhang (§7.9.4) |
| RTL | Cells always LTR, enforced; chrome mirrors; **in the v1 test matrix** (§7.9.6) |
| `groups` | `groups="3 3"` / `setGroups(int...)` + `getGroups()`; **v1.1** |
| Separator | Rendered glyph; v1.1; documented iOS geometry cost (§11.10). **`separator=""` is gap-only**, free and cosmetic — explicitly **not** an iOS mitigation, since the cost is the separator's width (§9, §11.10) |
| Active cell | Accent border **primary**, synthetic caret **secondary**; field ring retained. Framed as the text field's own 1px→2px focus shift, not a new treatment (§9) |
| Cell tokens | **Derive** from `--vaadin-field-baseline-input-height` / `--vaadin-input-field-*`; invent `--vaadin-code-field-*` only for gap, radius, active border width and caret. Theme difference falls out of tokens, with **no** theme-specific CSS (§9.1) |
| Visual direction | `code-field-mockup.html` is directional only; it predates v2 and disagrees in five places, none adopted (§9.2) |
| Clear button | Dropped both platforms; `clear()` remains, no affordance (§6.1) |
| `small` variant | Ships in v1, cell sizing only, visual-tested on a subset (§14.2) |
| `autoSubmit` | Cut from v1 both platforms; documented `code-complete` pattern (§6.1) |
| Parts | `part="cell"` / `cell-index`; no `input` re-dispatch (§5, §6.3) |
| i18n | Plain-string `requiredErrorMessage` + `incompleteErrorMessage`; per-cell labels dropped from v1 (§10) |
| Value setter | Sanitises, truncates, warns; never fires `code-complete` (§6.5) |
| Password managers | Fill supported; badge avoidance required; widen-and-clip (§11.6) |
| Page CSS | Five hiding properties `!important` (§11.12) |
| Phasing | **Phase 0 blocks Phase 1** (PLAN.md) |

### 12.1 Still open — closable only by Phase 0 or by design

**Two items remain. Both are work, not decisions.**

1. **`<vaadin-input-container>` tolerance** for a sibling decorative layer plus an
   absolutely-positioned slotted input — needs a throwaway prototype, not source reading.
   `P0-3`.
2. **The canary test** (§4.1), asserting presence and arity of the eight `field-base` hooks.
   `P0-3`. Load-bearing: ADR-0001 removes exact version pinning, so this is the *only* thing
   standing between an internals change and a silent breakage.

Everything else is closed:

3. ~~**Badge measurement**~~ → **decided, not measured-in-full**: always-widen, no runtime
   detection. One probe (1Password on Chrome) supplies the constant and validates the clip
   mechanism. Other vendors' badge geometry is an accepted 0.x rough edge. `P0-1`.
4. ~~**Third-party Aura authoring**~~ — §9 rewritten; we ship base styles, themes are token
   layers, `ThemeDetectionMixin` is the sanctioned hook. `P0-2`.
5. ~~**The `field-base` override-point appendix**~~ — hook table written, `allowedCharPattern`
   paste conflict settled, **Flow interfaces verified** (§13). `P0-3`.
6. ~~**Design sign-off on the mid-edit slide**~~ — there is no design function; the animated
   prototype is still built (it guards `W-3`/`W-4`, the critical path's two hardest tasks) and
   reviewed by the author a day later. `P0-4`.
7. ~~**Vaadin 25 GA status and pin**~~ — GA. The npm and Maven lines are decoupled: Maven tops
   out at `25.2.8` while npm is at `25.2.12`, and `25.2.10` never existed on Maven at all. See
   the Platform row above and ADR-0001. `P0-5`.
8. ~~**npm publish vs. local path**~~ — `file:../web` until `W-7`, then publish `0.0.x`. `P0-6`.
9. ~~**JDK; IT cadence; device-matrix owner and gates**~~ — JDK 21; unit + visual on push,
   Flow ITs nightly from `W-7`; matrix owned by the author, gated at `R-1`, trimmed to owned
   hardware (§14.3). `P0-6`.
10. ~~**The `small` visual-test subset**~~ — empty, focused-mid, full, invalid (§14.2). `P0-6`.
11. ~~**The element prefix**~~ — `dc-`, confirmed (§1.1). `P0-6`.

---

## 13. Flow (Java) API

```java
@Tag("dc-code-field")
@NpmPackage(value = "@cardoso/code-field", version = "<pinned>")
@JsModule("@cardoso/code-field/src/code-field.js")
public class CodeField extends AbstractSinglePropertyField<CodeField, String>
        implements Focusable<CodeField>, HasAllowedCharPattern, HasAriaLabel, HasHelper,
                   HasLabel, HasSize, HasStyle, HasThemeVariant<CodeFieldVariant>,
                   HasTooltip, HasValidationProperties, HasValidator<String>,
                   HasValueChangeMode,
                   InputField<ComponentValueChangeEvent<CodeField, String>, String> {

    public CodeField();
    public CodeField(String label);
    public CodeField(int length);
    public CodeField(String label, ValueChangeListener<ComponentValueChangeEvent<CodeField, String>> listener);

    public void setLength(int length);
    public int getLength();

    public void setOneTimeCode(boolean oneTimeCode);
    public boolean isOneTimeCode();

    public void setInputMode(String inputMode);
    public String getInputMode();

    public boolean isComplete();

    public Registration addCodeCompleteListener(ComponentEventListener<CodeCompleteEvent> listener);

    public void setI18n(CodeFieldI18n i18n);
    public CodeFieldI18n getI18n();

    // v1.1
    public void setGroups(int... sizes);
    public int[] getGroups();
    public void setSeparator(String separator);
    public String getSeparator();
    public void setMask(boolean mask);
    public void setMaskCharacter(String character);
    public void setPlaceholderChar(String placeholderChar);
    public void setAutoSelect(boolean autoSelect);
    public void setBlurOnComplete(boolean blurOnComplete);
}
```

**Changes from v1's §13, all consequences of §12:**

- `HasClearButton` **removed** (§6.1). `HasValue.clear()` remains; its javadoc must state
  that no clear affordance is rendered.
- `HasValueChangeMode` **added**, default `ON_CHANGE`. Without it, `AbstractSinglePropertyField`
  syncs eagerly and a 6-digit code costs six server round-trips — painful on mobile networks.
- `HasTooltip` **added** — standard on modern Vaadin fields.
- `HasAllowedCharPattern` used **instead of** a bespoke `setAllowedCharPattern`, so the
  property behaves identically to every other field that has it.
- Getters added throughout; v1 listed setters only.
- `CodeFieldI18n` carries **plain strings**. v1's `slotLabel(index, length)` was a function
  and could not cross the Flow boundary at all.

**Verified against Vaadin 25 (`P0-3`, source-read from 25.2.8 sources jars).** The base
assumption holds: `AbstractSinglePropertyField` is still what Vaadin's own fields extend
(`TextField → TextFieldBase → AbstractSinglePropertyField`), it is not deprecated, and no
newer validation base exists. Packages:

| Type | FQN | Maven artifact |
|---|---|---|
| `HasAllowedCharPattern`, `HasTooltip`, `HasValidationProperties`, `ValidationUtil`, `InputField` | `com.vaadin.flow.component.shared.*` | **`vaadin-flow-components-base`** |
| `HasValueChangeMode` | `com.vaadin.flow.data.value` | `flow-data` |
| `HasValidator` | `com.vaadin.flow.data.binder` | `flow-data` |

Three consequences:

- **`vaadin-flow-components-base` must be an explicit dependency.** It is *not* transitive via
  `flow-server` / `flow-data`.
- **`InputField<E, V>` added** to the interface list, matching `TextFieldBase`. It already
  extends `HasTooltip`, `HasLabel`, `HasHelper`, `HasSize`, `HasStyle` and `HasEnabled` — those
  are listed above redundantly, kept explicit because this is a specification.
- **`HasValueChangeMode`'s methods are abstract** and the interface defines no default. The
  `ON_CHANGE` default must be set in the constructor, exactly as `TextField` does.

**Validation is hand-rolled** — `getDefaultValidator()` + `setManualValidation()` +
`validate()`, composing constraints with the supported `ValidationUtil` statics and setting
`invalid` / `errorMessage` directly. Vaadin's own fields delegate to `ValidationController`,
which lives in `com.vaadin.flow.component.shared.**internal**`; we do not depend on it. See
[ADR-0002](./docs/adr/0002-hand-rolled-flow-validation.md). The implementation must reproduce
one behaviour we lose by not inheriting it: **do not clobber a developer-set custom error
message**, and test that.

### 13.1 `CodeCompleteEvent`

```java
@DomEvent("code-complete")
public class CodeCompleteEvent extends ComponentEvent<CodeField> {
    public CodeCompleteEvent(CodeField source, boolean fromClient,
                             @EventData("event.detail.value") String value) { … }
    public String getValue();
}
```

- `getValue()` reads the event payload. Because §7.7 makes completion a commit *and* the
  client forces a value sync alongside the event, `field.getValue()` is also correct inside
  the listener — but the event payload is the documented access path, and both must agree.
- The event is only ever fired from the client and only for user-originated completions
  (§7.6), so `isFromClient()` is always `true`.
- Javadoc must state the ordering (§7.7): `ValueChangeEvent` precedes `CodeCompleteEvent`.

### 13.2 Value semantics

- The empty value is `""`, not `null` — consistent with `TextField`.
- Client-side sanitising and truncation (§6.5) **must round-trip to the server**, or Flow's
  model value and the client diverge. `setLength` shrinking below the current value length,
  and `setAllowedCharPattern` narrowing under an existing value, both truncate/filter on the
  client and must propagate back as a value change.
- Required-indicator, `Binder` integration, `setManualValidation` and the two constraint
  error messages (§8) follow the standard field contract.
- `CodeFieldVariant` ships with `SMALL` (§9). A one-value enum is thin but grows, and
  omitting `HasThemeVariant` in v1 would break size parity expectations.

---

## 14. Testing

### 14.1 Unit / integration (web component)

- **Value:** set/get; setter sanitising (`"123-456"` → `"123456"`, disallowed chars);
  truncation to `length` **with warning**; shrinking and growing `length` with a value
  present; `clear()`; `length` coercion and rejection of `0`/negative/non-integer.
- **Typing:** overwrite vs. append; rejection by `allowedCharPattern`; typing when full;
  typing at every cell index.
- **Deletion:** Backspace on a filled cell; Backspace at the append position; Delete on cell
  0 of a full code (`complete` flips false); selection delete; word delete.
- **Navigation:** arrows, Home/End, Shift+Arrow, click-to-position on **every** cell,
  backward-selection direction in Firefox (§7.8.1.5).
- **Focus:** empty / partial / full caret placement; `readonly` (focusable, no active cell,
  no caret); `disabled` (not focusable).
- **Paste:** full; partial into half-filled; over a selection; oversized (truncation); with
  separators (`123-456`); with disallowed characters; empty clipboard; selection restored to
  the last cell after a full paste.
- **Input pipeline:** `beforeinput` fast path does not rewrite the value; rejection path uses
  `setRangeText`; composition sanitiser rewrites only the offending range and restores
  selection + fires synthetic `selectionchange`; no `maxlength` on the input.
- **Events:** `value-changed` count per keystroke; `code-complete` exactly once per
  user transition; refires after edit-and-refill; **does not fire on any programmatic set,
  complete or partial, including the truncation path**; `input` delivered exactly once (no
  re-dispatch).
- **Commit:** completion order `value-changed` → `change` → `code-complete`; `change` not
  re-fired by a subsequent blur of the same value; programmatic completion commits nothing.
- **Validation:** required; partial-length invalid; the two messages are distinct and come
  from `i18n`; validation on blur and `validate()` but **not** per keystroke;
  `manualValidation`.
- **A11y:** single tab stop; accessible name from `label`; decorative layer `aria-hidden`;
  `aria-describedby` wiring; `aria-invalid`.
- **Geometry:** cells shrink to the 24px floor; field overflows past it; cells never wrap;
  the input is out of flow; exactly one `ResizeObserver`; no resize loop across a container
  resize; cell row is LTR under `dir="rtl"`.
- **Theming hooks:** `active` / `filled` / `cell-index` land on the right cells at each step;
  `[complete]` toggles correctly mid-edit.
- **Base coupling:** the §4.1 canary test.
- **Page CSS:** a page-level `input { color: red }` and `-webkit-text-fill-color` do not
  reveal the underlying text (§11.12).
- **v1.1:** `groups` summing; mismatched sum warns and is ignored; separators absent from
  `value`; `mask`; `placeholderChar`; `autoSelect`; `blurOnComplete` (and no duplicate
  `change`).

### 14.2 Visual (both themes)

Empty, partial, full, focused-empty, focused-mid, focused-full, invalid, disabled, readonly,
grouped (v1.1), masked (v1.1), RTL chrome, `prefers-reduced-motion`, dark.

- Both themes × light/dark.
- `small` variant on a **subset** — empty, focused-mid, full, invalid. **Confirmed** (`P0-6`):
  empty and full bracket the cell-sizing range the variant actually changes, focused-mid
  catches the active-cell treatment at small size, and invalid is the one state where the
  border change can collide with tighter cell metrics. Every other state in the list varies
  chrome, not cell sizing, and the variant is cell-sizing-only.

Baselines are produced by `@web/test-runner-visual-regression` inside a **pinned container**
— a standalone repo has none of the monorepo's screenshot infrastructure, and unpinned
renderers rot baselines within weeks.

### 14.3 Manual / device matrix

Not coverable headlessly, and this is the part that actually breaks. The iOS path is gated
behind `@supports (-webkit-touch-callout: none)`, which never matches in headless WebKit,
Playwright's included.

**Owner: the author. Gate: `R-1` only** (`P0-6`). Trimmed to hardware that actually exists —
an iPhone and a desktop Chrome with 1Password. Rows are marked **RUN** or **UNTESTED**, and
every `UNTESTED` row is repeated verbatim in the README's limitations section. A matrix
padded with rows nobody can run is how an unowned matrix gets run once and never again.

| Case | Platforms | Status |
|---|---|---|
| SMS / security-code autofill | iOS Safari | **RUN** |
| Long-press → Paste | iOS Safari | **RUN** |
| Selection artefact | iOS Safari | **RUN** |
| Autofill background override | Chrome, iOS Safari | **RUN** |
| Undo/redo, select-all | desktop Chrome | **RUN** |
| Extension fill + badge placement | 1Password / Chrome | **RUN** — the `P0-1` probe |
| Extension TOTP fill into `one-time-code` | 1Password / Chrome | **RUN**, answers §7.5 for 1Password only |
| **Android composition & autocorrect, alphanumeric `allowedCharPattern`** | Android Chrome + GBoard | **UNTESTED** — no device |
| **Undo across the composition sanitiser** | Android Chrome | **UNTESTED** — no device |
| Extension fill on Bitwarden / LastPass / Firefox | desktop | **UNTESTED** — mitigated by always-widen |
| SMS autofill on Android / iOS Chrome | mobile | **UNTESTED** — no device |
| **Selection artefact with `groups` set** *(v1.1)* | iOS Safari | deferred with `V11-1` |

**Firefox is not lost.** CI runs `@web/test-runner-playwright` with a Firefox launcher, so
`W-3`'s backward-selection case is covered automatically. Only the *extension badge* row
drops, and always-widen makes it informational rather than blocking.

**The Android gap is the accepted risk of v1.** Alphanumeric ships, and §7.8.3's post-hoc
sanitiser is its mitigation — untested against the failure mode it exists for. The risk
register row stays **open**, and the README says so plainly.

### 14.4 Flow

- Value round-trip; `Binder` binding and validation; both constraint messages.
- `setLength` after attach, including truncation round-tripping back to the server (§13.2).
- `ValueChangeMode` default `ON_CHANGE`; the forced sync on completion.
- `CodeCompleteEvent`: payload correct, `field.getValue()` correct inside the listener,
  ordering after `ValueChangeEvent`, never fired for a server-set value.
- i18n round-trip.
- TestBench `CodeFieldElement`: `setValue`, `getValue`, `type`, `paste`, `isComplete`,
  `getCellCount`, `getActiveCellIndex`.

---

## 15. Phasing

Phase 0 (gates), v1 and v1.1, broken into tasks and steps across both packages: **see
[PLAN.md](./PLAN.md)**.

Summary:

- **Phase 0 — gates. Blocks Phase 1.** Badge measurement, third-party Aura authoring, the
  `field-base` override-point appendix, design sign-off on the mid-edit slide, the version
  pin, and the toolchain decisions. Two of these can change the architecture.
- **v1** — single-input architecture; `length`, `value`, `allowedCharPattern`, `oneTimeCode`,
  `inputMode`, `complete`; typing / deletion / navigation / paste / fill; the full input
  pipeline; commit semantics; validation with both messages; full field chrome; shrink-to-fit
  geometry; LTR cells; Lumo + Aura; `small`; the Flow module with integration tests; the
  TestBench element.
- **v1.1** — `groups` / `separator`, `mask`, `placeholderChar`, `autoSelect`,
  `blurOnComplete`, per-cell i18n labels as templates.
- **Later** — additional size variants, progressive-enhancement fallback. `autoSubmit` is
  cut, not deferred.
