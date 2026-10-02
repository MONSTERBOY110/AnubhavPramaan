import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expect, it } from "vitest";
import { LLM_TIMEOUT_MS, llmEndpoints } from "@/lib/analyzer/config";
import type { GatewayDeps } from "@/lib/analyzer/gateway";
import { scoreLabels } from "@/lib/eval/score";
import { LINK_PROMPT_VERSION } from "@/lib/mapping/link";
import { EXTRACT_PROMPT_VERSION } from "@/lib/declaration/extract";
import { mapDeclaration, type MappingMode, type MappingResult } from "@/lib/mapping/map";
import { suggestRoute } from "@/lib/mapping/route";
import { loadPacks } from "@/lib/packs/load";
import { envWithFiles } from "../../tests/helpers/api-key";

// The mapping evaluation runner. Every run writes eval/mapping/runs/<time>-<set>-<mode>.json and,
// for the frozen set, appends one line to the "Runs" section of FROZEN.md, so the number of runs
// behind any reported figure is on record.
//
//   AP_EVAL_MODE=keyword|llm  AP_EVAL_SET=frozen|dev|heldout  AP_EVAL_ONLY=D01,D02 (optional)
//   AP_EVAL_DIR=<folder> (optional): a dry run on a copy; its run file and log stay in that folder
//   npx vitest run --config vitest.eval.config.mts
//
//   AP_EVAL_RESCORE=<run file> [AP_EVAL_NOTE="LLM run 2"]: score a finished run again from its saved
//   rows under the reporting rule now in force, without calling any model; writes <run>.scored.json
//   and one more line to the log. Refuses a run that was scored already.
//
// LLM results are cached per declaration under eval/mapping/runs/cache/, keyed by the file's
// SHA-256, the model and both prompt versions, so a run interrupted by the provider's daily
// token limit resumes later with the identical configuration instead of mixing settings. The
// run stops cleanly when the daily limit is reached and says how many declarations are done.
//
// Metrics, each reported with its set size:
// - top-1 QP: the suggested pack equals the labelled one ("no suggestion" counts as wrong);
// - PC links: precision and recall of the covered PCs of the LABELLED pack against the labels
//   (micro over all PCs, plus the per-declaration mean);
// - route: the route from the predicted coverage of the labelled pack equals the labelled route,
//   under the flat rule and under the weighted rule.

type Decl = {
  id: string;
  category: string;
  style: string;
  turns: Array<{ topic: string; q: string; answer: string }>;
  expected: { qp: string; pcIds: string[]; routeFlat: string; routeWeighted: string };
};

/** The one model every reported LLM run uses. */
const PINNED_ENDPOINT = "azure:gpt-5-mini";

const SETS: Record<string, string> = {
  frozen: "eval/mapping/declarations",
  dev: "eval/mapping/dev",
  heldout: "docs/internal/heldout",
};

