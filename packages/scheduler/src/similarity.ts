import { compareCodes } from './util.js';

export const DEFAULT_DUPLICATE_SIMILARITY = 0.8;

/** Lowercase, strip accents and punctuation; sorted unique tokens. */
export function normaliseTitle(title: string): string[] {
  const tokens = title
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
  return [...new Set(tokens)].sort(compareCodes);
}

/** Jaccard index |A and B| / |A or B|. Two empty sets have similarity 0, not 1. */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let shared = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) if (large.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

export function titleSimilarity(a: string, b: string): number {
  return jaccard(new Set(normaliseTitle(a)), new Set(normaliseTitle(b)));
}

export interface DuplicatePair {
  a: string;
  b: string;
  /** Rounded to 4 decimals. */
  similarity: number;
}

const EPSILON = 1e-9;

/**
 * All pairs whose normalised token Jaccard similarity is at least `threshold` (default 0.8).
 * Pairs are ordered a < b by id and sorted by similarity descending, then ids.
 */
export function findDuplicateTitles(
  items: readonly { id: string; title: string }[],
  threshold = DEFAULT_DUPLICATE_SIMILARITY,
): DuplicatePair[] {
  const prepared = [...items]
    .sort((x, y) => compareCodes(x.id, y.id))
    .map((it) => ({ id: it.id, tokens: new Set(normaliseTitle(it.title)) }));

  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < prepared.length; i++) {
    const left = prepared[i] as { id: string; tokens: Set<string> };
    for (let j = i + 1; j < prepared.length; j++) {
      const right = prepared[j] as { id: string; tokens: Set<string> };
      const small = Math.min(left.tokens.size, right.tokens.size);
      const large = Math.max(left.tokens.size, right.tokens.size);
      // Jaccard can never exceed small / large: skip hopeless pairs cheaply.
      if (large === 0 || small / large + EPSILON < threshold) continue;
      const similarity = jaccard(left.tokens, right.tokens);
      if (similarity + EPSILON >= threshold) {
        pairs.push({ a: left.id, b: right.id, similarity: Math.round(similarity * 1e4) / 1e4 });
      }
    }
  }
  return pairs.sort(
    (p, q) => q.similarity - p.similarity || compareCodes(p.a, q.a) || compareCodes(p.b, q.b),
  );
}
