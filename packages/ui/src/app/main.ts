import { describe, type Tone } from "../model/describe.js";
import { emptyWorld, reduce, repoOf } from "../model/reducer.js";
import { buildTimeline, countAt, pauseAt, realAt } from "../model/timeline.js";
import type { ChildMeta, ChildView, ReplayData, WorldState } from "../model/types.js";
import { layoutWorld, type RepoInput } from "../world/layout.js";
import { PROCEDURAL, ROLE_COLOR } from "../world/procedural.js";
import { WorldView } from "../world/scene.js";
import { SlotRegistry } from "../world/slots.js";

const SPEEDS = [1, 10, 60, 180, 600];
const DEFAULT_SPEED = 180;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  html = "",
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.innerHTML = html;
  return e;
}

const STAGE_COLOR: Record<ChildView["stage"], string> = {
  plot: "#6c7c88",
  foundation: hex(ROLE_COLOR.planner),
  scaffold: hex(ROLE_COLOR.implementer),
  testing: hex(ROLE_COLOR.tester),
  finished: "#5ad19a",
  rubble: "#ff6b5e",
};

/** Every child id: from state.json, plus targets seen in the events. */
function allChildren(data: ReplayData): RepoInput[] {
  const meta = data.children;
  const first = new Map<string, number>();
  const ids = new Set(Object.keys(meta));
  for (const e of data.events) {
    if (!e.target) continue;
    ids.add(e.target);
    if (!first.has(e.target)) first.set(e.target, e.seq);
  }
  const rank = (m: ChildMeta | undefined) => (m?.kind === "setup" ? 0 : m?.kind === "integration" ? 2 : 1);
  const repos = new Map<string, { id: string; integration: boolean }[]>();
  const sorted = [...ids].sort(
    (a, b) =>
      rank(meta[a]) - rank(meta[b]) || (first.get(a) ?? Infinity) - (first.get(b) ?? Infinity) || a.localeCompare(b),
  );
  for (const id of sorted) {
    const repo = meta[id]?.repo ?? repoOf(id);
    const list = repos.get(repo) ?? [];
    list.push({ id, integration: meta[id]?.kind === "integration" });
    repos.set(repo, list);
  }
  // A repo key that only appears as the target of repo-level events is its integration child.
  for (const [repo, list] of repos) {
    if (list.length > 1 && !list.some((c) => c.integration)) {
      const self = list.find((c) => c.id === repo);
      if (self) self.integration = true;
    }
  }
  return [...repos.entries()].map(([id, children]) => ({ id, children }));
}

function fmtClock(ms: number, start: number): string {
  const d = new Date(ms);
  const day = Math.floor((new Date(d).setHours(0, 0, 0, 0) - new Date(start).setHours(0, 0, 0, 0)) / 86_400_000) + 1;
  return `Day ${day} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m ${Math.floor(s % 60)}s`;
}

