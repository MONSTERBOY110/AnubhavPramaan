"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Starts the mapping for a declaration that has none yet, then reloads the page with the result. */
export function RunMapping({ declarationId }: { declarationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/mapping", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ declarationId }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError("The match could not be computed. Try again in a minute.");
    router.refresh();
  }
  return (
    <div className="border-line rounded-xl border p-6">
      <p className="text-lg">No qualification match yet for this declaration.</p>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="bg-ink mt-4 rounded-lg px-5 py-3 font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Matching against every Qualification Pack..." : "Find the closest qualification"}
      </button>
      {error && <p className="text-alert mt-3 text-sm">{error}</p>}
    </div>
  );
}
