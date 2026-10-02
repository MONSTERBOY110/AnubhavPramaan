"use client";

import { useState } from "react";
import type { DecisionView, PackSummary, RouteView } from "./view";

/**
 * The assessor's decision, in green: confirm the suggested QP and route, or change either with a
 * reason. Nothing downstream uses the suggestion until a person has decided here.
 */
export function DecisionPanel({
  declarationId,
  suggestedQp,
  route,
  packs,
  decision: initial,
}: {
  declarationId: string;
  suggestedQp: string;
  route: RouteView;
  packs: PackSummary[];
  decision?: DecisionView;
}) {
  const [decision, setDecision] = useState<DecisionView | undefined>(initial);
  const [changing, setChanging] = useState(false);
  const [qp, setQp] = useState(suggestedQp);
  const [chosenRoute, setChosenRoute] = useState(route.suggestion);
  const [reason, setReason] = useState("");
  const [assessorId, setAssessorId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(agree: boolean) {
    setError(null);
    const body = agree
      ? { qp: suggestedQp, route: route.suggestion, assessorId, reason: undefined }
      : { qp, route: chosenRoute, assessorId, reason };
    const res = await fetch(`/api/mapping/${declarationId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as DecisionView & { message?: string };
    if (!res.ok) return setError(json.message ?? "The decision was not saved.");
    setDecision(json);
    setChanging(false);
  }

  if (decision) {
    return (
      <section
        aria-label="Assessor decision"
        className="border-decide bg-decide-soft self-start rounded-xl border-2 p-5"
      >
        <p className="text-decide text-sm font-semibold">
          Decided by assessor {decision.assessorId}
        </p>
        <p className="mt-1 text-lg font-semibold">
          {decision.qp},{" "}
          {decision.route === "direct-assessment" ? "direct assessment" : "upskill first"}
        </p>
        <p className="text-ink-soft mt-1 text-sm">
          {decision.agreesWithSuggestion
            ? "Agreed with the suggestion."
            : `Changed the suggestion. Reason: ${decision.reason}`}
        </p>
        <p className="text-ink-soft mt-1 text-xs">
          {new Date(decision.at).toLocaleString("en-IN")}
        </p>
      </section>
    );
  }

  const canConfirm = assessorId.trim().length >= 3;
  const canChange =
    canConfirm &&
    reason.trim().length >= 10 &&
    (qp !== suggestedQp || chosenRoute !== route.suggestion);
  return (
    <section
      aria-label="Assessor decision"
      className="border-line self-start rounded-xl border p-5"
    >
      <h2 className="text-lg font-semibold">Your decision</h2>
      <p className="text-ink-soft text-sm">
        The tool suggests; you decide. Your choice and any reason are recorded.
      </p>
      <label className="mt-4 block text-sm">
        Assessor ID
        <input
          value={assessorId}
          onChange={(e) => setAssessorId(e.target.value)}
          className="border-line mt-1 block w-full rounded-lg border px-3 py-2"
          placeholder="e.g. AS-0142"
        />
      </label>
      {!changing ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => submit(true)}
            className="bg-decide rounded-lg px-5 py-3 font-semibold text-white disabled:opacity-40"
          >
            Confirm QP and route
          </button>
          <button
            type="button"
            onClick={() => setChanging(true)}
            className="border-line rounded-lg border px-5 py-3"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          <label className="text-sm">
            Qualification Pack
            <select
              value={qp}
              onChange={(e) => setQp(e.target.value)}
              className="border-line mt-1 block w-full rounded-lg border px-3 py-2"
            >
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} {p.title} v{p.version}
                  {p.status === "deactivated" ? " (deactivated)" : ""}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="text-sm">
            <legend>Route</legend>
            {(["direct-assessment", "upskill-first"] as const).map((r) => (
              <label key={r} className="mr-4 inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="route"
                  checked={chosenRoute === r}
                  onChange={() => setChosenRoute(r)}
                />
                {r === "direct-assessment" ? "Direct assessment" : "Upskill first"}
              </label>
            ))}
          </fieldset>
          <label className="text-sm">
            Reason (at least 10 characters)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="border-line mt-1 block w-full rounded-lg border px-3 py-2"
            />
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={!canChange}
              onClick={() => submit(false)}
              className="bg-decide rounded-lg px-5 py-3 font-semibold text-white disabled:opacity-40"
            >
              Save my decision
            </button>
            <button
              type="button"
              onClick={() => setChanging(false)}
              className="border-line rounded-lg border px-5 py-3"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-alert mt-3 text-sm">{error}</p>}
    </section>
  );
}
