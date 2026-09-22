/**
 * Chat route.
 *
 * Deliberately thin. The system prompt is lib/prompt.ts, the tool definitions
 * are lib/tools.ts, and the retrieval bodies are lib/retrieval.ts — all three
 * so that scripts/eval.ts and scripts/grade.ts can exercise exactly what this
 * route ships, rather than a copy that drifts from it.
 *
 * Model choice is M4's open question, decided by measurement: the prompt was
 * written against gpt-4o-mini first, and the escalation trigger to gpt-4o is
 * recorded in docs/plan.md rather than left to judgement after the fact.
 */
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { SYSTEM_PROMPT } from '@/lib/prompt';
import { tools } from '@/lib/tools';
import { CHAT_MODEL } from '@/lib/model';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai(CHAT_MODEL),
    system: SYSTEM_PROMPT,
    messages,
    tools,
    // A turn may search, then filter, then answer. Three steps left no room
    // for the second tool call plus the text.
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}
