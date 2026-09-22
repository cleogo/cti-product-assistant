/**
 * M1 placeholder route handler, carried over from the starter unmodified
 * except for wording. The real two-tool implementation (searchProducts,
 * filterProducts) lands in M3/M4 — see docs/spec.md.
 *
 * The model decides whether to call the getInformation tool. When it does,
 * the tool runs vector search and returns chunk text + page + score. The
 * client renders those as collapsible sources under the assistant message.
 */
import { openai } from '@ai-sdk/openai';
import { streamText, tool, embed } from 'ai';
import { Index } from '@upstash/vector';
import { z } from 'zod';

const index = new Index();

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system:
      'You are a helpful assistant for the CTI product catalog and price list. ' +
      'Use the getInformation tool whenever the user asks about a product or its price. ' +
      'If the catalog does not cover something, say so directly rather than guessing.',
    messages,
    tools: {
      getInformation: tool({
        description:
          'Look up products from the CTI price masterlist. Use this whenever the user asks a substantive question about a product, its category, or its price.',
        parameters: z.object({
          query: z
            .string()
            .describe('the topic, term, or sub-question to search for'),
        }),
        execute: async ({ query }) => {
          const { embedding } = await embed({
            model: openai.embedding('text-embedding-3-small'),
            value: query,
          });
          const hits = await index.query({
            vector: embedding,
            topK: 4,
            includeMetadata: true,
          });
          return hits.map((h) => ({
            text: (h.metadata?.text as string) ?? '',
            page: (h.metadata?.page as number) ?? null,
            score: h.score,
          }));
        },
      }),
    },
    maxSteps: 3,
  });

  return result.toDataStreamResponse();
}
