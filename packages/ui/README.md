# @openfleet-tools/ui

The replay world for [OpenFleet](https://openfleet.tools): `npx openfleet replay <project>` uses it to write one offline HTML file that plays back a run as an animated 3D world. You do not need to install it yourself; `@openfleet-tools/cli` depends on it.

- `src/model`: pure, DOM-free code. `buildReplayData` turns a project's events and run model into the embedded data, `reduce` folds events into a `WorldState`, and `buildTimeline` maps events to replay time with long pauses collapsed.
- `src/world`: the Three.js scene. Every object comes from a named slot in a `SlotRegistry`, with procedural low-poly models as the defaults.
- `src/app`: the page (playback controls, sidebar, ticker, child card). It is bundled with Three.js into `dist/renderer.js`.

```js
import { buildReplayData, renderReplayHtml } from "@openfleet-tools/ui";

const html = renderReplayHtml(buildReplayData({ project: "demo", events, children: [] }));
```

See [docs/design.md](https://github.com/yashicon21/openfleet/blob/main/docs/design.md#replay) for the mapping from events to the world.

## License

MIT. The bundled renderer includes [Three.js](https://threejs.org) (MIT).
