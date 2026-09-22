/**
 * Chat route — two retrieval tools, per docs/spec.md.
 *
 * The tool bodies live in lib/retrieval.ts so that M3 could prove retrieval
 * correct headlessly, before any UI existed. This file only wires them up.
 *
 * The system prompt and the final tool descriptions are M4's work; what is
 * here is enough for the model to reach both tools, not yet tuned for
 * unambiguous routing.
 */
import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import {
  searchProducts,
  filterProducts,
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  DEFAULT_FILTER_LIMIT,
  MAX_FILTER_LIMIT,
} from '@/lib/retrieval';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system:
      'You are a product assistant for the CTI price masterlist. ' +
      'Answer product and price questions only from retrieved chunks, never from memory. ' +
      'Quote the product code alongside every price. ' +
      'Use searchProducts to find or describe products and to answer questions about the catalog. ' +
      'Use filterProducts for price thresholds, superlatives and counts.',
    messages,
    tools: {
      searchProducts: tool({
        description:
          'Semantic and keyword search over product chunks and the catalog guide documents. ' +
          'Use when the user names or describes a product, asks what something costs, asks ' +
          'whether an item is carried, or asks a conceptual question about the catalog, ' +
          'product codes, or pricelist conventions. Exact code and name matches are returned first.',
        parameters: z.object({
          query: z
            .string()
            .describe('natural language description, product name, or product code'),
          department: z.string().optional().describe('optional department to narrow to'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_SEARCH_LIMIT)
            .optional()
            .describe(`how many results, default ${DEFAULT_SEARCH_LIMIT}`),
        }),
        execute: async (args) => searchProducts(args),
      }),
      filterProducts: tool({
        description:
          'Query the product catalog by its fields — no semantic search. Use for price ' +
          'thresholds ("under 500"), superlatives ("cheapest safety shoe"), counts ("how many ' +
          'office chairs"), and browsing a category or department. Returns total_matching, the ' +
          'full count before the limit, so you can say how many items match rather than ' +
          'implying the list is complete.',
        parameters: z.object({
          category: z.string().optional(),
          department: z.string().optional(),
          min_price: z.number().optional().describe('minimum price in PHP, inclusive'),
          max_price: z.number().optional().describe('maximum price in PHP, inclusive'),
          color: z.string().optional(),
          oshc_only: z.boolean().optional().describe('only OSHC-certified items'),
          sort: z.enum(['price_asc', 'price_desc', 'name']).optional(),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_FILTER_LIMIT)
            .optional()
            .describe(`how many items to return, default ${DEFAULT_FILTER_LIMIT}`),
        }),
        execute: async (args) => filterProducts(args),
      }),
    },
    maxSteps: 3,
  });

  return result.toDataStreamResponse();
}
