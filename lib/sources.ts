/**
 * Turns one assistant message's tool results into the source list the UI
 * renders — both the per-message inline sources and the desktop panel's
 * mirror of the latest turn use this, so the two can't silently diverge.
 *
 * `useChat` result payloads cross the wire as `any` (they were `JSONValue` on
 * the stream), so this is written against the runtime shape rather than the
 * server-side types in lib/retrieval.ts: an array is a searchProducts result
 * (products and/or guide sections mixed together), an object with `items` is
 * a filterProducts result.
 */
import type { Message } from 'ai';

export type ProductSource = {
  kind: 'product';
  code: string;
  name: string;
  category?: string;
  price_php: number;
  colors?: string[];
  data_quality_flag?: string;
};

export type GuideSource = {
  kind: 'guide';
  title: string;
  heading: string;
};

export type Source = ProductSource | GuideSource;

function isProductLike(v: unknown): v is Record<string, unknown> {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as Record<string, unknown>).code === 'string' &&
    typeof (v as Record<string, unknown>).price_php === 'number'
  );
}

function isGuideLike(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && (v as Record<string, unknown>).doc_type === 'guide';
}

function toProduct(v: Record<string, unknown>): ProductSource {
  return {
    kind: 'product',
    code: String(v.code),
    name: String(v.name ?? ''),
    category: typeof v.category === 'string' ? v.category : undefined,
    price_php: Number(v.price_php),
    colors: Array.isArray(v.colors) ? (v.colors as string[]) : undefined,
    data_quality_flag: typeof v.data_quality_flag === 'string' ? v.data_quality_flag : undefined,
  };
}

function toGuide(v: Record<string, unknown>): GuideSource {
  return {
    kind: 'guide',
    title: String(v.title ?? ''),
    heading: String(v.heading ?? ''),
  };
}

/**
 * Products dedupe by code — a variant-family fill-in and an exact-match hit
 * can name the same product twice within one searchProducts call. Guide
 * sections dedupe by title+heading for the same reason. Order is call order,
 * which is retrieval-ranked order for products.
 */
export function sourcesFromMessage(message: Message): Source[] {
  const products = new Map<string, ProductSource>();
  const guides = new Map<string, GuideSource>();

  for (const inv of message.toolInvocations ?? []) {
    if (inv.state !== 'result') continue;
    const result = inv.result as unknown;

    const rows: unknown[] = Array.isArray(result)
      ? result
      : result && typeof result === 'object' && Array.isArray((result as { items?: unknown[] }).items)
        ? (result as { items: unknown[] }).items
        : [];

    for (const row of rows) {
      if (isProductLike(row)) {
        const p = toProduct(row);
        if (!products.has(p.code)) products.set(p.code, p);
      } else if (isGuideLike(row)) {
        const g = toGuide(row);
        const key = `${g.title}::${g.heading}`;
        if (!guides.has(key)) guides.set(key, g);
      }
    }
  }

  return [...products.values(), ...guides.values()];
}
