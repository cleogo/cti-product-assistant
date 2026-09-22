---
name: phase
description: Run one milestone of docs/plan.md end to end - clarify, plan, preview the user's verification, wait for kickoff, implement fully, then hand off to verification. Use when the user says "start M1", "/phase M2", "begin the next milestone", or otherwise asks to work a phase of the build plan.
---

# Run a phase

One milestone, six gates. **Never cross a gate the user has not opened.**

```
1  Orient      read the milestone, the spec, the code
2  Clarify     ask only what actually changes the work  -> WAIT
3  Plan        numbered steps, files named             -> shown, not gated
4  Preview     how the user will check it, plainly     -> WAIT for kickoff
5  Implement   the whole milestone, no partial stops
6  Verify      hand the checks over                    -> WAIT
```

Gates are at the end of 2, 4 and 6. Stopping anywhere else — mid-implementation,
half a milestone, "here's a start" — defeats the point of the skill.

---

## 1. Orient

Read, in this order:

- `docs/plan.md` — the milestone named in the argument, or the first with
  unchecked boxes if no argument was given
- `docs/spec.md` — the contracts this milestone must satisfy
- `CLAUDE.md` — project rules
- The actual files the milestone touches. **Read them.** Do not plan against
  what you assume the code says.

If the previous milestone's exit condition is unmet, say so and stop. Do not
start a phase on a broken foundation.

## 2. Clarify

Ask **only** questions whose answers change what you build. A question with an
obvious default is not a question — pick the default, state it in the plan, and
move on.

Worth asking: a genuine fork with no clear winner, a credential or account you
cannot create, a business fact not in the repo, a scope call the brief leaves
open.

Not worth asking: naming, file layout, anything the spec already settles,
anything you could answer by reading a file.

Ask them as a short numbered list. **Then stop and wait.** If there is nothing
genuinely open, say "No clarifications needed" and go straight to step 3.

When the answers arrive, apply them: write any lasting decision into
`docs/plan.md` or `docs/spec.md` before planning, so the decision survives this
session.

## 3. Plan

Numbered steps. For each one: the file, and the change in a clause.

```
1. lib/seed.ts        strip pdf-parse; read corpus/products.jsonl instead
2. lib/seed.ts        embed `text`, upsert `id` + all other fields as metadata
3. lib/seed.ts        batch embedMany at 100 to match the existing upsert batch
4. scripts/query.ts   new - CLI that queries Upstash directly, prints hits
5. package.json       drop pdf-parse
```

Rules for the plan:

- Ordered so something is verifiable as early as possible
- Name every file. "Update the seed script" is not a step
- Call out anything you are about to do that the plan or spec does **not**
  already cover, and why
- If a step looks likely to blow the milestone's time cap, say so now

Do not stop for approval here — the plan and the preview are shown together.

## 4. Preview the verification

**This is the part that must be in plain language.** No jargon, no filenames
where a description works. Write what the user will actually do with their
hands and what they should actually see.

Bad:

> Verify the seed script upserts with correct metadata.

Good:

> You'll run one command that loads all 1,038 products into the search index.
> It takes about a minute and prints its progress. Then you'll run a second
> command that searches for "stethoscope" — it should print the right product
> with its code and price of ₱2,100. If the price comes back as text in quotes
> rather than a number, that's the failure to catch.

Include:

- The exact command, in a `bash` block, one per block
- What good looks like
- The one or two failures most likely to actually happen
- Roughly how long it takes

End with the kickoff line:

> Say **go** and I'll implement the whole milestone, then hand these checks
> back to you.

**Stop. Wait.** Do not write code before the user kicks off.

## 5. Implement

Build the entire milestone. Do not stop at a natural-looking pause and ask if
you should continue — the user already said go.

**Stay inside the milestone.** Something you notice that belongs to a later
phase gets noted, not built.

Keep `docs/plan.md` current as you go: check boxes, and note inline anything
that surprised you. The surprises are the reflection material — they are
unrecoverable after the fact.

### Alerting during implementation

If you hit something only the user can resolve — a missing credential, a
service that will not provision, a decision that changes the spec, a failure
you have retried and cannot pass — do **not** keep grinding, and do **not**
guess.

Fire the desktop alert, then stop and ask:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File .claude/hooks/notify.ps1 -Kind blocked -Message "<one line, what you need>"
```

Use `-Kind attention` for something the user should see soon but which is not
stopping you — a cost surprise, a spec contradiction you worked around, a
decision you made on their behalf that they may want to reverse.

The `Stop` hook fires the "finished" alert on its own. You do not call that one.

Do not fire an alert for ordinary progress. An alert that goes off for nothing
gets ignored, and then it goes off for something.

## 6. Hand over verification

Report in this shape:

**Done** — what now exists, in one or two lines.

**Checks** — the same steps you previewed in 4, now as a list the user works
through. Same plain language. Same commands.

**Notes** — anything that differs from the plan, anything left imperfect on
purpose, anything you decided on their behalf.

**Exit condition** — quote the milestone's exit condition from `docs/plan.md`
verbatim and state whether you believe it is met, and on what evidence.

Then stop:

> Run those and tell me what you see. When it checks out, `/phase-next`.

**Do not start the next milestone.** Do not mark the exit condition met on your
own say-so — the user's verification is the evidence, which is the entire point
of having exit conditions.

---

## If the user reports a failure

Fix it inside this milestone and hand verification back again. Do not advance,
and do not reframe a failed check as acceptable. A milestone with a failing
exit condition is not finished.

If after a genuine attempt the failure is not worth the remaining time — the
milestone has a cap in `docs/plan.md` for a reason — say so plainly, propose
what to ship instead, and let the user decide. Log the unresolved failure in
`docs/plan.md`. Unresolved failures are reflection material, not shame.
