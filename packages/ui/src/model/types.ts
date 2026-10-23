/** One line of a project's `events.jsonl` (schema v1). Unknown types are ignored. */
export interface RunEvent {
  v: number;
  ts: string;
  seq: number;
  actor: string;
  type: string;
  target: string | null;
  payload: Record<string, unknown>;
}

/** Static facts about a child, taken from `state.json` and its plan. */
export interface ChildMeta {
  id: string;
  repo: string;
  package?: string;
  /** Short display name: the unit or package, or the repo for a single-child repo. */
  label: string;
  kind: "integration" | "setup" | "member" | "single";
  dependsOn: string[];
  /** First section of the plan (the `## Summary` section when present). */
  planSummary?: string;
  prUrl?: string;
}

/** Everything the replay page needs, embedded in the HTML as JSON. */
export interface ReplayData {
  v: 1;
  project: string;
  status?: string;
  host?: string;
  generatedAt: string;
  specSummary?: string;
  /** The request's title and goal (from spec.md), when known. */
  title?: string;
  goal?: string;
  /** Pauses (ms since epoch) that the replay clock collapses and shows as night. */
  gaps: { start: number; end: number }[];
  children: Record<string, ChildMeta>;
  events: RunEvent[];
}

export type AgentRole = "coordinator" | "planner" | "implementer" | "tester";

/** What a child's building looks like right now. */
export type Stage = "plot" | "foundation" | "scaffold" | "testing" | "finished" | "rubble";

export interface TestRun {
  seq: number;
  command: string;
  passed: boolean;
  summary?: string;
}

export interface ChildView {
  id: string;
  repo: string;
  label: string;
  integration: boolean;
  phase: string;
  stage: Stage;
  /** `failed` or `blocked`: shown with a beacon. */
  alarm?: "failed" | "blocked";
  merged: boolean;
  rejections: number;
  plan: { submitted: number; validated: number; rejected: number; lastReasons: string[] };
  tests: TestRun[];
  diff: { files: number; added: number; removed: number };
  /** Every role that has worked on the child so far. */
  roles: AgentRole[];
  lastSeq: number;
}

export interface AgentView {
  id: string;
  role: AgentRole;
  /** Raw role from the actor (`repo-coordinator`, `baseline`, ...). */
  rawRole: string;
  child: string;
  repo: string;
  since: number;
}

export interface WorldState {
  project: string;
  status: string;
  seq: number;
  /** Timestamp (ms) of the last applied event, or 0. */
  time: number;
  repos: Record<string, { id: string; children: string[] }>;
  children: Record<string, ChildView>;
  agents: Record<string, AgentView>;
  done: boolean;
}
