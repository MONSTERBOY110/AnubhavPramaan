import type { Claim } from "@/lib/declaration/schemas";

/**
 * The worker's answer with every extracted claim's quote underlined in place, so a reader sees
 * exactly which words each claim rests on. Quotes are verbatim substrings, checked on the server.
 */
export function QuoteText({ text, claims }: { text: string; claims: Claim[] }) {
  const spans: Array<{ start: number; end: number; claim: Claim }> = [];
  for (const claim of claims) {
    const start = text.indexOf(claim.quote);
    if (start < 0) continue;
    const end = start + claim.quote.length;
    if (spans.some((s) => start < s.end && end > s.start)) continue;
    spans.push({ start, end, claim });
  }
  spans.sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const s of spans) {
    if (s.start > at) parts.push(text.slice(at, s.start));
    parts.push(
      <mark
        key={s.claim.id}
        title={s.claim.summary}
        className="decoration-saffron rounded-sm bg-transparent text-inherit underline decoration-2 underline-offset-[6px]"
      >
        {text.slice(s.start, s.end)}
      </mark>,
    );
    at = s.end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}
