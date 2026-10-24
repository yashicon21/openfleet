import type { ChildMeta, ReplayData, RunEvent } from "./types.js";

/** A child as the run model describes it (see the CLI's report model). */
export interface ChildInput {
  id: string;
  repo: string;
  label: string;
  kind: ChildMeta["kind"];
  dependsOn: string[];
  /** Plan path as stored in state.json. */
  plan?: string;
  prUrl?: string;
}

export interface ReplayInput {
  project: string;
  status?: string;
  host?: string;
  title?: string;
  goal?: string;
  /** Raw events in any order. */
  events: RunEvent[];
  children: ChildInput[];
  /** Pauses to collapse (ms since epoch), usually the run model's gaps. */
  gaps?: { start: number; end: number }[];
  /** Agents whose stop was never logged, with the inferred end time (ms). An `agent.stopped` is added for each. */
  inferredStops?: { agentId: string; end: number }[];
  /** Reads a plan file (path as stored in state.json). Returns undefined when it is missing. */
  readPlan?: (planPath: string) => string | undefined;
  /** Override the generation timestamp (tests). */
  now?: Date;
}

const MAX_TEXT = 400;
/** Payload keys that hold local paths, full agent output or diffs: never embedded. */
const DROP_KEYS = new Set(["patch", "worktree", "repoPath", "response", "copiedFiles", "missingCopyFiles", "plans"]);

function slim(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.length > MAX_TEXT ? value.slice(0, MAX_TEXT - 1) + "…" : value;
  if (Array.isArray(value)) return depth > 2 ? [] : value.slice(0, 20).map((v) => slim(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (DROP_KEYS.has(k)) continue;
      out[k] = slim(v, depth + 1);
    }
    return out;
  }
  return value;
}

function slimEvent(e: RunEvent): RunEvent {
  const payload = { ...(e.payload ?? {}) };
  if (e.type === "worktree.snapshot") delete payload.files;
  if (e.type.startsWith("file.")) return { ...e, payload: { kind: payload.kind, lines: payload.lines } };
  return { ...e, payload: slim(payload) as Record<string, unknown> };
}

/** The `## Summary` section of a plan, or its first paragraph. */
export function planSummary(markdown: string): string | undefined {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+summary\b/i.test(l));
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line)) {
      if (body.length) break;
      continue;
    }
    if (!line.trim()) {
      if (body.length && start < 0) break;
      if (body.length) body.push("");
      continue;
    }
    body.push(line.trim());
  }
  const text = body.join(" ").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > 700 ? text.slice(0, 699) + "…" : text;
}

function byTime(a: RunEvent, b: RunEvent): number {
  return Date.parse(a.ts) - Date.parse(b.ts) || a.seq - b.seq;
}

export function buildReplayData(input: ReplayInput): ReplayData {
  const events = [...input.events].sort(byTime);
  for (const s of input.inferredStops ?? []) {
    if (!Number.isFinite(s.end)) continue;
    const before = events.filter((e) => Date.parse(e.ts) <= s.end).pop();
    events.push({
      v: 1,
      ts: new Date(s.end).toISOString(),
      seq: (before?.seq ?? 0) + 0.5,
      actor: "cli",
      type: "agent.stopped",
      target: null,
      payload: { agentId: s.agentId, inferred: true },
    });
  }
  events.sort(byTime);

  const children: Record<string, ChildMeta> = {};
  for (const c of input.children) {
    const md = c.plan && input.readPlan ? input.readPlan(c.plan) : undefined;
    children[c.id] = {
      id: c.id,
      repo: c.repo,
      label: c.label,
      kind: c.kind,
      dependsOn: c.dependsOn,
      planSummary: md ? planSummary(md) : undefined,
      prUrl: c.prUrl,
    };
  }
  const spec = events.find((e) => e.type === "spec.written");
  const specSummary = typeof spec?.payload?.summary === "string" ? spec.payload.summary : undefined;
  return {
    v: 1,
    project: input.project,
    status: input.status,
    host: input.host,
    title: input.title,
    goal: input.goal,
    generatedAt: (input.now ?? new Date()).toISOString(),
    specSummary,
    gaps: input.gaps ?? [],
    children,
    events: events.map(slimEvent),
  };
}
