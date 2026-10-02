import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CONDITIONS,
  RaterCode,
  SubmissionSchema,
  coverageProblems,
  type Submission,
} from "@/lib/calibration/schema";
import { calibrationSet } from "@/lib/calibration/sets";
import { withLock } from "@/lib/server/lock";
import { rateLimit } from "@/lib/server/rate-limit";
import { getRecordStore } from "@/lib/store/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One rater's scores for a whole calibration set in one condition. Refused unless every unit of the
 * set has exactly one level (STUDY-PROTOCOL section 6), and refused if the same rater code already
 * submitted that condition: a rater's second try would count twice.
 */
export async function POST(req: Request, { params }: { params: Promise<{ setId: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`calibration:${ip}`, 20))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const { setId } = await params;
  const set = calibrationSet(setId);
  if (!set) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = SubmissionSchema.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: "invalid_request", issues: body.error.issues.slice(0, 3) },
      { status: 400 },
    );
  const problems = coverageProblems(set, body.data.ratings);
  if (problems.length)
    return NextResponse.json(
      { error: "incomplete", problems: problems.slice(0, 5) },
      { status: 400 },
    );

  if (set.raters && !set.raters.includes(body.data.rater)) {
    return NextResponse.json(
      { error: "unknown_rater", message: "This rater code is not on the list for this set." },
      { status: 403 },
    );
  }
  const store = getRecordStore();
  // One read-modify-write at a time: raters in one session submit together.
  return withLock(`calibration:${set.id}`, async () => {
    const existing = (await store.get<Submission[]>("calibration", set.id)) ?? [];
    if (existing.some((s) => s.rater === body.data.rater && s.condition === body.data.condition)) {
      return NextResponse.json(
        {
          error: "already_submitted",
          message: "This rater code has already scored this set in this condition.",
        },
        { status: 409 },
      );
    }
    const submission: Submission = {
      ...body.data,
      id: nanoid(12),
      setId: set.id,
      at: new Date().toISOString(),
    };
    await store.put("calibration", set.id, [...existing, submission]);
    const raters = existing.filter((s) => s.condition === submission.condition).length + 1;
    return NextResponse.json({ ok: true, raters }, { headers: { "Cache-Control": "no-store" } });
  });
}

const Withdrawal = z.object({
  rater: RaterCode,
  condition: z.enum(CONDITIONS),
});

/**
 * Withdrawal (STUDY-PROTOCOL section 8): a rater's scores for one condition are deleted, and only
 * the fact of a withdrawal is kept. Prototype limit: anyone who knows the rater code can do this;
 * the study facilitator does it on the rater's request.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ setId: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`calibration:${ip}`, 20))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const { setId } = await params;
  const set = calibrationSet(setId);
  if (!set) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = Withdrawal.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const store = getRecordStore();
  return withLock(`calibration:${set.id}`, async () => {
    const existing = (await store.get<Submission[]>("calibration", set.id)) ?? [];
    const kept = existing.filter(
      (s) => !(s.rater === body.data.rater && s.condition === body.data.condition),
    );
    if (kept.length === existing.length)
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    await store.put("calibration", set.id, kept);
    const log =
      (await store.get<Array<{ at: string; condition: string }>>(
        "calibration-withdrawals",
        set.id,
      )) ?? [];
    await store.put("calibration-withdrawals", set.id, [
      ...log,
      { at: new Date().toISOString(), condition: body.data.condition },
    ]);
    return NextResponse.json({ ok: true, withdrawn: existing.length - kept.length });
  });
}
