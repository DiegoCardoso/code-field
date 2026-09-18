# Contributing

Decisions that would otherwise be re-litigated. Most were settled in Phase 0 (`P0-6`); the
reasoning lives in [PLAN.md](./PLAN.md) and [SPEC.md](./SPEC.md).

## Posture

**Published 0.x, best-effort, solo-maintained.** No support promise. The API is
Vaadin-shaped verbatim so that upstreaming later is a rename, not a redesign — that
constraint is worth real effort and should not be traded away for local convenience.

## Repository

One repo, two packages: `web/` (npm) and `flow/` (Maven), published as two artifacts.
`flow/` resolves the web package as `file:../web` until `W-7`, then via published `0.0.x`
prereleases. This is why the repo is unified — across two repos the same link would be
per-machine `npm link` state that CI cannot reproduce.

## Versions

|                 | Value                         |
| --------------- | ----------------------------- |
| Maven platform  | `25.2.8`                      |
| `@NpmPackage`   | `25.2.11`                     |
| npm `@vaadin/*` | `peerDependencies: "^25.2.0"` |
| JDK             | 21                            |

The npm and Maven release lines are **deliberately decoupled** — Vaadin's own
`vaadin-text-field-flow:25.2.8` declares `@NpmPackage(version = "25.2.11")`. There is one
bump policy covering two pins, not one version in two places.

`@vaadin/*` are **peer dependencies on a range, not exact pins**. Exact-pinning a dependency
the host application already owns makes npm install a second copy of `field-base`, giving two
`InputMixin` class identities in one page — see
[ADR-0001](./docs/adr/0001-vaadin-deps-are-peer-ranges-not-exact-pins.md).

**Consequently `web/test/field-base-canary.test.js` is the safety mechanism, not the version
string.** Bumps are deliberate, single-commit, and the canary must pass.

## Toolchain

Mirrors `vaadin/web-components` so the suite runs unmodified if upstreamed:
`@web/test-runner` + `@web/test-runner-playwright` + `@web/test-runner-visual-regression`,
Playwright `~1.63`, Prettier and `.editorconfig` copied from the monorepo.

Two deliberate divergences, both forced:

- **`expect` comes from `chai`, not `@vaadin/chai-plugins`** — the latter is monorepo-internal
  and not published to npm. Swap the import if upstreaming.
- **ESLint config is a minimal subset.** The monorepo's ruleset depends on its own layout.

## CI

- **Every push:** lint, format check, unit tests on Chromium **and Firefox**.
- **Not yet wired:** visual regression (needs baselines from `W-5`/`W-8`; must run in a pinned
  container — the monorepo uses `mcr.microsoft.com/playwright:v1.63.0-noble`) and Flow ITs
  (impossible before `W-7`; nightly thereafter).

## Test harness gotchas

Each of these cost real time to find and gives no useful signal on its own.

**Never assert on a DOM element.** A failing `expect(<element>).to.exist` puts a DOM node into
the assertion message, and web-test-runner **hangs serialising it back to Node**: the suite
reports _zero_ tests and times out with no error, instead of a red test. Assert on booleans —
`expect(!!el).to.be.true`.

**A wedged suite is the standard failure shape here**, so `testsFinishTimeout` is lowered to
20s. The 120s default turns "something never settles" into a two-minute wait with nothing to
read. When a suite reports 0 tests and times out, bisect the file; do not look for an error.

**Synthetic `KeyboardEvent`s do not move a caret.** Browsers ignore untrusted events for
selection, so a suite built on them passes while asserting nothing. Use `sendKeys` from
`@web/test-runner-commands`; `test/tooling-smoke.test.js` asserts the harness really drives
the browser, so that assumption cannot rot silently.

**Firefox ignores `clipboardData` passed to the `ClipboardEvent` constructor.** A synthetic
paste tests nothing there. Paste tests do a real clipboard round-trip with keys instead.

**Platform-dependent shortcuts must be derived, not hard-coded.** Cut/copy/paste and
select-all use `Meta` on macOS and `Control` elsewhere; development is macOS and CI is Linux,
so hard-coding either passes locally and fails in CI, or the reverse. Pick from
`navigator.platform`.

**`field.focus()` re-runs focus placement** (§7.3), overwriting any selection a test set up.
Where a test needs a specific selection, focus _first_, then set it — and note that clipboard
helpers which focus internally will destroy it.

**Two Vaadin test packages are monorepo-internal and unpublished**: `@vaadin/chai-plugins`
(use `chai`) and `@vaadin/test-runner-commands` (use `@web/test-runner-commands`).

**Mutation-test anything that passed on its first run.** Several tests in this repo looked
like coverage and caught nothing — removing `LabelledInputController` broke no test until an
association assertion was added. Break the code deliberately and confirm the test fails.

## Testing on real devices

SPEC §14.3 is owned by the author and gated at **`R-1` only**. It is trimmed to hardware that
exists — an iPhone and desktop Chrome with 1Password. Rows that cannot be run are marked
`UNTESTED` there and repeated in the README rather than carried as aspiration. **Android
composition is untested**, and that is the accepted risk of v1.

## Commits and PR titles

**Conventional Commits**, and the same for pull request titles — PRs are squashed or
merged as a unit, so a non-semantic PR title lands in history regardless of how clean the
commits were.

```
<type>(<scope>): <subject>
```

| Type       | For                                              |
| ---------- | ------------------------------------------------ |
| `feat`     | New component behaviour or public API            |
| `fix`      | A defect in shipped behaviour                    |
| `docs`     | SPEC, PLAN, ADRs, README, CONTRIBUTING, findings |
| `test`     | Tests only, including the canary                 |
| `ci`       | Workflows and CI configuration                   |
| `build`    | Toolchain, dependencies, packaging               |
| `refactor` | No behaviour change                              |
| `chore`    | Anything else                                    |

Scopes: `web`, `flow`, `spec`, `deps`. Omit when a change is genuinely repo-wide.

Subject in the imperative mood, no trailing full stop, and not Sentence-, Start- or
UPPER-cased. Identifiers keep their own casing — `(W-2)`, `P0-3`, `ValidationController`. The body is where the
reasoning goes — especially _why_, and what was rejected. Reference task IDs (`W-2`,
`P0-3`) so a commit can be traced back to the plan.

A breaking change is `!` after the type/scope plus a `BREAKING CHANGE:` footer. Before
`1.0.0` this is documentation, not a version contract — the posture is 0.x, best-effort.

## Conventions

- Element prefix `dc-`; shadow parts unprefixed (`cell`, `separator`).
- **Private members use `#`**, not the `__` prefix. Two deliberate exceptions:
  - **Observers must be `__`.** `static get observers()` names them as _strings_, which
    Polylit resolves off the instance at runtime — a `#` member is unreachable that way.
    Verified: converting one makes its observer silently never run, and the failure surfaces
    somewhere else entirely.
  - **Protected members stay `_`**, since subclasses and `field-base` call them.

  This diverges from Vaadin, which uses `__` throughout. A deliberate trade against `W-1.4`'s
  "an upstream PR should be a rename, not a reformat": real privacy is enforced by the engine,
  the convention is only enforced by habit.

- The row of boxes is a **cell**, never a "slot" — `slot` means the `<slot>` the input sits in.
- Never `LumoInjectionMixin` or `ThemeDetector`; both are documented internal-only. Use the
  public `ThemeDetectionMixin`, and prefer deriving from tokens over any theme-scoped rule.
