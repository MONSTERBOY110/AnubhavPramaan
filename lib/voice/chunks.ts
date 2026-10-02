/** The TTS route refuses text longer than this (app/api/voice/tts/route.ts); stay a little under. */
export const TTS_MAX_CHARS = 1400;

/**
 * Split text for speech into parts the TTS route accepts, so a long read-back is spoken in full by
 * the same voice instead of falling back to the device voice. Parts end at sentence ends (the
 * danda, a full stop, a question or exclamation mark, or a line break); a single sentence longer
 * than the limit is cut at a space, never inside a word.
 */
export function speechChunks(text: string, max = TTS_MAX_CHARS): string[] {
  const sentences = text
    .split(/(?<=[।.?!])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const parts: string[] = [];
  let current = "";
  const push = () => {
    if (current) parts.push(current);
    current = "";
  };
  for (const sentence of sentences) {
    for (const piece of splitLong(sentence, max)) {
      if (!current) current = piece;
      else if (current.length + 1 + piece.length <= max) current += ` ${piece}`;
      else {
        push();
        current = piece;
      }
    }
  }
  push();
  return parts;
}

function splitLong(sentence: string, max: number): string[] {
  if (sentence.length <= max) return [sentence];
  const out: string[] = [];
  let rest = sentence;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(" ", max);
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}
