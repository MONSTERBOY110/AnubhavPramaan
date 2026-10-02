import { MEETS_STANDARD, type Level } from "./scoring";

// The deviation rule (TRD M4). An evidence hint says, per observable, whether it is visible in the
// photo or video. It never scores. But when the assessor's level contradicts the hint, the
// assessor writes a one-line reason, so a reviewer can see why: either the assessor saw something
// the photo does not show, or the hint was wrong. Both the level and the reason are kept.

export type ObservableStatus = "visible" | "not_visible" | "cannot_tell";

export const MIN_REASON_LENGTH = 10;

export type DeviationCheck = { needsReason: boolean; why?: string };

/**
 * A reason is required when the assessor judges the standard met (level 1 or above) while an
 * observable is not visible, or not met (level 0) while every observable is visible. With no hint,
 * nothing is required.
 */
export function deviationCheck(
  level: Level,
  hint: ObservableStatus[] | null | undefined,
): DeviationCheck {
  if (!hint || hint.length === 0) return { needsReason: false };
  if (level >= MEETS_STANDARD && hint.includes("not_visible")) {
    return {
      needsReason: true,
      why: "Standard met, while the evidence hint says an observable is not visible.",
    };
  }
  if (level < MEETS_STANDARD && hint.every((h) => h === "visible")) {
    return {
      needsReason: true,
      why: "Below standard, while the evidence hint says every observable is visible.",
    };
  }
  return { needsReason: false };
}

/** True when the decision may be saved: no reason needed, or a reason of the minimum length given. */
export function deviationSatisfied(check: DeviationCheck, reason: string | undefined): boolean {
  return !check.needsReason || (reason ?? "").trim().length >= MIN_REASON_LENGTH;
}
