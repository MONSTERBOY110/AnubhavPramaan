const STEPS = [
  { name: "Bolo", gloss: "speak", text: "The worker describes their work by voice, in Hindi." },
  {
    name: "Milao",
    gloss: "match",
    text: "Claims are mapped to the closest NSQF Qualification Pack.",
  },
  { name: "Parkho", gloss: "assess", text: "The assessor scores against anchored criteria." },
  {
    name: "Pramaan",
    gloss: "certify",
    text: "A tamper-evident record that only the assessor signs.",
  },
  {
    name: "Samaan",
    gloss: "consistency",
    text: "Agreement between assessors is measured on shared calibration photos.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold">
        AnubhavPramaan <span className="text-ink-soft font-normal">अनुभव प्रमाण</span>
      </h1>
      <p className="text-ink-soft mt-4 text-lg">
        Recognition of Prior Learning for informal workers: speak your experience, get assessed
        fairly, carry a record anyone can verify.
      </p>
      <ol className="mt-10 grid gap-3">
        {STEPS.map((s, i) => (
          <li key={s.name} className="border-line flex items-baseline gap-4 rounded-lg border p-4">
            <span className="text-saffron-deep font-mono text-sm">{i + 1}</span>
            <span className="w-40 font-semibold">
              {s.name} <span className="text-ink-soft font-normal">({s.gloss})</span>
            </span>
            <span className="text-ink-soft">{s.text}</span>
          </li>
        ))}
      </ol>
      <p className="border-decide bg-decide-soft mt-10 rounded-lg border-l-4 p-4 text-sm">
        The AI suggests; the assessor decides. No model output can set a score, a pass or fail, a
        route or a certificate.
      </p>
    </main>
  );
}
