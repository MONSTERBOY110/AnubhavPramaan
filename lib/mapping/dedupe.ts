/**
 * One quote, shown once. Several claims extracted from one sentence can each link to the same
 * criterion; the assessor needs the worker's words once, with the most confident link. A link
 * with no confidence (a keyword match) ranks below any scored one.
 */
export function uniqueByQuote<T extends { quote: string; confidence: number | null }>(
  links: T[],
): T[] {
  const best = new Map<string, T>();
  for (const l of links) {
    const prev = best.get(l.quote);
    if (!prev || (l.confidence ?? -1) > (prev.confidence ?? -1)) best.set(l.quote, l);
  }
  return [...best.values()];
}
