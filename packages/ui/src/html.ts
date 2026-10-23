import fs from "node:fs";
import type { ReplayData } from "./model/types.js";

let rendererCache: string | undefined;

/** The prebuilt browser bundle (Three.js + world + controls), built by `scripts/build.mjs`. */
export function rendererSource(): string {
  // `dist/renderer.js` sits next to this file once built; from source (tests) it is in ../dist.
  const file = [new URL("./renderer.js", import.meta.url), new URL("../dist/renderer.js", import.meta.url)].find((u) =>
    fs.existsSync(u),
  );
  if (!file) throw new Error("The replay renderer is not built. Run `pnpm --filter @openfleet-tools/ui build`.");
  rendererCache ??= fs.readFileSync(file, "utf8");
  return rendererCache;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** JSON that is safe inside a `<script>` element. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const CSS = `
:root{--ink:#f4f4f6;--muted:#a8a6af;--panel:rgba(28,27,33,.88);--line:#2e2d35;--good:#48a6ee;--bad:#ff6b5e;--warn:#edeb3c;--info:#6bb8f2;--accent:#48a6ee;--brown:#2b1e1b;--head:"Russo One","Arial Black",sans-serif;--mono:"Share Tech Mono",ui-monospace,monospace;color-scheme:dark}
*{box-sizing:border-box}
html,body{margin:0;height:100%;overflow:hidden;background:#0e0e10;color:var(--ink);font:13px/1.4 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
#world{position:fixed;inset:0}
#world canvas{display:block}
.panel{position:fixed;background:var(--panel);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid var(--line);border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
button,select,input{font:inherit;color:inherit}
button{background:#26252c;border:1px solid var(--line);border-radius:6px;padding:6px 10px;cursor:pointer}
button:hover{background:#45434c}
button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
#hud{top:14px;left:14px;padding:12px 16px;max-width:300px}
#hud h1{margin:0;font:16px/1.2 var(--head);letter-spacing:.04em;text-transform:uppercase}
#hud .sub{color:var(--muted);font-size:12px;margin-top:2px}
#hud .clock{font-family:var(--mono);margin-top:8px;font-size:12px;color:var(--info)}
#hud .stats{display:flex;gap:10px;margin-top:6px;font-size:12px;color:var(--muted)}
#hud .stats b{color:var(--ink)}
#sidebar{top:150px;left:14px;bottom:96px;width:260px;padding:10px;overflow:auto}
#sidebar h2{font:11px var(--head);text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:10px 6px 4px}
#sidebar h2:first-child{margin-top:2px}
#sidebar .empty{color:var(--muted);padding:6px}
.item{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:0;background:none;border-radius:8px;padding:5px 6px}
.item:hover,.item.sel{background:#2e2d35}
.item .dot{width:8px;height:8px;border-radius:50%;flex:none}
.item .name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.item .ph{color:var(--muted);font-size:11px}
#ticker{top:14px;right:14px;width:320px;max-height:42vh;padding:10px 12px;overflow:hidden;display:flex;flex-direction:column-reverse;gap:3px;mask-image:linear-gradient(to top,#000 70%,transparent)}
#ticker div{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ticker .t{color:var(--muted);font-family:var(--mono);margin-right:6px}
.tone-good{color:var(--good)}.tone-bad{color:var(--bad)}.tone-warn{color:var(--warn)}.tone-info{color:var(--ink)}
#card{right:14px;bottom:96px;width:340px;max-height:calc(100vh - 140px - 42vh);min-height:120px;overflow:auto;padding:14px 16px;display:none}
#card.open{display:block}
#card h3{margin:0 24px 2px 0;font:15px/1.25 var(--head);word-break:break-word}
#card .close{position:absolute;top:8px;right:8px;padding:2px 8px}
#card .badge{display:inline-block;border-radius:99px;padding:1px 8px;font-size:11px;background:#2e2d35;margin-right:4px}
#card dl{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin:10px 0}
#card dt{color:var(--muted)}#card dd{margin:0}
#card p{margin:8px 0;color:#dfe2e6}
#card ul{margin:4px 0;padding-left:18px}
#card li{margin:2px 0}
#card h4{margin:12px 0 4px;font:11px var(--head);text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
#controls{left:14px;right:14px;bottom:14px;padding:10px 14px;display:flex;align-items:center;gap:12px}
#controls .grow{flex:1;position:relative;height:28px}
#bands{position:absolute;left:0;right:0;top:9px;height:10px;border-radius:5px;background:#26252c;overflow:hidden;pointer-events:none}
#bands i{position:absolute;top:0;bottom:0;background:#0e0e10;border-left:1px solid #45434c;border-right:1px solid #45434c}
#bands b{position:absolute;top:0;bottom:0;background:linear-gradient(90deg,#48a6ee,#ee5ad6,#edeb3c)}
#scrub{position:absolute;inset:0;width:100%;margin:0;opacity:0;cursor:pointer}
#knob{position:absolute;top:5px;width:4px;height:18px;margin-left:-2px;border-radius:2px;background:#fff;pointer-events:none;box-shadow:0 0 6px rgba(255,255,255,.6)}
#controls label{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:12px;white-space:nowrap}
#play{width:40px;background:#48a6ee;color:#2b1e1b;border:0;box-shadow:0 3px 0 0 #2b1e1b;font-weight:700}
#play:hover{background:#6bb8f2}
#play:active{transform:translateY(3px);box-shadow:none}
#tooltip{position:fixed;pointer-events:none;padding:4px 8px;border-radius:6px;background:#1c1b21;border:1px solid #2e2d35;font-size:12px;display:none;z-index:5}
#help{position:fixed;left:50%;top:14px;transform:translateX(-50%);color:var(--muted);font-size:12px;pointer-events:none}
@media (max-width:820px){#sidebar,#ticker{display:none}#card{left:14px;width:auto}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

/** One self-contained HTML page: no network access, everything inlined. */
export function renderReplayHtml(data: ReplayData): string {
  const title = `${data.project} — OpenFleet replay`;
  const js = rendererSource().replace(/<\/script/gi, "<\\/script");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="openfleet replay">
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
<div id="world" aria-label="3D replay of the run"></div>
<noscript>This replay needs JavaScript and WebGL.</noscript>
<script id="openfleet-data" type="application/json">${scriptJson(data)}</script>
<script>${js}</script>
</body>
</html>
`;
}