const mode = (process.env.AP_EVAL_MODE ?? "keyword") as MappingMode;
// How long a call may wait before the progress file says it is still waiting (a test seam).
const HEARTBEAT_MS = Number(process.env.AP_EVAL_HEARTBEAT_MS ?? 60_000);
const set = process.env.AP_EVAL_SET ?? "frozen";
const only = new Set(
  (process.env.AP_EVAL_ONLY ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const rescoreFile = process.env.AP_EVAL_RESCORE;

it(rescoreFile ? `rescore ${rescoreFile}` : `mapping eval: ${set} set, ${mode} mode`, async () => {
  if (rescoreFile) return rescore(rescoreFile);
  const dryDir = process.env.AP_EVAL_DIR;
  const dir = dryDir ?? SETS[set];
  expect(dir, `unknown set ${set}`).toBeDefined();
  // Held-out data is private: the held-out set, or any folder under docs/internal, always needs
  // the seal, and keeps its cache and full results next to its transcripts.
  const privateSet = set === "heldout" || /docs[\\/]internal/.test(resolve(dir!));
  const files = readdirSync(dir!).filter((f) => /^[A-Z]\d+\.json$/.test(f));
  if (privateSet) checkSeal(dir!, files);
  const decls: Decl[] = files
    .map((f) => JSON.parse(readFileSync(join(dir!, f), "utf8")) as Decl)
    .filter((d) => only.size === 0 || only.has(d.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  expect(decls.length).toBeGreaterThan(0);

  const env = envWithFiles();
  const endpoints = llmEndpoints("link", env).slice(0, 1); // one model per run: never mix models
  if (mode === "llm") {
    expect(endpoints.length, "no LLM endpoint configured (Azure AI Foundry settings)").toBe(1);
    // Every reported LLM run is pinned to one deployment (lead decision, 2 Oct 11:10).
    expect(endpoints[0]!.id, "LLM runs are pinned to the Azure deployment").toBe(PINNED_ENDPOINT);
  }
  const packs = loadPacks();
  const started = new Date();
  // Times in IST, like every other timestamp in the project's logs.
  const ist = started.toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }); // "2026-10-02 02:26:05"
  const stamp = ist.slice(0, 16).replace(/[-:]/g, "").replace(" ", "-");
  const name = `${stamp}-${set}-${mode}${only.size ? "-partial" : ""}.json`;
  // Full results (rows can carry model text) stay with private data; the public folder gets the
  // summary of a held-out run only.
  const runsDir = privateSet || dryDir ? join(dir!, "runs") : "eval/mapping/runs";
  mkdirSync(runsDir, { recursive: true });
  const file = join(runsDir, name).replace(/\\/g, "/");
  const log =
    set === "frozen" && !dryDir
      ? "eval/mapping/FROZEN.md"
      : privateSet
        ? join(dir!, "SEALED.md")
        : null;

  // Progress, written the moment it happens (vitest holds console output until the test ends), so
  // a stall shows within a minute: every model call's start and end, and one line per declaration.
  // Ids, seconds, tokens and errors only: no scores until the run is complete.
  const progressFile = file.replace(/\.json$/, ".progress.log");
  const progress = (text: string) => {
    const at = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false });
    const line = `${at} ${text}\n`;
    process.stderr.write(line);
    appendFileSync(progressFile, line, "utf8");
  };
  progress(
    `start: ${set} set, ${mode} mode, ${decls.length} declarations, ${mode === "llm" ? `${PINNED_ENDPOINT}, ${EXTRACT_PROMPT_VERSION} and ${LINK_PROMPT_VERSION}` : "no LLM"}`,
  );

  const rows: Row[] = [];
  const model = endpoints[0]?.model ?? "none";
  let stoppedAt: string | null = null;
  // Declarations whose result was computed by an earlier run with this exact configuration; every
  // summary says how many, so a resumed run is never presented as one sitting.
  const fromCache: string[] = [];
  for (const d of decls) {
    const t0 = Date.now();
    const cacheFile = cachePath(dir!, d.id, mode, model, privateSet || Boolean(dryDir));
    let result: MappingResult | null = null;
    let cached = false;
    if (mode === "llm" && existsSync(cacheFile)) {
      result = JSON.parse(readFileSync(cacheFile, "utf8")) as MappingResult;
      cached = true;
      fromCache.push(d.id);
    }
    if (!result) {
      // A long link reply can take two minutes or more, so while a call is still waiting a line
      // says so every minute: silence in the progress file always means a stall.
      let waiting: { label: string; since: number } | null = null;
      let lastLine = Date.now();
      const heartbeat = setInterval(
        () => {
          if (!waiting || Date.now() - lastLine < HEARTBEAT_MS) return;
          lastLine = Date.now();
          progress(
            `  ${d.id} ${waiting.label}: still waiting, ${Math.round((Date.now() - waiting.since) / 1000)}s`,
          );
        },
        Math.min(5_000, HEARTBEAT_MS / 2),
      );
      const gateway: GatewayDeps = {
        endpoints,
        timeoutMs: Math.max(LLM_TIMEOUT_MS, 90_000),
        onEvent: (e) => {
          lastLine = Date.now();
          waiting = e.kind === "start" ? { label: e.label ?? "call", since: Date.now() } : null;
          if (e.kind === "start" && e.attempt === 1)
            return progress(`  ${d.id} ${e.label ?? "call"}: start`);
          const ms = e.ms === undefined ? "" : ` ${(e.ms / 1000).toFixed(1)}s`;
          const tokens = e.usage ? ` ${e.usage.prompt}+${e.usage.completion} tokens` : "";
          const error = e.error ? ` ${e.error.replace(/\s+/g, " ").slice(0, 160)}` : "";
          const wait = e.waitMs ? `, retrying in ${(e.waitMs / 1000).toFixed(1)}s` : "";
          progress(
            `  ${d.id} ${e.label ?? "call"}: ${e.kind} (attempt ${e.attempt})${ms}${tokens}${error}${wait}`,
          );
        },
      };
      try {
        result = await mapDeclaration(
          { answers: d.turns.map((t) => ({ topic: t.topic, q: t.q, text: t.answer })) },
          packs,
          { mode, gateway, env },
        );
      } finally {
        clearInterval(heartbeat);
      }
      const errors = result.packs.map((p) => p.linkError ?? "").join(" ");
      if (
        mode === "llm" &&
        /tokens per day|TPD|requests per day|RPD|exceeded your current quota/i.test(errors)
      ) {
        stoppedAt = d.id;
        progress(
          `STOP at ${d.id}: the provider's quota is spent; cached results resume the same configuration.`,
        );
        break;
      }
      if (
        mode === "llm" &&
        !result.packs.some((p) => p.linkError) &&
        result.ledger.extractionFallbacks === 0
      ) {
        mkdirSync(dirname(cacheFile), { recursive: true });
        writeFileSync(cacheFile, JSON.stringify(result) + "\n", "utf8");
      }
    }
    const row = scoreRow(d, result, (Date.now() - t0) / 1000);
    rows.push(row);
    progress(
      `${d.id}: ${cached ? "from cache" : `${row.seconds}s`}, ${row.ledger.tokens.prompt}+${row.ledger.tokens.completion} tokens, ` +
        `${row.claims} claims, link errors ${row.linkErrors.length}, extraction fallbacks ${row.ledger.extractionFallbacks}` +
        (row.linkErrors.length
          ? ` (${row.linkErrors.join("; ").replace(/\s+/g, " ").slice(0, 200)})`
          : ""),
    );
  }

  const report = buildReport(rows, {
    set,
    mode,
    planned: decls.length,
    endpoint: mode === "llm" ? endpoints[0]!.id : "none",
    prompts: { extract: EXTRACT_PROMPT_VERSION, link: LINK_PROMPT_VERSION },
    ist,
    startedAt: started.toISOString(),
    seconds: Math.round((Date.now() - started.getTime()) / 1000),
    file,
    fromCache,
    stoppedAt,
    partial: [...only],
  });
  // An incomplete run keeps its rows for diagnosis, marked, and no aggregate figure.
  writeFileSync(file, JSON.stringify({ summary: report.summary, rows }, null, 2) + "\n", "utf8");
  if (report.reported && privateSet && !dryDir) {
    mkdirSync("eval/mapping/runs", { recursive: true });
    writeFileSync(
      join("eval/mapping/runs", name),
      JSON.stringify({ summary: report.summary }, null, 2) + "\n",
      "utf8",
    );
  }
  progress(report.line);
  if (log && existsSync(log)) appendRun(log, report.line);
});

