# Flow validation is hand-rolled, not `ValidationController`

Vaadin 25's own fields implement constraint validation with
`HasValidator.getDefaultValidator()` plus a `ValidationController` member and a
`protected void validate()` override. `ValidationController` is a public class in
`com.vaadin.flow.component.shared.**internal**` — the same "public type, internal package"
category as `LumoInjectionMixin` and `ThemeDetector`, which SPEC §9 already rules out on the
web side for being documented internal-only.

`CodeField` implements `getDefaultValidator()`, `setManualValidation()` and `validate()`
against supported API and sets `invalid` / `errorMessage` itself — roughly forty lines —
instead of depending on `ValidationController`.

The asymmetry with SPEC §4.1 is deliberate and is the reason this is written down. Depending on
`@vaadin/field-base` internals on the web side is **forced**: there is no supported way to build
a Vaadin-shaped field without it, so we bought a canary test and accepted the risk. Here a fully
supported path exists, so the same-shaped risk is **optional** — and an optional dependency on
an internal package, in a solo-maintained 0.x library, is a future breakage we would be
volunteering to maintain, with no canary guarding it.

## Consequences

- We do not inherit `ValidationController`'s edge-case handling. The one that matters: it
  deliberately avoids clobbering a developer-set custom error message. Our implementation must
  reproduce that, and test it.
- Upstreaming later means adopting Vaadin's pattern at that point — a contained change to one
  class, not a redesign.
- `ValidationUtil` (`com.vaadin.flow.component.shared`, *not* `.internal`) is supported and is
  used for the individual constraint checks.