function boot(): void {
  const raw = document.getElementById("openfleet-data")?.textContent ?? "{}";
  const data = JSON.parse(raw) as ReplayData;
  const meta = data.children ?? {};
  const events = data.events ?? [];
  const tl = buildTimeline(events, { gaps: data.gaps });

  // Each state is copy-on-write, so keeping one per event is cheap and makes scrubbing instant.
  const states: WorldState[] = [emptyWorld(data.project)];
  for (const e of events) states.push(reduce(states[states.length - 1]!, e, meta));
  const ticker = events
    .map((e, i) => ({ i, d: describe(e), ts: Date.parse(e.ts) }))
    .filter((x): x is { i: number; d: { text: string; tone: Tone }; ts: number } => !!x.d);

  const container = document.getElementById("world")!;
  const slots = new SlotRegistry(PROCEDURAL);
  let view: WorldView;
  try {
    view = new WorldView({ container, layout: layoutWorld(allChildren(data)), slots });
  } catch (err) {
    container.innerHTML = `<p style="padding:40px;max-width:520px">This replay needs WebGL, which is not available in this browser. (${esc(String(err))})</p>`;
    return;
  }

  // --- DOM ---------------------------------------------------------------------------------------
  const hud = el("div", { id: "hud", class: "panel" });
  const sidebar = el("nav", { id: "sidebar", class: "panel", "aria-label": "Children" });
  const tick = el("div", { id: "ticker", class: "panel", "aria-live": "polite" });
  const card = el("aside", { id: "card", class: "panel", "aria-label": "Child details" });
  const tooltip = el("div", { id: "tooltip" });
  const labels = el("div", { style: "position:fixed;inset:0;pointer-events:none" });
  const speedOpts = SPEEDS.map(
    (s) => `<option value="${s}"${s === DEFAULT_SPEED ? " selected" : ""}>${s}×</option>`,
  ).join("");
  const bands = tl.pauses
    .map(
      (p) =>
        `<i style="left:${(p.from / tl.duration) * 100}%;width:${((p.to - p.from) / tl.duration) * 100}%" title="Paused"></i>`,
    )
    .join("");
  const controls = el(
    "div",
    { id: "controls", class: "panel" },
    `<button id="play" aria-label="Play">▶</button>
     <label>Speed <select id="speed" aria-label="Playback speed">${speedOpts}</select></label>
     <div class="grow"><div id="bands">${bands}<b></b></div><div id="knob"></div>
       <input id="scrub" type="range" min="0" max="1000" step="1" value="0" aria-label="Timeline"></div>
     <span id="elapsed" style="font-variant-numeric:tabular-nums;color:var(--muted);min-width:110px;text-align:right"></span>
     <label title="Time of day: follows the run's clock (pauses are night) unless you move it">☀
       <input id="sun" type="range" min="0" max="24" step="0.25" value="12" aria-label="Time of day">
       <button id="sunauto" aria-pressed="true">Auto</button></label>
     <button id="recenter" title="Reset camera (R)">⌖</button>`,
  );
  document.body.append(labels, hud, sidebar, tick, card, controls, tooltip);
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const playBtn = $<HTMLButtonElement>("play");
  const speedSel = $<HTMLSelectElement>("speed");
  const scrub = $<HTMLInputElement>("scrub");
  const fill = controls.querySelector("#bands b") as HTMLElement;
  const knob = $<HTMLElement>("knob");
  const elapsed = $<HTMLElement>("elapsed");
  const sun = $<HTMLInputElement>("sun");
  const sunAuto = $<HTMLButtonElement>("sunauto");

  const islandLabels = new Map<string, HTMLElement>();
  for (const l of view.islandLabelPoints()) {
    const d = el(
      "div",
      {
        style:
          "position:absolute;transform:translate(-50%,0);padding:2px 10px;border-radius:99px;background:rgba(10,20,30,.7);font-size:12px;font-weight:600;white-space:nowrap",
      },
      esc(l.repo),
    );
    labels.append(d);
    islandLabels.set(l.repo, d);
  }

  // --- playback ----------------------------------------------------------------------------------
  let t = 0;
  let playing = false;
  let speed = DEFAULT_SPEED;
  let applied = -1;
  let selected: string | undefined;
  let manualSun = false;

  const state = () => states[Math.max(0, applied)]!;

  function setPlaying(p: boolean): void {
    playing = p;
    playBtn.textContent = p ? "❚❚" : t >= tl.duration ? "↻" : "▶";
    playBtn.setAttribute("aria-label", p ? "Pause" : "Play");
  }

  function seek(next: number, instant: boolean): void {
    t = Math.max(0, Math.min(tl.duration, next));
    const idx = countAt(tl, t);
    if (idx !== applied) {
      const big = Math.abs(idx - applied) > 40;
      applied = idx;
      view.sync(state(), instant || big);
      renderPanels();
    }
    const k = tl.duration ? t / tl.duration : 1;
    fill.style.width = `${k * 100}%`;
    knob.style.left = `${k * 100}%`;
    if (document.activeElement !== scrub) scrub.value = String(Math.round(k * 1000));
    const real = realAt(tl, t);
    const pause = pauseAt(tl, t);
    elapsed.textContent = pause
      ? `paused ${fmtDuration((pause.realTo - pause.realFrom) / 1000)}`
      : `${fmtDuration(t)} / ${fmtDuration(tl.duration)}`;
    hudClock.textContent = events.length ? fmtClock(real, tl.start) : "";
    if (!manualSun) {
      const d = new Date(real);
      const hour = d.getHours() + d.getMinutes() / 60;
      sun.value = String(hour);
      view.setClock(hour, !!pause);
    }
  }

  view.onFrame = (dt) => {
    if (playing) {
      seek(t + dt * speed, false);
      if (t >= tl.duration) setPlaying(false);
    }
    for (const l of view.islandLabelPoints()) {
      const d = islandLabels.get(l.repo);
      const p = l.shown ? view.project(l.point) : undefined;
      if (!d) continue;
      d.style.display = p ? "block" : "none";
      if (p) d.style.left = `${p.x}px`;
      if (p) d.style.top = `${p.y + 8}px`;
    }
  };

  playBtn.onclick = () => {
    if (!playing && t >= tl.duration) seek(0, true);
    setPlaying(!playing);
  };
  speedSel.onchange = () => (speed = Number(speedSel.value));
  scrub.oninput = () => seek((Number(scrub.value) / 1000) * tl.duration, true);
  sun.oninput = () => {
    manualSun = true;
    sunAuto.setAttribute("aria-pressed", "false");
    view.setClock(Number(sun.value), false);
  };
  sunAuto.onclick = () => {
    manualSun = !manualSun;
    sunAuto.setAttribute("aria-pressed", String(!manualSun));
    if (manualSun) view.setClock(Number(sun.value), false);
    else seek(t, false);
  };
  $<HTMLButtonElement>("recenter").onclick = () => view.resetCamera();

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.key === " ") {
      e.preventDefault();
      playBtn.click();
    } else if (e.key === "Escape") select(undefined);
    else if (e.key === "r" || e.key === "R") view.resetCamera();
    else if (e.key === "ArrowRight") seek(t + tl.duration / 50, true);
    else if (e.key === "ArrowLeft") seek(t - tl.duration / 50, true);
  });

  // --- picking -----------------------------------------------------------------------------------
  const canvas = view.renderer.domElement;
  let down: { x: number; y: number } | undefined;
  canvas.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener("pointerup", (e) => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) {
      const r = canvas.getBoundingClientRect();
      const id = view.pick(e.clientX - r.left, e.clientY - r.top);
      select(id && state().children[id] ? id : undefined);
    }
    down = undefined;
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.buttons) return ((tooltip.style.display = "none"), undefined);
    const r = canvas.getBoundingClientRect();
    const id = view.pick(e.clientX - r.left, e.clientY - r.top);
    const c = id ? state().children[id] : undefined;
    canvas.style.cursor = c ? "pointer" : "";
    if (!c) {
      tooltip.style.display = "none";
      return;
    }
    tooltip.textContent = `${c.label} — ${c.phase}`;
    tooltip.style.display = "block";
    tooltip.style.left = `${e.clientX + 12}px`;
    tooltip.style.top = `${e.clientY + 12}px`;
  });

  function select(id: string | undefined, focus = false): void {
    selected = id;
    view.select(id);
    if (id && focus) view.focus(id);
    renderPanels();
  }

  // --- panels ------------------------------------------------------------------------------------
  const title = data.title ?? data.project;
  hud.innerHTML = `<h1>${esc(title)}</h1>
    <div class="sub">${esc((data.goal ?? data.specSummary ?? `OpenFleet run · ${data.project}`).slice(0, 160))}</div>
    <div class="clock" id="hudclock"></div><div class="stats" id="hudstats"></div>`;
  const hudClock = $<HTMLElement>("hudclock");
  const hudStats = $<HTMLElement>("hudstats");

  function group(c: ChildView): string {
    if (c.alarm) return "Needs attention";
    if (c.stage === "finished") return "Done";
    if (c.stage === "plot") return "Staked out";
    return "Under construction";
  }

  function renderPanels(): void {
    const s = state();
    const kids = Object.values(s.children);
    const done = kids.filter((c) => c.stage === "finished").length;
    const tests = kids.flatMap((c) => c.tests);
    hudStats.innerHTML = `<span><b>${done}</b>/${kids.length} built</span><span><b>${Object.keys(s.agents).length}</b> ${Object.keys(s.agents).length === 1 ? "robot" : "robots"}</span><span><b>${tests.filter((x) => x.passed).length}</b>/${tests.length} tests ✓</span><span>${esc(s.status)}</span>`;

    const order = ["Needs attention", "Under construction", "Staked out", "Done"];
    const groups = new Map<string, ChildView[]>(order.map((g) => [g, []]));
    for (const c of kids) groups.get(group(c))!.push(c);
    let html = "";
    for (const [name, list] of groups) {
      if (!list.length) continue;
      html += `<h2>${name} · ${list.length}</h2>`;
      for (const c of list) {
        const color = c.alarm ? "#ff6b5e" : STAGE_COLOR[c.stage];
        html += `<button class="item${c.id === selected ? " sel" : ""}" data-id="${esc(c.id)}"><span class="dot" style="background:${color}"></span><span class="name" title="${esc(c.id)}">${esc(c.integration ? `${c.repo} (integration)` : c.label)}</span><span class="ph">${esc(c.phase)}</span></button>`;
      }
    }
    sidebar.innerHTML = html || `<div class="empty">Nothing built yet. Press play.</div>`;
    sidebar.querySelectorAll<HTMLButtonElement>(".item").forEach((b) => (b.onclick = () => select(b.dataset.id, true)));

    const recent = ticker.filter((x) => x.i < applied).slice(-14);
    tick.innerHTML = recent
      .reverse()
      .map(
        (x) =>
          `<div class="tone-${x.d.tone}"><span class="t">${new Date(x.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>${esc(x.d.text)}</div>`,
      )
      .join("");

    renderCard(s);
  }

  function renderCard(s: WorldState): void {
    const c = selected ? s.children[selected] : undefined;
    card.classList.toggle("open", !!c);
    if (!c) return;
    const m = meta[c.id];
    const agents = Object.values(s.agents).filter((a) => a.child === c.id);
    const tests = c.tests.slice(-6).reverse();
    const deps = m?.dependsOn ?? [];
    card.innerHTML = `<button class="close" aria-label="Close">✕</button>
      <h3>${esc(c.integration ? `${c.repo} (integration)` : c.label)}</h3>
      <div style="color:var(--muted);font-size:12px">${esc(c.id)}</div>
      <div style="margin-top:6px"><span class="badge" style="background:${c.alarm ? "#ff6b5e55" : STAGE_COLOR[c.stage] + "44"}">${esc(c.phase)}</span>${c.merged ? '<span class="badge">merged</span>' : ""}${c.rejections ? `<span class="badge">rebuilt ×${c.rejections}</span>` : ""}${m?.kind ? `<span class="badge">${esc(m.kind)}</span>` : ""}</div>
      ${m?.planSummary ? `<h4>Plan</h4><p>${esc(m.planSummary)}</p>` : ""}
      <dl><dt>Diff</dt><dd>${c.diff.files} files, <span class="tone-good">+${c.diff.added}</span> / <span class="tone-bad">−${c.diff.removed}</span></dd>
      <dt>Plans</dt><dd>${c.plan.submitted} submitted · ${c.plan.validated} approved · ${c.plan.rejected} rejected</dd>
      <dt>Robots</dt><dd>${agents.length ? agents.map((a) => esc(a.rawRole)).join(", ") : "none on site"}</dd>
      <dt>Worked by</dt><dd>${c.roles.length ? c.roles.map(esc).join(", ") : "—"}</dd>
      ${deps.length ? `<dt>Needs</dt><dd>${deps.map((d) => esc(s.children[d]?.label ?? d)).join(", ")}</dd>` : ""}
      ${m?.prUrl ? `<dt>PR</dt><dd><a href="${esc(m.prUrl)}" target="_blank" rel="noopener" style="color:var(--info)">${esc(m.prUrl)}</a></dd>` : ""}</dl>
      ${
        c.plan.lastReasons.length
          ? `<h4>Last rejection</h4><ul>${c.plan.lastReasons
              .slice(0, 3)
              .map((r) => `<li>${esc(r)}</li>`)
              .join("")}</ul>`
          : ""
      }
      ${tests.length ? `<h4>Tests (${c.tests.filter((x) => x.passed).length}/${c.tests.length} passed)</h4><ul>${tests.map((x) => `<li class="tone-${x.passed ? "good" : "bad"}">${x.passed ? "✓" : "✗"} <code>${esc(x.command)}</code>${x.summary ? ` — <span style="color:var(--muted)">${esc(x.summary)}</span>` : ""}</li>`).join("")}</ul>` : ""}`;
    card.querySelector<HTMLButtonElement>(".close")!.onclick = () => select(undefined);
  }

  view.start();
  seek(0, true);
  renderPanels();
  setPlaying(false);
  if (events.length) setTimeout(() => setPlaying(true), 900);
}

boot();
