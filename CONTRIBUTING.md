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

## Testing on real devices

SPEC §14.3 is owned by the author and gated at **`R-1` only**. It is trimmed to hardware that
exists — an iPhone and desktop Chrome with 1Password. Rows that cannot be run are marked
`UNTESTED` there and repeated in the README rather than carried as aspiration. **Android
composition is untested**, and that is the accepted risk of v1.

## Conventions

- Element prefix `dc-`; shadow parts unprefixed (`cell`, `separator`).
- The row of boxes is a **cell**, never a "slot" — `slot` means the `<slot>` the input sits in.
- Never `LumoInjectionMixin` or `ThemeDetector`; both are documented internal-only. Use the
  public `ThemeDetectionMixin`, and prefer deriving from tokens over any theme-scoped rule.
