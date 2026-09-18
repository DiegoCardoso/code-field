# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Relationship to PLAN.md — read this first

**`PLAN.md` is the source of truth for the delivery plan.** It carries the dependency graph,
the exit criteria and the reasoning for each gate, none of which survive being chopped into
issues. Do **not** mirror it into GitHub.

Issues are a **thin work queue** on top of it:

- Open an issue when a task is actually started, not in advance.
- Title is the task ID plus a short description: `W-2: field shell`, `P0-4: sign off the
mid-edit slide`. The ID already says which package (`W` = web, `F` = flow), so no extra
  prefix is needed.
- The body is a one-line summary, a **link** to the relevant `PLAN.md` and `SPEC.md`
  sections, and the exit criteria restated as a checklist. Never a copy of the plan — if the
  two disagree, `PLAN.md` wins and the issue is wrong.
- The PR closes it (`Closes #N`).
- Issues filed by other people are the exception: those are the real thing, not a pointer.

If a task's shape changes, edit `PLAN.md` and let the issue go stale or close it. The
opposite direction produces two plans that disagree, which is the failure mode this project
has already hit several times.

## Repo-specific note

This is a **single repo containing two packages** (`web/` and `flow/`), published as two
artifacts (npm `@cardoso/code-field`, Maven `dev.cardoso:code-field-flow`). One tracker covers
both.

For issues that carry a task ID, the ID identifies the package (`W` = web, `F` = flow). For
issues that do not — a bug report, a question — prefix the title with `web:` or `flow:` when
it is specific to one, and leave it unprefixed when it is not.
