---
name: phase-next
description: Close out the milestone the user just verified and start the next one. Use when the user says "/phase-next", "verified", "that works, next phase", or otherwise confirms a milestone's checks passed.
---

# Close this phase, open the next

Invoking this asserts the user verified the current milestone and it passed.

## 1. Close out

1. **Confirm it actually passed.** If the user's message reports a failure, a
   partial pass, or "mostly works" — stop. Do not advance. Go fix it under the
   `phase` skill's failure path.

2. Check every completed box in the current milestone in `docs/plan.md`.

3. Mark the exit condition met, dated, and say what verified it:

   ```
   **Exit condition: met 2026-09-22.** `npx tsx scripts/query.ts "stethoscope"`
   returned MED-001-04 at 2100, price as a number. Verified by user.
   ```

4. Record anything worth keeping that would otherwise evaporate:
   - Retrieval tuning and *why* → `docs/corpus-design-decisions.md`
   - Something that surprised you → inline in `docs/plan.md`
   - A contract that changed during the build → `docs/spec.md`

   Do this now. It is unrecoverable in a week, and it is the reflection.

5. Note actual time spent against the milestone's budget in the time table. If
   you are running over, say it here rather than discovering it at M7.

## 2. Report

Three lines, no more:

- Milestone closed, exit condition met
- What is now true that was not before
- Which milestone is next and its one-line goal

## 3. Open the next

Immediately invoke the `phase` skill for the next unchecked milestone in
`docs/plan.md`. That means step 1 (orient) and step 2 (clarify) — **not**
implementation. The user still has to kick off.

If the milestone just closed was the last one, say so and stop. Do not invent
an M8.
