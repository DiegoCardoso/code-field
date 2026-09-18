# `code-field` — Delivery Plan

**Companion to:** [SPEC.md](./SPEC.md) (v2, decision-locked)
**Repo:** one repo, two packages — `web/` (npm `@cardoso/code-field`) · `flow/` (Maven `dev.cardoso:code-field-flow`)
**Posture:** published 0.x, best-effort, solo maintainer

---

## How to read this

- Task IDs: `P0-n` (Phase 0 gates), `W-n` (web component), `F-n` (Flow), `R-n` (release).
- **Every task has an exit criterion that is a checkable artefact**, not "done". This plan was
  first written in a team register — "a check *someone else* can run", "name an owner", "put it
  to design". There is no someone else. Gates are therefore **artefact-shaped**: a committed
  recording, a passing test, a written finding. A solo gate that depends on remembering to be
  rigorous is not a gate.
- **Phase 0 blocks Phase 1.** Not a formality: `P0-1` and `P0-2` can change the
  architecture, and `P0-3` is the input to every Phase 1 estimate. Building cell rendering
  before they land means rewriting it.
- Where a task's shape depends on a Phase 0 outcome, the dependency is named. Nothing in
  Phase 1 is estimated here, because estimating before `P0-3` would be fiction.

---

# Phase 0 — Gates

Cheap, parallel, and mandatory. Output is a short written finding per task, appended to
SPEC.md as a resolution of the matching §12.1 item.

### `P0-1` — Password-manager measurement — 🔶 **NARROWED**
**Closes:** SPEC §11.6, §12.1.1 · **Blocks:** `W-5`, `W-6`

The v1 premise ("extensions can't see into shadow DOM") was wrong — the input is light DOM.
So fill works, the badge appears over the last cell, and badge avoidance is *required*. What
is unknown is the geometry.

**One of the two decisions is now taken up front: always-widen, no runtime detection.**
Detection means sniffing for extension-injected DOM, which changes without notice and would
have to be re-measured forever; always-widen costs a few pixels and deletes a branch and its
bug class. That leaves the probe needing to produce a *constant*, not a decision — so one
browser and one extension suffice.

**Steps**
1. Stand up a throwaway page: a bare light-DOM `<input autocomplete="one-time-code">`, and a
   second one inside a custom element with a shadow root and a slotted input (mirroring
   SPEC §5), both at several widths.
2. Install **1Password on Chrome** (the hardware that exists — §14.3).
3. Record: badge width and height, what it anchors to (input box or field), whether it
   repositions on resize.
4. Record whether **TOTP fill into `one-time-code`** works, whether it dispatches `input`,
   and whether it needs the polling detection from SPEC §7.5.
5. Record whether it offers "save login" against the field, and whether that is suppressible.
6. Prototype both clip strategies — `clip-path` on the input, and `overflow` on the container
   — and check native click-to-position still resolves at the **last** cell, and that the
   focus ring is not clipped.

**Exit criteria**
- A widen constant, applied unconditionally.
- A named clip mechanism, with the caret-resolution check passing.
- SPEC §7.5 updated with a 1Password/Chrome answer on TOTP fill, **scoped as such**.
- Bitwarden, LastPass and Firefox recorded as `UNTESTED` in §14.3 and in the README.

### `P0-2` — Third-party Aura authoring — ✅ **RESOLVED** (see [P0-FINDINGS.md](./P0-FINDINGS.md))
**Closes:** SPEC §9, §12.1.2 · **Blocks:** `W-8`, and `W-1`'s dependency set

SPEC §9 is not implementable until this is known. In-tree components ship `theme/lumo/*.js`
through the monorepo's own machinery; from outside it, Lumo works via
`@vaadin/vaadin-lumo-styles` tokens plus `registerStyles` from `@vaadin/vaadin-themable-mixin`.
The Aura equivalent is unknown.

**Steps**
1. Install Vaadin 25's published packages into a scratch project. Establish whether Aura is a
   registered theme, a CSS-layer/token system, or something else.
2. Determine how a component *outside* the monorepo contributes Aura styles: `registerStyles`
   with a theme name, a CSS file the app imports, `@layer` ordering, or unsupported.
3. Determine which package the Aura tokens live in and whether it is a public dependency.
4. Build a one-cell throwaway component styled under both themes, and confirm theme switching
   works from an app without patching the component.