type ReportContext = {
  set: string;
  mode: MappingMode;
  /** Declarations the run set out to map. */
  planned: number;
  endpoint: string;
  prompts: { extract: string; link: string };
  /** Start of the run in IST, "2026-10-02 12:04:09". */
  ist: string;
  startedAt: string;
  seconds: number;
  file: string;
  fromCache: string[];
  stoppedAt: string | null;
  partial: string[];
  /** Words that open the log line, e.g. "LLM run 2, scored 13:20 IST from its saved rows". */
  note?: string;
};

/** Answers the provider's content filter refused in a declaration (older rows record none). */
const blockedAnswers = (r: Row) => r.ledger.contentFilterBlocked ?? [];
/** Rule-based fallbacks for any other reason: a timeout, a network failure, an unparsed reply. */
const otherFallbacks = (r: Row) => r.ledger.extractionFallbacks - blockedAnswers(r).length;

function aggregate(rows: Row[]) {
  const n = rows.length;
  const tp = rows.reduce((a, r) => a + r.tp, 0);
  const fp = rows.reduce((a, r) => a + r.fp, 0);
  const fn = rows.reduce((a, r) => a + r.fn, 0);
  return {
    n,
    top1: rows.filter((r) => r.top1).length,
    pcMicro: {
      tp,
      fp,
      fn,
      precision: tp + fp ? tp / (tp + fp) : 1,
      recall: tp + fn ? tp / (tp + fn) : 1,
    },
    pcMacro: {
      precision: n ? rows.reduce((a, r) => a + r.precision, 0) / n : 0,
      recall: n ? rows.reduce((a, r) => a + r.recall, 0) / n : 0,
    },
    routeFlat: rows.filter((r) => r.routeFlat.expected === r.routeFlat.predicted).length,
    routeWeighted: rows.filter((r) => r.routeWeighted.expected === r.routeWeighted.predicted)
      .length,
    byCategory: Object.fromEntries(
      [...new Set(rows.map((r) => r.category))].map((c) => {
        const rs = rows.filter((r) => r.category === c);
        const ctp = rs.reduce((a, r) => a + r.tp, 0);
        const cfp = rs.reduce((a, r) => a + r.fp, 0);
        const cfn = rs.reduce((a, r) => a + r.fn, 0);
        return [
          c,
          {
            n: rs.length,
            top1: rs.filter((r) => r.top1).length,
            precision: ctp + cfp ? ctp / (ctp + cfp) : 1,
            recall: ctp + cfn ? ctp / (ctp + cfn) : 1,
          },
        ];
      }),
    ),
    tokensPerDeclaration: {
      prompt: n ? Math.round(rows.reduce((a, r) => a + r.ledger.tokens.prompt, 0) / n) : 0,
      completion: n ? Math.round(rows.reduce((a, r) => a + r.ledger.tokens.completion, 0) / n) : 0,
    },
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const scoreText = (a: ReturnType<typeof aggregate>) =>
  `top-1 QP ${a.top1}/${a.n}; PC links micro P ${pct(a.pcMicro.precision)} R ${pct(a.pcMicro.recall)}; ` +
  `route agreement flat ${a.routeFlat}/${a.n}, weighted ${a.routeWeighted}/${a.n}`;
const tokenText = (a: ReturnType<typeof aggregate>) =>
  `tokens per declaration ${a.tokensPerDeclaration.prompt} in and ${a.tokensPerDeclaration.completion} out`;

/**
 * The summary and the log line of a run, under the reporting rule in force:
 * - lead, 2 Oct 11:51: an LLM run reports numbers only when every declaration completed with no
 *   link error and no rule-based extraction fallback; otherwise "incomplete, not reported", with
 *   the list of failures, and a rule-based fallback is never mixed into an AI number;
 * - amendment, lead, 2 Oct 13:03, decided before any frozen score was viewed: an answer refused
 *   by the provider's content filter is a fixed property of the deployed system, handled by the
 *   rules as in the live app. The headline covers every declaration and says how many answers the
 *   filter blocked; the pure-AI number covers only the declarations with zero fallbacks.
 */
function buildReport(rows: Row[], ctx: ReportContext) {
  const n = rows.length;
  const llm = ctx.mode === "llm";
  const config = llm
    ? `${ctx.endpoint}, prompts ${ctx.prompts.extract} and ${ctx.prompts.link}`
    : "keyword baseline, no LLM";
  const cacheNote = ctx.fromCache.length
    ? `${ctx.fromCache.length} of ${n} from the cache of an earlier run with this configuration (${ctx.fromCache.join(",")}); `
    : "";
  const opening = `- ${ctx.ist.slice(0, 16)} IST${ctx.note ? ` (${ctx.note})` : ""}:`;
  const common = {
    set: ctx.set,
    mode: ctx.mode,
    n,
    endpoint: llm ? ctx.endpoint : "none (keyword baseline)",
    prompts: ctx.prompts,
    date: ctx.ist.slice(0, 10),
    fromCache: ctx.fromCache,
    startedAt: ctx.startedAt,
    seconds: ctx.seconds,
  };

  const failures = llm
    ? rows
        .filter((r) => r.linkErrors.length > 0 || otherFallbacks(r) > 0)
        .map((r) =>
          [
            r.id,
            r.linkErrors.length ? `${r.linkErrors.length} link error(s)` : "",
            otherFallbacks(r) > 0 ? `${otherFallbacks(r)} extraction fallback(s)` : "",
          ]
            .filter(Boolean)
            .join(" "),
        )
    : [];
  const blockedRows = rows.filter((r) => blockedAnswers(r).length > 0);
  const blocked = blockedRows.reduce((a, r) => a + blockedAnswers(r).length, 0);
  const answers = rows.reduce((a, r) => a + r.answers, 0);
  const contentFilter = blocked
    ? {
        blockedAnswers: blocked,
        answers,
        where: blockedRows.map((r) => ({ id: r.id, answers: blockedAnswers(r) })),
        note: `${blocked} of ${answers} answers (${blockedRows.map((r) => r.id).join(", ")}) blocked by the provider's content filter and handled by rule-based extraction, as in the live app`,
      }
    : null;
  const all = aggregate(rows);

  if (ctx.stoppedAt || failures.length > 0) {
    const why = [
      ctx.stoppedAt
        ? `stopped at ${ctx.stoppedAt} by the provider's quota after ${n} of ${ctx.planned}`
        : "",
      failures.length
        ? `${failures.length} of ${n} declarations failed: ${failures.join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("; ");
    return {
      reported: false,
      summary: {
        ...common,
        reported: false,
        why,
        failures,
        contentFilter,
        tokensPerDeclaration: all.tokensPerDeclaration,
      },
      line: `${opening} ${ctx.mode} mode, ${config}, n=${ctx.planned}: incomplete, not reported (${why}); ${cacheNote}file \`${ctx.file}\``,
    };
  }

  const pure = contentFilter
    ? aggregate(rows.filter((r) => r.ledger.extractionFallbacks === 0))
    : null;
  const summary = {
    ...common,
    reported: true,
    ...all,
    contentFilter,
    /** Only the declarations with zero fallbacks: every claim in them came from the model. */
    pureAi: pure,
    models: [...new Set(rows.flatMap((r) => r.ledger.models))],
    tokens: rows.reduce(
      (a, r) => ({
        prompt: a.prompt + r.ledger.tokens.prompt,
        completion: a.completion + r.ledger.tokens.completion,
      }),
      { prompt: 0, completion: 0 },
    ),
    linkErrors: rows.reduce((a, r) => a + r.linkErrors.length, 0),
    extractionFallbacks: rows.reduce((a, r) => a + r.ledger.extractionFallbacks, 0),
    promptVersion: rows[0]?.ledger.promptVersion,
  };
  const line =
    `${opening} ${ctx.mode} mode${ctx.partial.length ? ` (partial: ${ctx.partial.join(",")})` : ""}, n=${n}: ${scoreText(all)}; ` +
    (contentFilter ? `note: ${contentFilter.note}; ` : "") +
    (llm
      ? `${config}, ${tokenText(all)}, link errors 0, extraction fallbacks ${blocked ? `${blocked} (content filter only)` : "0"}; `
      : "no LLM; ") +
    (pure
      ? `pure AI, the ${pure.n} declaration${pure.n === 1 ? "" : "s"} with zero fallbacks: ${scoreText(pure)}; ${tokenText(pure)}; `
      : "") +
    cacheNote +
    `file \`${ctx.file}\``;
  return { reported: true, summary, line };
}

/**
 * Score a finished run again from its saved rows (AP_EVAL_RESCORE), without calling any model.
 * Content-filter blocks come from each row's ledger; a run from before the ledger recorded them
 * (before 2 Oct 13:03) has them read from its own progress log, where every refused call is a
 * "fail" line naming Azure's content management policy.
 */
function rescore(path: string): void {
  const runFile = path.replace(/\\/g, "/");
  const out = runFile.replace(/\.json$/, ".scored.json");
  expect(existsSync(out), `${out} exists: this run was scored already`).toBe(false);
  const saved = JSON.parse(readFileSync(runFile, "utf8")) as {
    summary: {
      set: string;
      mode: MappingMode;
      endpoint: string;
      prompts: ReportContext["prompts"];
      startedAt: string;
      seconds: number;
      fromCache?: string[];
    };
    rows: Array<Omit<Row, "answers"> & { answers?: number }>;
  };
  const old = saved.summary;
  expect(old.mode, "only an LLM run is scored again").toBe("llm");
  expect(old.endpoint, "LLM runs are pinned to the Azure deployment").toBe(PINNED_ENDPOINT);
  const dir = SETS[old.set];
  expect(dir, `unknown set ${old.set}`).toBeDefined();
  const progressLog = runFile.replace(/\.json$/, ".progress.log");
  const logText = existsSync(progressLog) ? readFileSync(progressLog, "utf8") : "";
  const refused = new Map<string, number[]>();
  for (const m of logText.matchAll(
    /^\S+\s+([A-Z]\d+) extract answer (\d+): fail \(attempt \d+\) .*(?:content management policy|content filter)/gm,
  )) {
    refused.set(m[1]!, [...(refused.get(m[1]!) ?? []), Number(m[2])]);
  }
  const rows: Row[] = saved.rows.map((r) => {
    const d = JSON.parse(readFileSync(join(dir!, `${r.id}.json`), "utf8")) as Decl;
    return {
      ...r,
      answers: r.answers ?? d.turns.filter((t) => t.answer.trim()).length,
      ledger: {
        ...r.ledger,
        contentFilterBlocked: r.ledger.contentFilterBlocked ?? refused.get(r.id) ?? [],
      },
    };
  });
  const fromCache =
    old.fromCache ?? [...logText.matchAll(/^\S+ ([A-Z]\d+): from cache/gm)].map((m) => m[1]!);
  const ist = new Date(old.startedAt).toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" });
  const now = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false });
  const report = buildReport(rows, {
    set: old.set,
    mode: old.mode,
    planned: rows.length,
    endpoint: old.endpoint,
    prompts: old.prompts,
    ist,
    startedAt: old.startedAt,
    seconds: old.seconds,
    file: out,
    fromCache,
    stoppedAt: null,
    partial: [],
    note: [process.env.AP_EVAL_NOTE, `scored ${now.slice(0, 5)} IST from its saved rows, no rerun`]
      .filter(Boolean)
      .join(", "),
  });
  writeFileSync(
    out,
    JSON.stringify({ summary: { ...report.summary, scoredFrom: runFile }, rows }, null, 2) + "\n",
    "utf8",
  );
  const log =
    old.set === "frozen"
      ? "eval/mapping/FROZEN.md"
      : old.set === "heldout"
        ? join(dir!, "SEALED.md")
        : null;
  if (log && existsSync(log)) appendRun(log, report.line);
  process.stderr.write(`${report.line}\n`);
}

