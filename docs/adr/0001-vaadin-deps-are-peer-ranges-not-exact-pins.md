# `@vaadin/*` are peer dependencies on a range, not exact pins

SPEC §4.1 commits to deep-importing `@vaadin/field-base/src/*.js` internals, and the instinct
that follows — pin the version exactly, in both repos, so the internals can't move underneath
us — is wrong here, and actively harmful.

`code-field` is installed into an application that **already has** `@vaadin/*`, supplied by the
Flow platform. If our `package.json` demands an exact version the application does not have,
npm resolves the conflict by nesting a second copy. Our component then extends one `InputMixin`
class identity while `<vaadin-text-field>` extends a different one: two `instanceof` universes,
two sets of controllers, one application. The canary test would pass, because it only ever sees
our copy.

We therefore declare `@vaadin/*` as **`peerDependencies: "^25.2.0"`**, with exact versions in
`devDependencies` for our own test runs. npm dedupes to the application's copy, and a genuine
mismatch surfaces as a loud install-time peer warning instead of a silent duplicate.

## Consequences

- **The version string is no longer the safety mechanism. The canary test is.** SPEC §4.1's
  canary — asserting the presence and arity of the eight `field-base` hooks we touch — is what
  catches a breaking internal change. Weakening it to "we're pinned anyway" is not available.
- The npm and Maven release lines are **not** in lockstep and never were: platform `25.2.8` is
  the newest on Maven Central, while npm is at `25.2.12`, and Vaadin's own
  `vaadin-text-field-flow:25.2.8` declares `@NpmPackage(version = "25.2.11")`. `P0-5`'s original
  exit criterion ("record it identically in both repos") was not satisfiable. It is replaced by
  *one bump policy covering two pins*.
- A consumer on a `25.3.x` platform gets an install warning rather than a broken component,
  which is the correct failure mode for a 0.x library.