5. Record whether `theme` attribute variant propagation (`ThemePropertyMixin`) behaves the same
   for a third-party tag name.

**Exit criteria**
- A working two-theme scratch component, plus the exact dependency list and registration
  mechanism written into SPEC §9.
- If third-party Aura authoring turns out to be unsupported: **stop and re-decide** —
  fall back to Lumo-only v1 with Aura in v1.1. That is a scope decision, not an
  implementation detail.

### `P0-3` — `field-base` override-point appendix — 🟡 **MOSTLY RESOLVED** (hook table + paste conflict settled; Flow probe and container prototype outstanding)
**Closes:** SPEC §4.1, §12.1.3, §13's verification note · **Blocks:** all of Phase 1's
estimating, and `W-2`/`W-3`/`W-4` directly

The single highest-leverage Phase 0 task. `InputMixin`/`InputFieldMixin` already own
`_onInput`, value commit and `allowedCharPattern`; SPEC §7.8's pipeline must own `input` and
run its sanitiser *before* the mixin's commit.

**Steps**
1. Read the pinned version's `@vaadin/field-base` sources: `InputMixin`, `InputFieldMixin`,
   `InputController`, `LabelledInputController`, `ValidateMixin`, `DelegateStateMixin`,
   `<vaadin-input-container>`.
2. Write the appendix: for each hook the component touches — `_onInput`, `_onChange`,
   `_setHasValue`, `_valueChanged`, `checkValidity`, `_inputElementChanged`, the
   `allowedCharPattern` implementation — record whether it is called with `super`, wrapped, or
   replaced, and where the sanitiser sits.
