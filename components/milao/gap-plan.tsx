import type { NosView } from "./view";

/**
 * Criteria the declaration did not touch, grouped by NOS. For "upskill first" this is the bridge
 * plan; for direct assessment it is the list the practical should probe.
 */
export function GapPlan({ nos, direct }: { nos: NosView[]; direct: boolean }) {
  const groups = nos
    .map((n) => ({ n, gaps: n.pcs.filter((p) => !p.covered) }))
    .filter((g) => g.gaps.length > 0)
    .sort((a, b) => b.n.weightagePct - a.n.weightagePct || b.gaps.length - a.gaps.length);
  if (groups.length === 0) return null;
  return (
    <section aria-labelledby="gap-title">
      <h2 id="gap-title" className="text-lg font-semibold">
        {direct ? "Probe these in the practical" : "Bridge plan: cover these before assessment"}
      </h2>
      <p className="text-ink-soft text-sm">
        Not mentioned in the declaration, heaviest NOS first. A gap means &ldquo;not
        declared&rdquo;, not &ldquo;cannot do&rdquo;.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {groups.map(({ n, gaps }) => (
          <details
            key={n.id}
            className="border-line rounded-lg border p-4"
            open={n.weightagePct >= 20 && gaps.length <= 6}
          >
            <summary className="cursor-pointer">
              <span className="font-mono text-xs">{n.id}</span>{" "}
              <span className="font-semibold">{gaps.length} gaps</span>
              <span className="text-ink-soft block text-sm">{n.title}</span>
            </summary>
            <ul className="mt-3 grid gap-1.5 text-sm">
              {gaps.map((p) => (
                <li key={p.id}>
                  <span className="text-ink-soft font-mono text-xs">{p.code}</span> {p.text}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
