/**
 * The two tools, as AI SDK definitions.
 *
 * Split out of app/api/chat/route.ts for the same reason as lib/prompt.ts:
 * `scripts/grade.ts` must route against the exact descriptions production
 * ships. A vague description causing a general-knowledge answer is a named
 * failure mode in the brief, and it is a failure of *this string*, not of the
 * system prompt — so the harness has to see the real one.
 *
 * The bodies live in lib/retrieval.ts. This module is the boundary: what the
 * model reads when deciding which tool to reach for.
 */
import { tool } from 'ai';
import { z } from 'zod';
import {
  searchProducts,
  filterProducts,
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  DEFAULT_FILTER_LIMIT,
  MAX_FILTER_LIMIT,
} from '@/lib/retrieval';

/**
 * Both descriptions name the other tool and say what does NOT belong to them.
 * Routing failures here are symmetric — "cheapest safety shoe" going to
 * semantic search returns a confident wrong answer, and "do you sell
 * stethoscopes" going to the filter returns nothing at all — so each
 * description has to push work away as well as claim it.
 */
export const tools = {
  searchProducts: tool({
    description:
      'Find products by what they are. Semantic and keyword search across all 1,038 ' +
      'product records and the catalog guide documents. ' +
      'USE FOR: naming or describing a product ("dual head stethoscope", "fire blanket"); ' +
      'looking up a product code ("MED-001-01"); asking what something costs; asking ' +
      'whether CTI carries an item; and any conceptual question about the catalog, the ' +
      'product code structure, OSHC certification, departments, or pricelist conventions — ' +
      'those are answered from guide sections this tool returns. ' +
      'DO NOT USE FOR: price thresholds, "cheapest"/"most expensive", or "how many" — ' +
      'those need filterProducts, which counts exactly. This tool returns a ranked ' +
      'sample and cannot tell you how many items match anything. ' +
      'Exact code and name matches are returned first, and variant families are returned ' +
      'complete, so all five fire blanket sizes arrive together. Results may carry ' +
      'data_quality_flag — see the rule about conflicting codes.',
    parameters: z.object({
      query: z
        .string()
        .describe('natural language description, product name, or product code'),
      department: z
        .string()
        .optional()
        .describe('optional department to narrow to, e.g. "Fire Safety", "Furniture"'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_SEARCH_LIMIT)
        .optional()
        .describe(
          `how many results, default ${DEFAULT_SEARCH_LIMIT}, max ${MAX_SEARCH_LIMIT}. ` +
            'Raise it for questions about a family of variants.',
        ),
    }),
    execute: async (args) => searchProducts(args),
  }),

  filterProducts: tool({
    description:
      'Query the catalog by its fields — exact, exhaustive, and not semantic. ' +
      'USE FOR: price thresholds ("under ₱500", "between ₱1,000 and ₱5,000"); superlatives ' +
      '("cheapest safety shoe", "most expensive item"); counts ("how many office chairs"); ' +
      'browsing a whole category or department; and filtering by colour or OSHC certification. ' +
      'DO NOT USE FOR: finding a product by description or code — it does no semantic ' +
      'matching, so category and department must be close to the real field values. Use ' +
      'searchProducts for that. ' +
      'ALWAYS returns total_matching: how many products match in full, before the limit. ' +
      'Report that number. Without it you will present 20 rows as though they were the ' +
      'entire catalog, which is the specific error this tool exists to prevent.',
    parameters: z.object({
      category: z
        .string()
        .optional()
        .describe(
          'category name, matched as a substring, e.g. "Safety Shoes", "Chair". ' +
            'Omit unless the question names a category — a guessed one silently ' +
            'shrinks total_matching.',
        ),
      department: z
        .string()
        .optional()
        .describe(
          'department, matched as a substring. Must be one of: Medical, Fire Safety, ' +
            'PPE, Footwear, Sports, Fall Protection, Equipment, Janitorial, Rescue, ' +
            'Furniture, Security, Traffic & Site Safety. Omit it if the question does ' +
            'not clearly name one of these — "safety equipment" is not a department, ' +
            'and narrowing it to Fire Safety answers a question nobody asked.',
        ),
      min_price: z.number().optional().describe('minimum price in PHP, inclusive'),
      max_price: z.number().optional().describe('maximum price in PHP, inclusive'),
      color: z.string().optional(),
      oshc_only: z.boolean().optional().describe('only OSHC-certified items'),
      sort: z
        .enum(['price_asc', 'price_desc', 'name'])
        .optional()
        .describe('defaults to price_asc, which is what "cheapest" wants'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_FILTER_LIMIT)
        .optional()
        .describe(
          `how many items to return, default ${DEFAULT_FILTER_LIMIT}, max ${MAX_FILTER_LIMIT}. ` +
            'This caps the list, never total_matching.',
        ),
    }),
    execute: async (args) => filterProducts(args),
  }),
};