3. ~~Identify what `allowedCharPattern` in the base already does.~~ **Done.** The base's
   `beforeinput`/`keydown` rejection is reused; its **paste and drop handlers gate the whole
   payload and must be replaced** (SPEC §4.1's hook table, P0-FINDINGS `P0-3`).
4. Confirm `<vaadin-input-container>` tolerates a sibling decorative layer and an
   absolutely-positioned slotted input without fighting its own padding/border.
5. ~~Verify the Flow-side interface list in SPEC §13 against Vaadin 25.~~ **Done**, source-read
   from the 25.2.8 sources jars. `AbstractSinglePropertyField` holds; `InputField` and the
   explicit `vaadin-flow-components-base` dependency added; `HasValueChangeMode`'s methods are
   abstract. See SPEC §13 and P0-FINDINGS `P0-3`.
6. Write the **canary test** (SPEC §4.1) asserting presence and arity of every hook the
   appendix names.

**Exit criteria**
- The appendix committed as `web/docs/field-base-integration.md`, referenced from SPEC §4.1.
- The canary test committed and passing. **Raised in importance:** ADR-0001 replaces exact
  version pinning with a peer range, so the canary is now the *only* guard against a
  `field-base` internals change reaching users.
- ~~SPEC §13's verification note resolved.~~ Done.

### `P0-4` — Sign-off on the mid-edit slide — 🔶 **REFRAMED** (no design function)
**Closes:** SPEC §7.1, §12.1.4 · **Blocks:** nothing technically; blocks *committing* to the
editing model

There is no design function to sign off. The gate survives anyway: losing the reviewer does
not lower the risk, it removes the person who would have caught it — and this guards `W-3` and
`W-4`, the two hardest tasks on the critical path.

**Steps**
1. Build a throwaway animated prototype: a 6-cell field, value `"1234"`, caret on cell 1,
   Backspace — recorded, not a still.
2. Show the same for `Delete` on cell 0 of a full code (`complete` flips false mid-edit).
3. Build the *N*-input alternative alongside it (deletion leaves a hole) so the trade is
   visible rather than argued.

**Exit criteria**
- Both recordings committed to the repo — not left in a browser tab. This is the artefact that
  makes the gate real.
- **Reviewed at least a day after building**, so the judgement is not the builder's sunk cost.
- Written verdict in `P0-FINDINGS.md`: compact-string confirmed, or the editing decision
  reopened. Reopening invalidates much of SPEC §7 — which is exactly why this is Phase 0 and
  not a Phase 1 review.

### `P0-5` — Version pin and platform reality — ✅ **RESOLVED** (and the first answer was wrong)
**Closes:** SPEC §12.1.5

Vaadin 25 is GA. But the first pass read npm `dist-tags` and assumed the Java platform
followed. It does not — **npm is at `25.2.12`, Maven Central tops out at `25.2.8`, and
`25.2.10` was never published to Maven at all.** Vaadin's own
`vaadin-text-field-flow:25.2.8` declares `@NpmPackage(version = "25.2.11")`: the two release
lines are deliberately decoupled, so "record it identically in both repos" was never
satisfiable — nor is it a discipline Vaadin itself keeps.

**Resolved**
1. Vaadin 25 GA — the moving-pre-release-base risk does not apply. 25.3 is in rc, so there is
   a known next bump for the canary to guard.
2. **Maven `25.2.8`; `@NpmPackage` `25.2.11`; web `package.json` declares `@vaadin/*` as
   `peerDependencies: "^25.2.0"`** with exact `devDependencies`. Exact-pinning a dependency the
   host application already owns makes npm install a second copy of `field-base` — two
   `InputMixin` class identities in one app, invisible to the canary. See
   [ADR-0001](./docs/adr/0001-vaadin-deps-are-peer-ranges-not-exact-pins.md).
3. **Bump policy:** deliberate, single-commit, canary must pass. It covers **two pins under one
   policy**, not one version in two places.
4. **JDK 21** — verified: `flow-project`'s POM sets `maven.compiler.release=21`,
   `TextField.class` is bytecode 65.

**Exit criteria** ~~A pinned version in both repos~~ → the peer range, the two pins, the written
bump policy, and JDK 21 in the Maven config and CI.

### `P0-6` — Toolchain and ownership decisions — ✅ **RESOLVED**
**Closes:** SPEC §12.1.6, §12.1.7, §12.1.8, §12.1.9

0. **Repo shape:** one repo, `web/` and `flow/` as sibling packages, public on GitHub. SPEC's
   "two standalone repos" is superseded (SPEC §1.1) — chiefly because local linking across two
   repos is per-machine `npm link` state that CI cannot reproduce.
1. **Local path, not early publish.** `flow/` resolves the web package as `file:../web` until
   `W-7`, then `0.0.x` prereleases begin. Consequence to hold onto: **the Flow ITs cannot run
   in CI until `W-7`**, because a clean CI checkout has no published package to resolve. Flow
   CI switches on partway through Phase 1; it is not an `F-1` deliverable.
2. **Web CI, on push:** lint, typecheck, unit tests in Chromium **and Firefox**, visual
   regression in a **pinned container** (unpinned renderers rot baselines).
3. **Flow CI:** ITs **nightly**, from `W-7`.
4. **Device matrix:** owner is the author, gate is **`R-1` only**, and the matrix is trimmed to
   hardware that exists — iPhone, desktop Chrome + 1Password. Untestable rows are marked
   `UNTESTED` in SPEC §14.3 and repeated in the README rather than quietly carried. Naming
   yourself owner of a matrix you cannot run is how it gets run once and never again.
5. **`small` visual subset:** empty, focused-mid, full, invalid (SPEC §14.2).
6. **Element prefix `dc-`, confirmed** (SPEC §1.1).
7. **Test stack mirrors Vaadin exactly:** `@web/test-runner` + `@web/test-runner-playwright` +
   `@web/test-runner-visual-regression`, Playwright `~1.63` — verified against
   `vaadin/web-components@main`. Playwright's own runner has better visual-diff DX, and was
   rejected because it would turn an upstream PR from a rename into a test rewrite (`W-1.4`).
8. **Issue tracker:** GitHub Issues (`docs/agents/issue-tracker.md`).

**Exit criteria** All of the above written into `CONTRIBUTING.md`; the prefix applied.

---

# Phase 1 — v1

Two tracks. The web track is strictly sequential through `W-4`; after that it fans out. The
Flow track can start at `F-1` in parallel but must not cut the Java API until the web value/
event surface has stopped moving (end of `W-7`).

## Web component

### `W-1` — Repo scaffolding
**Depends:** `P0-2` (dependency set), `P0-5` (pin), `P0-6` (prefix, CI)

1. `git init`; one repo with `web/` and `flow/`; license, `README`, `CONTRIBUTING.md` carrying
   the `P0-6` decisions; public GitHub remote; the five triage labels created
   (`docs/agents/triage-labels.md`).
2. `web/package.json`: name `@cardoso/code-field`, `@vaadin/*` as **`peerDependencies:
   "^25.2.0"`** with exact `devDependencies` (ADR-0001 — *not* exact runtime pins), exports map.
3. Toolchain **mirroring `vaadin/web-components` exactly**: `@web/test-runner` +
   `@web/test-runner-playwright` + `@web/test-runner-visual-regression`, Playwright `~1.63`.
   Baselines generated in a pinned container.
4. Lint/format matching Vaadin's conventions, so an upstream PR is a rename not a reformat.
5. A dev page per SPEC §14.2's states, used for manual work and visual baselines. Include a
   **live state readout** — `value`, `complete`, active cell index, selection range — plus an
   **event log** for `input`, `value-changed`, `change` and `code-complete`, in that order.
   The mockup (SPEC §9.2) demonstrates the pattern, and it is the fastest way to see §7.6's
   user-originated rule and §7.7's commit ordering actually holding.
6. CI per `P0-6`: push → lint, typecheck, unit (Chromium + Firefox), visual. Flow ITs are
   **not** wired yet — they cannot run until `W-7` (`P0-6.1`).
7. Commit the `P0-3` canary test into the unit suite.

**Exit:** `npm test` green on an empty component; CI green; dev page loads.

### `W-2` — Field shell
**Depends:** `W-1`, `P0-3`

1. `code-field.js` + `code-field-mixin.js`, composing per the `P0-3` appendix:
   `InputFieldMixin`, `InputController`, `LabelledInputController`,
   `<vaadin-input-container>`, `ThemableMixin`, `ElementMixin`, `DirMixin`.
2. Shadow template per SPEC §5, with the cell layer and the `input` slot.
3. `label` / `helperText` / `errorMessage` / `required` / `invalid` / `disabled` /
   `readonly` / `name` / `autofocus` / `tooltip` inherited and verified working.
4. Input attributes: `inputmode`, `spellcheck="false"`, `autocorrect="off"`, `autocomplete`
   from `oneTimeCode`. **No `maxlength`** (SPEC §7.8.4).
5. `length`, `value`, `complete` declared; setter rules from SPEC §6.5 including the console
   warnings.

**Exit:** the field renders label/helper/error identically to a `<vaadin-text-field>` in a
side-by-side dev page; SPEC §14.1's "Value" bullet passes; the canary test passes.

### `W-3` — Selection engine
**Depends:** `W-2` · **The hard part. Do not parallelise it with `W-4`.**

Implements SPEC §7.8.1 and §7.3.

1. Selection-to-active-cell derivation.
2. Collapsed-caret widening on `selectionchange`, with the **append-position exception**.
3. Direction inference against the previous range, with the out-of-append-mode guard.
4. Manual `selectionchange` dispatch on deletion and cut.
5. Always pass the third `direction` argument to `setSelectionRange`.
6. Focus placement: empty → 0; partial → append position; full → clamp to `length - 1`.
7. Arrow / Home / End / Shift+Arrow.
8. `readonly` and `disabled` degradation per SPEC §7.8.5.

**Exit:** SPEC §14.1's Navigation and Focus bullets pass, including the Firefox
backward-selection case and click-to-position on every cell.

### `W-4` — Input pipeline
**Depends:** `W-3`

Implements SPEC §7.8.2–§7.8.4, §7.1, §7.2, §7.4.

1. One sanitiser function, shared by the setter (§6.5), `beforeinput`, the composition pass
   and paste.
2. `beforeinput` fast path: untouched data proceeds natively; stripped data →
   `preventDefault` + `setRangeText`.
3. Composition / autocorrect pass on `input`/`compositionend`: rewrite only the offending
   range via `setRangeText`, restore selection, dispatch synthetic `selectionchange`.
   **Never assign `input.value` wholesale in an editing path.**
4. Pipeline truncation to `length`.
5. Paste: sanitise → splice at caret / over selection → truncate → restore selection to the
   last cell.
6. Typing/deletion semantics per SPEC §7.1–§7.2.
7. Value-restored-before-upgrade adoption (SPEC §11.7), through the sanitiser.

**Exit:** SPEC §14.1's Typing, Deletion, Paste and Input-pipeline bullets pass, including the
assertion that the fast path performs no rewrite.

### `W-5` — Cell rendering and geometry
**Depends:** `W-4`, `P0-1` (badge widen amount)

Implements SPEC §7.9.

1. Render cells from `length`; `cell-index`, `active`, `filled`; synthetic `caret`. The
   **active border is the primary indicator, the caret secondary** (SPEC §9) — the caret must
   never be the only thing marking the active cell, because `prefers-reduced-motion` stops it
   blinking and nothing marks a *selected* cell at all.
2. Cells as flex items, `flex-shrink`, `min-width: 24px` floor — **shrink in CSS, no JS
   sizing.** Natural height comes from `--vaadin-field-baseline-input-height` so a cell row
   lines up with a text field beside it (SPEC §9.1).
3. Input absolutely positioned, out of flow, with the two-reason comment (SPEC §7.9.4).
4. The single `ResizeObserver`: field height → input `font-size` (SPEC §11.4). Assert no
   second observer and no loop.
5. `direction: ltr` on the cell row and input; chrome mirroring left to `DirMixin`.
6. Widen-and-clip per `P0-1`'s findings.
7. No wrapping; overflow past the floor.

**Exit:** SPEC §14.1's Geometry bullet passes; a container-resize test shows no observer
loop; RTL test shows LTR cells with mirrored chrome.

### `W-6` — Fill, hazards, hardening
**Depends:** `W-4`, `P0-1`

1. `oneTimeCode` → `autocomplete="one-time-code"`.
2. Fill detection polling (SPEC §7.5, §11.3) covering OS autofill, browser autofill and
   extension fill; synthetic `input`; all three flagged **user-originated**.
3. `:autofill` / `:-webkit-autofill` override set, including `-webkit-text-fill-color`.
4. The five hiding properties as `!important` (SPEC §11.12). Add the page-CSS regression
   test.
5. `opacity: 1` invariant with a comment saying why (SPEC §11.1); `::selection` with both
   declarations.
6. iOS letter-spacing compression behind `@supports (-webkit-touch-callout: none)`.
7. Defensive stylesheet insertion (SPEC §11.8).

**Exit:** SPEC §14.1's page-CSS test passes; the §14.3 desktop and autofill rows are run once
manually and recorded.

### `W-7` — Validation, commit, events
**Depends:** `W-4` · **Gate for `F-2`: the Java API must not be cut before this lands.**

1. The `_programmatic` origin flag, set only by the property setter (SPEC §7.6).
2. `code-complete` on the user-originated transition only.
3. Completion commit: `value-changed` → `change` → `code-complete`; `change` at most once per
   committed value (SPEC §7.7).
4. `complete` reflected, not latched.
5. Two constraints with two `i18n` messages (SPEC §8); validation on blur and `validate()`
   only.
6. `manualValidation`, `validated`, `checkValidity()`.
7. Confirm `input` is **not** re-dispatched.

**Exit:** SPEC §14.1's Events, Commit and Validation bullets pass — in particular
"`code-complete` does not fire on any programmatic set, including the truncation path".

### `W-8` — Base styles (Lumo + Aura via tokens)
**Depends:** `W-5` · **Smaller than originally planned** — `P0-2` established that Vaadin 25
components ship their own base styles and the themes are token layers, so this is one
stylesheet, not two theme implementations.

1. One base stylesheet as Lit `css`, **deriving** per SPEC §9.1. **Confirm each row of that
   table against the pinned packages first — it is provisional.** Cell height must reproduce
   field-base's own computation (`1lh + --vaadin-padding-block-container × 2 +
   --vaadin-input-field-border-width × 2`) so a cell row aligns with a text field beside it;
   `--vaadin-field-baseline-input-height` is an override hook, not a theme-set token. Define
   `--vaadin-code-field-*` only for gap, radius, active border width, caret and separator
   colour.
   Radius follows the platform's own pattern:
   `var(--vaadin-code-field-cell-radius, var(--vaadin-radius-s))` (SPEC §9.1).
   Per-state treatment per SPEC §9.1.1, including read-only via
   `--vaadin-input-field-readonly-border` — source-verified, so nothing here is invented.
2. Caret blink respecting `prefers-reduced-motion`; tabular numerals;
   invalid/disabled/readonly; dark handled by the tokens.
3. `ThemeDetectionMixin` (public) only where a token cannot express an Aura/Lumo difference.
   **Never** `LumoInjectionMixin` or `ThemeDetector` — both are documented internal-only.
   **Target: zero such rules — a target, not a prediction.** The two themes reach the same
   treatment by different mechanisms in places (read-only: dashed border in Lumo, zeroed
   surface opacity in Aura). Record every scoped rule added, with its reason, so the count
   stays visible instead of drifting.
4. Sanity-check against the mockup's geometry (SPEC §9.2): Aura ≈44×48/6/9px, Lumo
   ≈40×40/8/8px. Landing far from those means the derivation is wrong, not that the numbers
   should be hard-coded.
5. `small` variant — cell sizing and font only, not chrome spacing.
4. Neither theme may fork behaviour: no theme-specific JS, no overriding the LTR rule or the
   five hiding properties.

**Exit:** SPEC §14.2's matrix has committed baselines for both themes × light/dark, plus the
`small` subset from `P0-6`.

### `W-9` — Test completion and docs
**Depends:** `W-5`…`W-8`

1. Close every remaining SPEC §14.1 bullet.
2. Run SPEC §14.3's rows owned per `P0-6`; record results in the repo, not in a chat.
3. `README` with the API table, the `code-complete` → verify pattern (replacing the cut
   `autoSubmit`), and the documented limitations: undo best-effort on the sanitiser path
   (§11.9), iOS selection artefact (§11.5), page CSS (§11.12), `mask` is not secrecy (§3).
4. TypeScript typings + a typings test.

**Exit:** full SPEC §14.1 green; §14.3 recorded; typings test passes.

## Flow module

### `F-1` — Maven scaffolding
**Depends:** `P0-5`, `P0-6`

1. Multi-module Maven layout under `flow/`: `code-field-flow`,
   `code-field-flow-integration-tests`.
2. `dev.cardoso:code-field-flow`, Vaadin BOM **`25.2.8`**, **JDK 21** (`P0-5`). Add
   **`vaadin-flow-components-base`** explicitly — `HasAllowedCharPattern`, `HasTooltip`,
   `HasValidationProperties`, `ValidationUtil` and `InputField` all live there and it is *not*
   transitive via `flow-server`/`flow-data` (`P0-3`).
3. `@NpmPackage` → `file:../../web` until `W-7`, then `25.2.11`-era published `0.0.x` (`P0-6.1`).
4. CI per `P0-6`: **ITs are nightly and switch on at `W-7`**, not here.

**Exit:** empty module builds; the IT module starts a Vaadin dev server from a clean checkout
using the relative path. *(Note: this exit criterion is reachable only because the repo is
unified — with two repos it would have required a published package or per-machine `npm
link`.)*

### `F-2` — `CodeField`
**Depends:** `F-1`, `W-7` (API frozen), `P0-3` (interface list verified)

1. Class + interface list per SPEC §13, **without** `HasClearButton`, **with**
   `HasValueChangeMode`, `HasTooltip`, `HasAllowedCharPattern`, `HasValidator<String>` and
   `InputField<…, String>`. `HasValueChangeMode`'s methods are **abstract** and the interface
   carries no default — set `ON_CHANGE` in the constructor, as `TextField` does (`P0-3`).
2. Constructors, all setters **and getters**.
3. `isComplete()` from the reflected property.
4. Value semantics per SPEC §13.2: empty is `""`; client sanitising/truncation round-trips to
   the server.
5. Javadoc: `clear()` renders no affordance; `mask` is not secrecy; `getValue()` staleness
   caveat resolved by the forced sync.

**Exit:** value round-trip and `Binder` unit tests pass; a `setLength` shrink truncates on the
client and the server model agrees.

### `F-3` — Event, i18n, validation
**Depends:** `F-2`

1. `CodeCompleteEvent` per SPEC §13.1: `@DomEvent`, `@EventData("event.detail.value")`,
   `getValue()`, `isFromClient()` always true.
2. The forced value sync on completion, so `field.getValue()` inside the listener is correct;
   assert it agrees with the payload.
3. `CodeFieldI18n` with `requiredErrorMessage` and `incompleteErrorMessage` — plain strings
   only.
4. Validation, **hand-rolled** (ADR-0002): `getDefaultValidator()` composing the two
   constraints via the supported `ValidationUtil` statics, `setManualValidation()`,
   `protected void validate()` setting `invalid`/`errorMessage` directly, and
   `getElement().setProperty("manualValidation", true)` in the constructor so the server owns
   validation. **No `ValidationController`** — it lives in `…component.shared.internal`.
   Reproduce and test the one behaviour we forgo by not inheriting it: a developer-set custom
   error message must not be clobbered.
5. `CodeFieldVariant.SMALL`.

**Exit:** SPEC §14.4's event bullets pass, including "never fired for a server-set value" and
the ordering after `ValueChangeEvent`.

### `F-4` — TestBench element
**Depends:** `F-2`

`CodeFieldElement` with `@Element("dc-code-field")`: `setValue`, `getValue`, `type`, `paste`,
`isComplete`, `getCellCount`, `getActiveCellIndex`.

**Exit:** used by `F-5`'s ITs; no IT reaches into the shadow root directly.

### `F-5` — Integration tests
**Depends:** `F-3`, `F-4`

Views + ITs for: value round-trip; `Binder` + both constraint messages; `setLength` after
attach with truncation; `ValueChangeMode`; `CodeCompleteEvent` payload, ordering, and
never-on-server-set; i18n; disabled/readonly.

**Exit:** SPEC §14.4 green in CI at the cadence `P0-6` chose.

## Release

### `R-1` — v1 (**`0.1.0`**, not `1.0.0`)
The posture is *published 0.x, best-effort* — a `1.0.0` makes a support promise that is not
being made. Version accordingly and say so in the README.

1. Prefix and package names final (`P0-6`) — `dc-`, `@cardoso/code-field`,
   `dev.cardoso:code-field-flow`.
2. npm `0.1.0`. Maven release requires the `dev.cardoso` groupId on Sonatype Central, which
   needs a DNS TXT record on **`cardoso.dev`** — start this early, it is the one release step
   with an external dependency and a waiting period.
3. SPEC §14.3's **RUN** rows executed and recorded in the repo; the **UNTESTED** rows copied
   verbatim into the README.
4. `README` limitations section complete: undo best-effort on the sanitiser path (§11.9), iOS
   selection artefact (§11.5), page CSS (§11.12), `mask` is not secrecy (§3), **Android
   composition untested**, **badge geometry measured on 1Password/Chrome only**.
5. SPEC §12.1 empty, or each remaining item explicitly deferred with a reason.

---

# Phase 1.1

Ordered by risk, not by size. `groups`/`separator` first, because SPEC §11.10 means it can
change what "supported" means on iOS.

### `V11-1` — `groups` and `separator`
1. `groups="3 3"` parsing, sum validation, console warning on mismatch, `getGroups(): int[]`.
2. `part="separator"` with `separator-index`; the glyph; theming in both themes.
   `separator=""` renders the same element with no glyph — gap-only grouping, free, and
   purely cosmetic (SPEC §9).
3. Selection and caret behaviour across a separator. One outline *per group* is rejected —
   it fragments a cross-boundary selection (SPEC §9).
4. **Run SPEC §14.3's grouped-iOS row before declaring it supported** — §11.10 says native
   selection cannot track grouped cells, and iOS is where that becomes visible.
   **If it is bad, the fallback is not shipping `groups`.** Gap-only is *not* a fallback: the
   cost is the separator's width, which `separator=""` keeps. A narrower separator is the only
   partial relief. Treat a bad result as a scope decision, not a default-value tweak.
5. Visual baselines for the grouped states.

### `V11-2` — Display options
`mask` (boolean/character), `placeholderChar`. Docs must repeat that `mask` is not secrecy.

### `V11-3` — Focus conveniences
`autoSelect`, `blurOnComplete` — the latter under the user-originated rule (SPEC §7.6) and
with the no-duplicate-`change` assertion (SPEC §7.7).

### `V11-4` — Per-cell i18n
A **template string** (`"Character {index} of {length}"`), not a function, so it crosses the
Flow boundary. Not applied by default.

### `V11-5` — Flow parity
The v1.1 setters/getters, i18n additions, TestBench additions, ITs.

---

# Sequencing

```
P0-1 ─┐
P0-2 ─┤
P0-3 ─┼─► W-1 ─► W-2 ─► W-3 ─► W-4 ─┬─► W-5 ─┬─► W-8 ─┐
P0-4 ─┤                             ├─► W-6 ─┤        ├─► W-9 ─► R-1
P0-5 ─┤                             └─► W-7 ─┴────────┘          ▲
P0-6 ─┘                                      │                   │
                                             │  F-1 ─► F-2 ─► F-3 ─► F-5
                                             └────────►│      F-4 ─┘
                                              (API freeze gate)
```

**Critical path:** `P0-3` → `W-2` → `W-3` → `W-4` → `W-7` → `F-2` → `F-3` → `F-5` → `R-1`.

Two things to protect:

- **`W-3` and `W-4` are one continuous piece of work.** The selection engine and the input
  pipeline are the same problem viewed twice. Written for a team, this said "don't split them
  across people". Solo it still binds: don't split them across *months*. Two incompatible
  mental models of where the active cell comes from are just as easy to build alone, with a
  long enough gap in between.
- **`W-7` is the API freeze gate for Flow.** Starting `F-2` before it lands means cutting the
  Java API against a moving value/event surface — the one thing that guarantees doing it twice.
  It is now **also the gate that switches on Flow CI**, since the ITs cannot resolve the web
  package before publishing begins (`P0-6.1`).

`F-1`, `W-8`'s theme scaffolding, and the dev pages are the genuinely parallelisable work —
which, solo, means "work available when the critical path is blocked", not "work happening
simultaneously".

---

# Risk register

| Risk | Trigger | Response |
|---|---|---|
| ~~Third-party Aura authoring unsupported~~ | `P0-2` | **Closed.** 25's theming is token-based; both themes come from one base stylesheet. No scope fallback needed. |
| ~~Vaadin 25 not GA~~ | `P0-5` | **Closed.** 25 is GA. *(The version itself was wrong — `25.2.10` is npm-only; see `P0-5`.)* |
| `field-base` internals shift under a bump | canary test fails | Deliberate bump policy; the canary asserts the eight hooks in SPEC §4.1. 25.3.0 is the known next bump. **Weight increased:** ADR-0001 drops exact pinning, so the canary is the only guard. |
| **Duplicate `@vaadin/field-base` copies in a consumer app** *(new)* | two `InputMixin` identities; component works in isolation, misbehaves in an app | `peerDependencies: "^25.2.0"` so npm dedupes to the app's copy and a mismatch is a loud install warning (ADR-0001). Exact pinning **causes** this risk rather than mitigating it. |
| Base `allowedCharPattern` re-enters the paste path on a bump | canary test fails | `_onPaste`/`_onDrop` are **replaced**, not wrapped; the canary must assert we are not calling `super` there. |
| **Android composition leaks disallowed characters** | — | **OPEN, accepted.** No Android device (§14.3), so the trigger cannot fire: the post-hoc sanitiser ships as an *untested* mitigation for the failure mode it exists for. Alphanumeric ships anyway; README states it plainly. The digits-only fallback remains available if a report arrives. |
| Grouped separator makes iOS unusable | `V11-1.4` | **Response corrected.** The old answer — "gap-only grouping as the default, glyph opt-in" — does not work: §11.10's cost is the separator's *width*, and `separator=""` keeps the width and drops only the glyph. The real fallback is **not shipping `groups`**, with a narrower separator as a palliative. A scope decision, so `V11-1.4` must be run before `groups` is announced. |
| ~~Manual device matrix never runs again~~ | no owner | **Mitigated differently.** Naming a solo owner changes nothing; the matrix was instead *trimmed to owned hardware* and gated at `R-1`, with untestable rows marked `UNTESTED` rather than carried as aspiration (§14.3). |
| Editing model reopened late | `P0-4` | Cheap in Phase 0, expensive after `W-4`. The prototype is still built and reviewed a day later, despite there being no design function — that is the entire reason `P0-4` survives. |
| **Solo review blind spot** *(new)* | no second reader on any gate | Gates are artefact-shaped (committed recordings, passing tests, written findings) and time-separated from the work that produced them. This is a mitigation, not a fix. |