/** Add one line to the "Runs" section of FROZEN.md or SEALED.md. */
function appendRun(log: string, line: string): void {
  const text = readFileSync(log, "utf8");
  if (text.includes("## Runs\n\nNone so far.")) {
    writeFileSync(log, text.replace("## Runs\n\nNone so far.", `## Runs\n\n${line}`), "utf8");
  } else {
    appendFileSync(log, `${line}\n`, "utf8");
  }
}

type Row = ReturnType<typeof scoreRow>;

function scoreRow(d: Decl, result: MappingResult, seconds: number) {
  const labelled = result.packs.find((p) => p.pack.id === d.expected.qp)!;
  const predicted = labelled.coverage.covered;
  const s = scoreLabels([{ expected: d.expected.pcIds, predicted }]);
  return {
    id: d.id,
    category: d.category,
    style: d.style,
    expectedQp: d.expected.qp,
    predictedQp: result.best,
    top1: result.best === d.expected.qp,
    expectedPcs: d.expected.pcIds.length,
    predictedPcs: predicted.length,
    tp: s.tp,
    fp: s.fp,
    fn: s.fn,
    precision: s.precision,
    recall: s.recall,
    coverage: { flat: labelled.coverage.flat, weighted: labelled.coverage.weighted },
    routeFlat: {
      expected: d.expected.routeFlat,
      predicted: suggestRoute(labelled.coverage, "flat").suggestion,
    },
    routeWeighted: {
      expected: d.expected.routeWeighted,
      predicted: suggestRoute(labelled.coverage, "weighted").suggestion,
    },
    claims: result.claims.length,
    answers: d.turns.filter((t) => t.answer.trim()).length,
    linkErrors: result.packs.filter((p) => p.linkError).map((p) => `${p.pack.id}: ${p.linkError}`),
    ledger: result.ledger,
    seconds: Math.round(seconds * 10) / 10,
    falsePositives: s.falsePositives,
    falseNegatives: s.falseNegatives,
  };
}

