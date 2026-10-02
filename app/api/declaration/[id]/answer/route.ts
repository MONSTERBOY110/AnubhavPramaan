import { NextResponse } from "next/server";
import { redactIdentifiers } from "@/lib/cert/redact";
import { AnswerSchema, type SelfDeclaration } from "@/lib/declaration/schemas";
import { getRecordStore } from "@/lib/store/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Store one answer (replacing an earlier answer to the same topic). The text is redacted again
 * here, so an answer the worker typed or corrected by hand is held to the same rule as speech.
 * A correction or a typed summary never loses the transcript: the words as first heard are kept
 * with the answer. `extraction` and `heard` are the server's to set, never the browser's.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = AnswerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_answer" }, { status: 400 });
  const store = getRecordStore();
  const declaration = await store.get<SelfDeclaration>("declaration", id);
  if (!declaration) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (declaration.confirmedAt)
    return NextResponse.json({ error: "already_confirmed" }, { status: 409 });
  const answer: SelfDeclaration["answers"][number] = {
    ...parsed.data,
    text: redactIdentifiers(parsed.data.text),
    extraction: undefined,
    heard: undefined,
  };
  const index = declaration.answers.findIndex((a) => a.topic === answer.topic);
  const previous = index >= 0 ? declaration.answers[index] : undefined;
  if (previous && (answer.edited || answer.source === "typed")) {
    const heard =
      previous.heard ??
      (previous.source !== "typed"
        ? { text: previous.text, sourceLabel: previous.sourceLabel }
        : undefined);
    if (heard && heard.text !== answer.text) answer.heard = heard;
  }
  if (index >= 0) {
    declaration.answers[index] = answer;
    // Claims from the replaced answer no longer stand.
    declaration.claims = declaration.claims.filter((c) => c.answer !== index);
  } else {
    declaration.answers.push(answer);
  }
  await store.put("declaration", id, declaration);
  return NextResponse.json(declaration);
}
