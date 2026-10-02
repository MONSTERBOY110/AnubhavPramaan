// View model for the Milao (match) screen. Built on the server from a stored mapping result, so
// the components below never call a model or compute coverage themselves.

export type LinkView = {
  quote: string;
  summary: string;
  topic: string;
  /** Model confidence; null for a keyword-baseline match, which has none. */
  confidence: number | null;
  rationale: string;
};

export type PcView = {
  id: string;
  code: string;
  text: string;
  covered: boolean;
  links: LinkView[];
};

export type NosView = {
  id: string;
  title: string;
  weightagePct: number;
  pcs: PcView[];
  covered: number;
  pct: number;
};

export type PackSummary = {
  id: string;
  version: string;
  title: string;
  nsqfLevel: string;
  status: "active" | "deactivated";
  flatPct: number;
  weightedPct: number;
};

export type RouteView = {
  rule: "weighted" | "flat";
  pct: number;
  threshold: number;
  suggestion: "direct-assessment" | "upskill-first";
};

export type DecisionView = {
  qp: string;
  route: "direct-assessment" | "upskill-first";
  agreesWithSuggestion: boolean;
  reason?: string;
  assessorId: string;
  at: string;
};

export type MilaoView = {
  declarationId: string;
  candidateRef: string;
  declaredAt: string;
  confirmedAt?: string;
  asrLabels: string[];
  model: string;
  best: PackSummary & { nos: NosView[] };
  others: PackSummary[];
  route: RouteView;
  decision?: DecisionView;
};