/**
 * Cache key: the declaration file's bytes, the model and both prompt versions. The held-out cache
 * stays next to its private transcripts, since cached results quote them.
 */
function cachePath(dir: string, id: string, mode: string, model: string, own: boolean): string {
  const bytes = readFileSync(join(dir, `${id}.json`), "utf8").replace(/\r\n/g, "\n");
  const key = createHash("sha256")
    .update([bytes, mode, model, EXTRACT_PROMPT_VERSION, LINK_PROMPT_VERSION].join("|"), "utf8")
    .digest("hex");
  const base = own ? join(dir, "cache") : "eval/mapping/runs/cache";
  return join(base, `${id}-${key.slice(0, 16)}.json`);
}

/**
 * The held-out labels must be sealed (seal_heldout.py) and unchanged before the mapper runs: every
 * declaration file the runner would read must be listed in SEALED.md with its hash.
 */
function checkSeal(dir: string, files: string[]): void {
  const sealed = join(dir, "SEALED.md");
  if (!existsSync(sealed))
    throw new Error("Held-out labels are not sealed. Run: python eval/mapping/seal_heldout.py");
  const text = readFileSync(sealed, "utf8");
  const listed = new Map(
    [...text.matchAll(/^\| (R\d+\.json) \| `([0-9a-f]{64})` \|$/gm)].map((m) => [m[1]!, m[2]!]),
  );
  const present = files;
  for (const f of present) {
    const hash = createHash("sha256")
      .update(readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n"), "utf8")
      .digest("hex");
    if (listed.get(f) !== hash)
      throw new Error(
        `${f} differs from SEALED.md: a label change after sealing needs seal_heldout.py --amend "<reason>"`,
      );
  }
  if (present.length !== listed.size)
    throw new Error("SEALED.md lists a different set of files than the folder holds");
}
