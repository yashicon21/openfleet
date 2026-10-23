// `npx openfleet replay <project>`: write a self-contained 3D replay of a run as one HTML file.
import fs from "node:fs";
import path from "node:path";
import { readEvents, type OpenFleetEvent } from "../events.js";
import { writeFileAtomic } from "../fsutil.js";
import { buildModel, type ReportModel } from "../report/index.js";
import { readState } from "../state.js";
import { projectPaths, requireWorkspace, UserError, validateProjectName, type Workspace } from "../workspace.js";
import { out } from "./output.js";
import { openInBrowser, parseGap } from "./report.js";

const USAGE = "Usage: npx openfleet replay <project> [--out <file>] [--open] [--gap <minutes>]";

/** The part of `@openfleet-tools/ui` this command uses. The package is loaded lazily to keep startup small. */
interface UiModule {
  buildReplayData(input: {
    project: string;
    status?: string;
    host?: string;
    title?: string;
    goal?: string;
    events: OpenFleetEvent[];
    children: {
      id: string;
      repo: string;
      label: string;
      kind: ReportModel["children"][number]["kind"];
      dependsOn: string[];
      plan?: string;
      prUrl?: string;
    }[];
    gaps?: { start: number; end: number }[];
    inferredStops?: { agentId: string; end: number }[];
    readPlan?: (planPath: string) => string | undefined;
  }): unknown;
  renderReplayHtml(data: unknown): string;
}

const UI_PACKAGE = "@openfleet-tools/ui";

async function loadUi(): Promise<UiModule> {
  try {
    return (await import(UI_PACKAGE)) as UiModule;
  } catch (err) {
    throw new UserError(`Could not load ${UI_PACKAGE} (${(err as Error).message}). Reinstall openfleet and try again.`);
  }
}

export function defaultReplayPath(ws: Workspace, project: string): string {
  return path.join(projectPaths(ws, project).dir, "replay.html");
}

/** Build the replay page for a project (past or in progress). */
export async function generateReplay(ws: Workspace, name: string, opts: { gapMinutes?: number } = {}): Promise<string> {
  const p = projectPaths(ws, name);
  const state = readState(p);
  const model = buildModel(ws, name, { gapMinutes: opts.gapMinutes });
  const ui = await loadUi();
  const readPlan = (planPath: string): string | undefined => {
    for (const file of path.isAbsolute(planPath)
      ? [planPath]
      : [path.join(p.dir, planPath), path.join(ws.root, planPath)]) {
      try {
        return fs.readFileSync(file, "utf8");
      } catch {
        // try the next location
      }
    }
    return undefined;
  };
  const data = ui.buildReplayData({
    project: name,
    status: model.status,
    host: model.host,
    title: model.title,
    goal: model.goal,
    events: readEvents(p),
    children: model.children.map((c) => ({
      id: c.id,
      repo: c.repo,
      label: c.label,
      kind: c.kind,
      dependsOn: c.dependsOn,
      plan: state.children[c.id]?.plan,
      prUrl: state.children[c.id]?.prUrl,
    })),
    gaps: model.gaps,
    inferredStops: model.agents.flatMap((a) => (a.inferred && a.agentId ? [{ agentId: a.agentId, end: a.end }] : [])),
    readPlan,
  });
  return ui.renderReplayHtml(data);
}

export async function cmdReplay(
  args: string[],
  opts: { out?: string; open?: boolean; gap?: string } = {},
): Promise<number> {
  const ws = requireWorkspace();
  if (args.length !== 1) throw new UserError(USAGE);
  const name = validateProjectName(args[0]);
  readState(projectPaths(ws, name));
  const html = await generateReplay(ws, name, { gapMinutes: parseGap(opts.gap) });
  const file = opts.out ? path.resolve(opts.out) : defaultReplayPath(ws, name);
  writeFileAtomic(file, html);
  out(`Wrote ${file}`);
  if (opts.open) openInBrowser(file);
  return 0;
}
