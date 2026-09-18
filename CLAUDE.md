# code-field

A one-time-code input web component (`code-field`) plus a Vaadin Flow Java module
(`code-field-flow`). See [SPEC.md](./SPEC.md) for the decision-locked specification,
[PLAN.md](./PLAN.md) for the delivery plan, and [P0-FINDINGS.md](./P0-FINDINGS.md) for
resolved Phase 0 gates.

## Agent skills

### Issue tracker

GitHub Issues, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, unchanged (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Commits

Conventional Commits, and the same format for PR titles:
`<type>(<scope>): <subject>`, types `feat|fix|docs|test|ci|build|refactor|chore`,
scopes `web|flow|spec|deps`. Put the reasoning — and what was rejected — in the body, and
reference task IDs from PLAN.md. See `CONTRIBUTING.md`.
