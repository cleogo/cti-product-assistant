/**
 * The chat model, in one place.
 *
 * M4 decided this by measurement rather than by assumption: the system prompt
 * was written against gpt-4o-mini and graded, with escalation to gpt-4o gated
 * on a trigger fixed in advance (docs/plan.md, "Decided in M4"). Keeping the
 * id here means scripts/grade.ts and the route cannot disagree about which
 * model the evidence was gathered on.
 *
 * Override with CHAT_MODEL to re-grade against another model without editing
 * code — `CHAT_MODEL=gpt-4o npx tsx scripts/grade.ts`.
 */
export const CHAT_MODEL = process.env.CHAT_MODEL ?? 'gpt-4o-mini';
