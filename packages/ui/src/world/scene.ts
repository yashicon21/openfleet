import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Fog,
  Group,
  AdditiveBlending,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PCFSoftShadowMap,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Raycaster,
  RingGeometry,
  Scene,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { AgentRole, ChildView, WorldState } from "../model/types.js";
import type { IslandLayout, TileSpot, WorldLayout } from "./layout.js";
import { blobShadow, PALETTE, smoke, windowMaterial } from "./procedural.js";
import { hash, type SlotName, type SlotRegistry, type Tick } from "./slots.js";

const STAGE_SLOT: Record<ChildView["stage"], SlotName | undefined> = {
  plot: undefined,
  foundation: "building.planning",
  scaffold: "building.implementing",
  testing: "building.testing",
  finished: "building.merged",
  rubble: "rubble",
};

const ROBOT_SLOT: Record<AgentRole, SlotName> = {
  coordinator: "robot.coordinator",
  planner: "robot.planner",
  implementer: "robot.implementer",
  tester: "robot.tester",
};

interface Site {
  childId: string;
  group: Group;
  top: number;
  world: Vector3;
  building?: Object3D;
  slot?: SlotName | "plot" | "tower";
  ghost?: Object3D;
  beacon?: Object3D;
}

interface Robot {
  obj: Object3D;
  shadow: Mesh;
  child: string;
  phase: "fly" | "work" | "leave";
  from: Vector3;
  to: Vector3;
  t0: number;
  dur: number;
  angle: number;
}

/** A short-lived effect; returns false when finished. */
type Fx = (dt: number) => boolean;

const easeOutBack = (k: number) => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

// Matches the website palette: near-black night, its blues for sky and sea, a pink dawn.
const SKY = {
  night: new Color(0x0e0e10),
  dawn: new Color(0xee8fcf),
  day: new Color(0x8cc4f0),
  seaNight: new Color(0x0c1a46),
  seaDay: new Color(0x2a86d6),
};

const FOAM_PER_ISLAND = 3;
const FOAM_PERIOD = 4.5;
const SPARKLES = 260;

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface WorldViewOptions {
  container: HTMLElement;
  layout: WorldLayout;
  slots: SlotRegistry;
}

/** Owns the Three.js scene and maps world states onto it. Pure state stays in the reducer. */
export class WorldView {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: OrthographicCamera;
  readonly controls: OrbitControls;
  private sun = new DirectionalLight(0xffffff, 2);
  private moon = new DirectionalLight(0x8fa8ff, 0.3);
  private hemi = new HemisphereLight(0xdff3ff, 0x8a6f4c, 0.6);
  private ambient = new AmbientLight(0xffffff, 0.15);
  private sea: Mesh<PlaneGeometry, MeshStandardMaterial>;
  private stars: Points<BufferGeometry, PointsMaterial>;
  private sparkles: Points<BufferGeometry, PointsMaterial>;
  private foam: { ring: Mesh<RingGeometry, MeshBasicMaterial>; island: Group; radius: number; phase: number }[] = [];
  private foamMaterial = new MeshBasicMaterial({ color: 0xf4f4f6, transparent: true, depthWrite: false });
  private calm = reducedMotion();
  private sites = new Map<string, Site>();
  private islands = new Map<string, { group: Group; layout: IslandLayout; shown: boolean }>();
  private hubPos = new Vector3();
  private robots = new Map<string, Robot>();
  private fx: Fx[] = [];
  private tickers: Object3D[] = [];
  private clock = 0;
  private daylight = 1;
  private targetDaylight = 1;
  private selection: Mesh;
  private selected?: string;
  private raycaster = new Raycaster();
  private center = new Vector3();
  private focusAnim?: { from: Vector3; to: Vector3; z0: number; z1: number; t: number };
  private extent: number;
  onFrame?: (dt: number) => void;

  constructor(private opts: WorldViewOptions) {
    const { container, layout } = opts;
    this.extent = layout.extent;
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.camera = new OrthographicCamera(-1, 1, 1, -1, -200, 400);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = 1.2;
    this.controls.minZoom = 0.5;
    this.controls.maxZoom = 6;
    this.controls.screenSpacePanning = true;

    this.scene.background = SKY.day.clone();
    this.scene.fog = new Fog(SKY.day.clone(), 60, 160);
    this.setupLights();
    this.sea = this.makeSea();
    this.stars = this.makeStars();
    this.sparkles = this.makeSparkles();
    this.selection = new Mesh(
      new TorusGeometry(0.5, 0.025, 4, 6),
      new MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8 }),
    );
    this.selection.rotation.x = Math.PI / 2;
    this.selection.rotation.z = Math.PI / 6;
    this.selection.visible = false;
    this.scene.add(this.selection);

    this.buildIsland(layout.hub, true);
    for (const isl of layout.islands) this.buildIsland(isl, false);
    const pts = [new Vector3(), ...layout.islands.map((i) => new Vector3(i.x, 0, i.z))];
    pts.forEach((p) => this.center.add(p));
    this.center.divideScalar(pts.length);
    this.resetCamera();

    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  // --- setup -------------------------------------------------------------------------------------

  private setupLights(): void {
    const s = this.sun;
    s.castShadow = true;
    s.shadow.mapSize.set(2048, 2048);
    const e = this.extent + 4;
    Object.assign(s.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 1, far: 200 });
    s.shadow.bias = -0.0005;
    s.shadow.normalBias = 0.02;
    this.scene.add(s, s.target, this.moon, this.hemi, this.ambient);
    this.moon.position.set(-20, 30, -10);
  }

  private makeSea(): Mesh<PlaneGeometry, MeshStandardMaterial> {
    const size = this.extent * 8 + 60;
    const geo = new PlaneGeometry(size, size, 72, 72).toNonIndexed() as unknown as PlaneGeometry;
    const shade = new Float32Array((geo.getAttribute("position") as BufferAttribute).count * 3).fill(1);
    geo.setAttribute("color", new BufferAttribute(shade, 3));
    const material = new MeshStandardMaterial({
      color: SKY.seaDay.clone(),
      vertexColors: true,
      flatShading: true,
      roughness: 0.35,
      metalness: 0.1,
      transparent: true,
      opacity: 0.94,
    });
    const sea = new Mesh(geo, material);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = 0.12;
    sea.receiveShadow = true;
    geo.userData.base = Float32Array.from((geo.getAttribute("position") as BufferAttribute).array);
    this.scene.add(sea);
    return sea;
  }

  /** Glints on the water: additive points whose colour (and so brightness) twinkles per frame. */
  private makeSparkles(): Points<BufferGeometry, PointsMaterial> {
    const pos = new Float32Array(SPARKLES * 3);
    const span = this.extent * 2 + 8;
    for (let i = 0; i < SPARKLES; i++) {
      pos.set([(Math.random() - 0.5) * span * 2, 0.26, (Math.random() - 0.5) * span * 2], i * 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("color", new BufferAttribute(new Float32Array(SPARKLES * 3), 3));
    geo.userData.seed = Float32Array.from({ length: SPARKLES }, () => Math.random() * 100);
    const pts = new Points(
      geo,
      new PointsMaterial({
        size: 3,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    pts.visible = !this.calm;
    pts.renderOrder = 2;
    this.scene.add(pts);
    return pts;
  }

  /** Hexagonal surf rings that roll out from an island's shore. */
  private addFoam(island: Group, radius: number): void {
    for (let k = 0; k < FOAM_PER_ISLAND; k++) {
      const ring = new Mesh(new RingGeometry(1, 1.06, 6), this.foamMaterial.clone());
      ring.rotation.x = -Math.PI / 2;
      ring.rotation.z = Math.PI / 6;
      ring.position.set(island.position.x, 0.25, island.position.z);
      ring.visible = false;
      ring.renderOrder = 1; // after the transparent sea, which would otherwise paint over it
      this.scene.add(ring);
      this.foam.push({ ring, island, radius, phase: k / FOAM_PER_ISLAND });
    }
  }

  private makeStars(): Points<BufferGeometry, PointsMaterial> {
    const n = 600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = 0.15 + Math.random() * 1.3;
      const r = 150;
      pos.set([Math.cos(a) * Math.cos(el) * r, Math.sin(el) * r, Math.sin(a) * Math.cos(el) * r], i * 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    const pts = new Points(
      geo,
      new PointsMaterial({
        color: 0xffffff,
        size: 1.6,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0,
        fog: false,
      }),
    );
    this.scene.add(pts);
    return pts;
  }

  private create(slot: SlotName, seed: number): Object3D {
    const o = this.opts.slots.create(slot, { seed });
    o.traverse((c) => {
      if (c.userData.tick) this.tickers.push(c);
    });
    return o;
  }

  private dispose(o: Object3D): void {
    o.removeFromParent();
    const gone = new Set<Object3D>();
    o.traverse((c) => gone.add(c));
    this.tickers = this.tickers.filter((t) => !gone.has(t));
  }

  private buildIsland(layout: IslandLayout, isHub: boolean): void {
    const group = new Group();
    group.position.set(layout.x, 0, layout.z);
    for (const spot of layout.tiles) this.buildTile(group, layout, spot, isHub && spot.x === 0 && spot.z === 0);
    this.scene.add(group);
    if (isHub) {
      this.hubPos.set(layout.x, 0.8, layout.z);
    } else {
      group.visible = false;
      group.position.y = -1.5;
    }
    this.islands.set(isHub ? "" : layout.repo, { group, layout, shown: isHub });
    this.addFoam(group, layout.radius);
  }

  private buildTile(island: Group, layout: IslandLayout, spot: TileSpot, hub: boolean): void {
    const site = new Group();
    site.position.set(spot.x, 0, spot.z);
    const tile = this.create("tile", spot.seed);
    site.add(tile);
    const top = (tile.userData.top as number | undefined) ?? 0.34;
    if (hub) {
      const h = this.create("hub", spot.seed);
      h.position.y = top;
      site.add(h);
    }
    if (spot.prop) {
      const p = this.create(spot.prop, spot.seed);
      p.position.set(0, top, 0);
      p.rotation.y = (spot.seed % 628) / 100;
      site.add(p);
    }
    island.add(site);
    if (spot.child) {
      site.userData.childId = spot.child;
      const world = new Vector3(layout.x + spot.x, top, layout.z + spot.z);
      const s: Site = { childId: spot.child, group: site, top, world };
      this.sites.set(spot.child, s);
      if (spot.child === layout.integration) this.setBuilding(s, "tower", true);
    }
  }

  // --- camera ------------------------------------------------------------------------------------

  resetCamera(): void {
    this.controls.target.copy(this.center);
    this.camera.position.copy(this.center).add(new Vector3(1, 0.9, 1).normalize().multiplyScalar(80));
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  focus(childId: string): void {
    const s = this.sites.get(childId);
    if (!s) return;
    this.focusAnim = {
      from: this.controls.target.clone(),
      to: s.world.clone(),
      z0: this.camera.zoom,
      z1: Math.max(this.camera.zoom, 2.4),
      t: 0,
    };
  }

  private resize(): void {
    const w = this.opts.container.clientWidth || window.innerWidth;
    const h = this.opts.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    const half = this.extent * 0.8;
    const vh = aspect > 1 ? half : half / aspect;
    this.camera.left = -vh * aspect;
    this.camera.right = vh * aspect;
    this.camera.top = vh;
    this.camera.bottom = -vh;
    this.camera.updateProjectionMatrix();
  }

  /** Screen position (CSS px) of a world point, or undefined when behind the camera. */
  project(p: Vector3): { x: number; y: number } | undefined {
    const v = p.clone().project(this.camera);
    if (v.z > 1) return undefined;
    const el = this.renderer.domElement;
    return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight };
  }

  islandLabelPoints(): { repo: string; point: Vector3; shown: boolean }[] {
    return [...this.islands.entries()]
      .filter(([repo]) => repo)
      .map(([repo, i]) => ({
        repo,
        point: new Vector3(i.layout.x, 0.4, i.layout.z + i.layout.radius * 0.95),
        shown: i.shown,
      }));
  }

  /** Child under a canvas point (CSS px relative to the canvas). */
  pick(x: number, y: number): string | undefined {
    const el = this.renderer.domElement;
    const ndc = new Vector2((x / el.clientWidth) * 2 - 1, -(y / el.clientHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const targets = [...this.sites.values()].filter((s) => s.group.parent?.visible).map((s) => s.group);
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    let o: Object3D | null = hit?.object ?? null;
    while (o && !o.userData.childId) o = o.parent;
    return o?.userData.childId as string | undefined;
  }

  select(childId: string | undefined): void {
    this.selected = childId;
    const s = childId ? this.sites.get(childId) : undefined;
    this.selection.visible = !!s;
    if (s) this.selection.position.set(s.world.x, s.top + 0.03, s.world.z);
  }

  // --- time of day -------------------------------------------------------------------------------

  /** `hour` 0–24 local time; `paused` forces night (a pause in the run). */
  setClock(hour: number, paused: boolean): void {
    const elev = Math.sin(((hour - 6) / 12) * Math.PI);
    this.targetDaylight = paused ? 0 : smooth(-0.12, 0.3, elev);
    const az = ((hour - 6) / 12) * Math.PI;
    const d = this.extent + 20;
    this.sun.position.set(this.center.x + Math.cos(az) * d, Math.max(4, Math.abs(elev) * d), this.center.z - d * 0.5);
    this.sun.target.position.copy(this.center);
    const dawn = 1 - Math.min(1, Math.abs(elev) / 0.35);
    this.sun.color.setRGB(1, 0.85 + 0.15 * (1 - dawn), 0.7 + 0.3 * (1 - dawn));
    this.dawnAmount = paused ? 0 : dawn * (elev > -0.2 ? 1 : 0);
  }
  private dawnAmount = 0;

  private applyDaylight(): void {
    const d = this.daylight;
    const sky = SKY.night
      .clone()
      .lerp(SKY.day, d)
      .lerp(SKY.dawn, this.dawnAmount * 0.45 * (0.3 + d));
    (this.scene.background as Color).copy(sky);
    (this.scene.fog as Fog).color.copy(sky);
    this.sun.intensity = 0.15 + 2.4 * d;
    this.moon.intensity = 0.45 * (1 - d);
    this.hemi.intensity = 0.25 + 0.55 * d;
    this.ambient.intensity = 0.12 + 0.1 * (1 - d);
    this.sea.material.color.copy(SKY.seaNight).lerp(SKY.seaDay, d);
    this.foamMaterial.opacity = 0.35 + 0.4 * d;
    this.stars.material.opacity = Math.max(0, 1 - d * 1.6);
    windowMaterial.emissiveIntensity = (1 - d) * 1.6;
  }

  // --- state sync --------------------------------------------------------------------------------

  sync(state: WorldState, instant: boolean): void {
    for (const repo of Object.keys(state.repos)) this.showIsland(repo, instant);
    for (const c of Object.values(state.children)) {
      const s = this.sites.get(c.id);
      if (!s) continue;
      if (c.integration) {
        const repo = state.repos[c.repo];
        const members = (repo?.children ?? []).filter((id) => id !== c.id).map((id) => state.children[id]);
        const merged = members.filter((m) => m?.merged || m?.phase === "done").length;
        const p = members.length ? merged / members.length : 0;
        const set = s.building?.userData.setProgress as ((p: number, done: boolean) => void) | undefined;
        set?.(p, state.done);
      } else {
        this.setBuilding(s, STAGE_SLOT[c.stage] ?? "plot", instant);
      }
      this.setBeacon(s, !!c.alarm, instant);
    }
    // Hide buildings of children not yet in the state (scrubbing backwards).
    for (const s of this.sites.values()) {
      if (!state.children[s.childId] && s.slot !== "tower" && s.slot !== undefined) {
        if (s.building) this.dispose(s.building);
        if (s.ghost) this.dispose(s.ghost);
        if (s.beacon) this.dispose(s.beacon);
        s.building = s.ghost = s.beacon = undefined;
        s.slot = undefined;
      }
    }
    for (const [repo, isl] of this.islands) {
      if (repo && isl.shown && !state.repos[repo]) {
        isl.shown = false;
        isl.group.visible = false;
        isl.group.position.y = -1.5;
      }
    }
    this.syncRobots(state, instant);
  }

  private showIsland(repo: string, instant: boolean): void {
    const isl = this.islands.get(repo);
    if (!isl || isl.shown) return;
    isl.shown = true;
    isl.group.visible = true;
    if (instant) {
      isl.group.position.y = 0;
      return;
    }
    let t = 0;
    this.fx.push((dt) => {
      t += dt / 1.4;
      isl.group.position.y = -1.5 * (1 - easeOutBack(Math.min(1, t)));
      return t < 1;
    });
  }

  private setBuilding(s: Site, slot: SlotName | "plot" | "tower", instant: boolean): void {
    if (s.slot === slot) return;
    const prev = s.building;
    s.slot = slot;
    if (s.ghost) {
      this.dispose(s.ghost);
      s.ghost = undefined;
    }
    if (slot === "plot") {
      s.building = undefined;
      s.ghost = this.makeGhost();
      s.ghost.position.y = s.top;
      s.group.add(s.ghost);
    } else {
      const o = this.create(slot === "tower" ? "tower.integration" : slot, hash(s.childId));
      o.position.y = s.top;
      s.group.add(o);
      s.building = o;
      if (!instant) {
        o.scale.setScalar(0.01);
        let t = 0;
        this.fx.push((dt) => {
          t += dt / 0.7;
          o.scale.setScalar(Math.max(0.01, easeOutBack(Math.min(1, t))));
          return t < 1;
        });
        this.puff(s, slot === "rubble" ? 0x8c7f70 : 0xe8dcc4);
      }
    }
    if (prev) {
      if (instant) {
        this.dispose(prev);
      } else if (slot === "rubble") {
        // Knock the old building over before it disappears.
        let t = 0;
        this.fx.push((dt) => {
          t += dt / 0.5;
          prev.rotation.z = t * 1.2;
          prev.position.y = s.top - t * 0.4;
          if (t >= 1) this.dispose(prev);
          return t < 1;
        });
      } else {
        let t = 0;
        this.fx.push((dt) => {
          t += dt / 0.25;
          prev.scale.setScalar(Math.max(0.01, 1 - t));
          if (t >= 1) this.dispose(prev);
          return t < 1;
        });
      }
    }
  }

  private makeGhost(): Object3D {
    const ring = new Mesh(
      new TorusGeometry(0.3, 0.012, 3, 6),
      new MeshStandardMaterial({
        color: PALETTE.blueprint,
        emissive: PALETTE.blueprint,
        emissiveIntensity: 0.7,
        transparent: true,
        opacity: 0.7,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.rotation.z = Math.PI / 6;
    ring.position.y = 0.02;
    const g = new Group();
    g.add(ring);
    const tick: Tick = (t) => {
      ring.material.opacity = 0.35 + 0.35 * (Math.sin(t * 2) + 1) * 0.5;
    };
    g.userData.tick = tick;
    this.tickers.push(g);
    return g;
  }

  private setBeacon(s: Site, on: boolean, instant: boolean): void {
    if (on && !s.beacon) {
      s.beacon = this.create("beacon.failed", hash(s.childId) + 7);
      s.beacon.position.set(0.28, s.top, -0.18);
      s.group.add(s.beacon);
      if (!instant) this.puff(s, 0x6a5a50);
    } else if (!on && s.beacon) {
      this.dispose(s.beacon);
      s.beacon = undefined;
    }
  }

  private puff(s: Site, color: number): void {
    const p = smoke(hash(s.childId) ^ (this.clock * 1000), color, 7);
    p.position.y = s.top;
    p.scale.set(2.2, 0.7, 2.2);
    s.group.add(p);
    const tickFn = p.userData.tick as Tick;
    let t = 0;
    this.fx.push((dt) => {
      t += dt;
      tickFn(t * 1.4, 0);
      if (t >= 1.3) p.removeFromParent();
      return t < 1.3;
    });
  }

  // --- robots ------------------------------------------------------------------------------------

  private robotHome(child: string, i: number): Vector3 {
    const s = this.sites.get(child);
    if (!s) return this.hubPos.clone();
    const a = (hash(child) % 628) / 100 + i * 1.7;
    return new Vector3(s.world.x + Math.cos(a) * 0.42, s.top + 0.3, s.world.z + Math.sin(a) * 0.42);
  }

  private launchPoint(): Vector3 {
    const a = Math.random() * Math.PI * 2;
    return this.hubPos.clone().add(new Vector3(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55));
  }

  private syncRobots(state: WorldState, instant: boolean): void {
    for (const a of Object.values(state.agents)) {
      if (this.robots.has(a.id)) continue;
      if (!this.sites.has(a.child)) continue;
      const obj = this.create(ROBOT_SLOT[a.role], hash(a.id));
      const shadow = blobShadow();
      this.scene.add(obj, shadow);
      const to = this.robotHome(a.child, [...this.robots.values()].filter((r) => r.child === a.child).length);
      const from = instant ? to.clone() : this.launchPoint();
      obj.position.copy(from);
      this.robots.set(a.id, {
        obj,
        shadow,
        child: a.child,
        phase: instant ? "work" : "fly",
        from,
        to,
        t0: this.clock,
        dur: 1.2 + from.distanceTo(to) * 0.08,
        angle: Math.atan2(
          to.z - (this.sites.get(a.child)?.world.z ?? 0),
          to.x - (this.sites.get(a.child)?.world.x ?? 0),
        ),
      });
    }
    for (const [id, r] of this.robots) {
      if (state.agents[id]) continue;
      if (instant) {
        this.dispose(r.obj);
        r.shadow.removeFromParent();
        this.robots.delete(id);
      } else if (r.phase !== "leave") {
        r.phase = "leave";
        r.from = r.obj.position.clone();
        r.to = this.launchPoint();
        r.t0 = this.clock;
        r.dur = 1.0 + r.from.distanceTo(r.to) * 0.06;
      }
    }
  }

  private updateRobots(): void {
    for (const [id, r] of this.robots) {
      const o = r.obj;
      if (r.phase === "work") {
        const s = this.sites.get(r.child);
        if (s) {
          r.angle += 0.004;
          const target = new Vector3(
            s.world.x + Math.cos(r.angle) * 0.42,
            s.top + 0.28,
            s.world.z + Math.sin(r.angle) * 0.42,
          );
          o.position.lerp(target, 0.05);
          o.lookAt(s.world.x, o.position.y, s.world.z);
        }
        o.userData.mode = "work";
      } else {
        const k = Math.min(1, (this.clock - r.t0) / r.dur);
        const e = k * k * (3 - 2 * k);
        const p = r.from.clone().lerp(r.to, e);
        p.y += Math.sin(Math.PI * e) * (0.8 + r.from.distanceTo(r.to) * 0.12);
        const look = p.clone().add(r.to.clone().sub(r.from).setY(0));
        o.position.copy(p);
        o.lookAt(look.x, p.y, look.z);
        o.userData.mode = "walk";
        if (k >= 1) {
          if (r.phase === "fly") r.phase = "work";
          else {
            this.dispose(o);
            r.shadow.removeFromParent();
            this.robots.delete(id);
            continue;
          }
        }
      }
      r.shadow.position.set(o.position.x, Math.max(0.13, this.groundAt(o.position)), o.position.z);
      const h = o.position.y - r.shadow.position.y;
      r.shadow.scale.setScalar(Math.max(0.4, 1.2 - h * 0.4));
    }
  }

  private groundAt(p: Vector3): number {
    for (const s of this.sites.values()) {
      if (Math.hypot(p.x - s.world.x, p.z - s.world.z) < 0.5) return s.top + 0.01;
    }
    return 0.13;
  }

  // --- loop --------------------------------------------------------------------------------------

  start(): void {
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private frame(dt: number): void {
    this.clock += dt;
    this.onFrame?.(dt);
    this.daylight += (this.targetDaylight - this.daylight) * Math.min(1, dt * 2.5);
    this.applyDaylight();
    const night = 1 - this.daylight;
    for (const o of this.tickers) (o.userData.tick as Tick)(this.clock, night);
    this.fx = this.fx.filter((f) => f(dt));
    this.updateRobots();
    this.animateSea();
    if (this.selected)
      this.selection.position.y = (this.sites.get(this.selected)?.top ?? 0.3) + 0.03 + Math.sin(this.clock * 3) * 0.015;
    if (this.focusAnim) {
      const f = this.focusAnim;
      f.t = Math.min(1, f.t + dt / 0.6);
      const e = f.t * f.t * (3 - 2 * f.t);
      const next = f.from.clone().lerp(f.to, e);
      this.camera.position.add(next.clone().sub(this.controls.target));
      this.controls.target.copy(next);
      this.camera.zoom = f.z0 + (f.z1 - f.z0) * e;
      this.camera.updateProjectionMatrix();
      if (f.t >= 1) this.focusAnim = undefined;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private animateSea(): void {
    const geo = this.sea.geometry;
    const pos = geo.getAttribute("position") as BufferAttribute;
    const shade = geo.getAttribute("color") as BufferAttribute;
    const base = geo.userData.base as Float32Array;
    const t = this.calm ? 0 : this.clock;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3]!;
      const y = base[i * 3 + 1]!;
      // Two crossing swells plus a short chop; crests are lightened so the motion reads from far away.
      const h =
        Math.sin(x * 0.42 + y * 0.18 + t * 1.1) * 0.5 +
        Math.cos(y * 0.36 - x * 0.12 + t * 0.8) * 0.35 +
        Math.sin((x + y) * 1.3 + t * 2.2) * 0.15;
      pos.setZ(i, h * 0.11);
      const k = 0.82 + 0.38 * Math.max(0, h);
      shade.setXYZ(i, k, k, k);
    }
    pos.needsUpdate = true;
    shade.needsUpdate = true;

    for (const f of this.foam) {
      f.ring.visible = f.island.visible && f.island.position.y > -0.2;
      if (!f.ring.visible) continue;
      const k = this.calm ? f.phase : (this.clock / FOAM_PERIOD + f.phase) % 1;
      const r = f.radius * 0.93 + k * 1.1;
      f.ring.scale.set(r, r, 1);
      f.ring.material.opacity =
        this.foamMaterial.opacity * (this.calm ? 0.6 : Math.sin(Math.PI * Math.min(1, k * 1.4)));
    }

    if (this.calm) return;
    const glint = 0.35 + 0.65 * this.daylight;
    const col = this.sparkles.geometry.getAttribute("color") as BufferAttribute;
    const seed = this.sparkles.geometry.userData.seed as Float32Array;
    for (let i = 0; i < SPARKLES; i++) {
      const s = seed[i]!;
      const v = Math.max(0, Math.sin(this.clock * (1.5 + (s % 1.7)) + s)) ** 12 * glint;
      col.setXYZ(i, v, v, v * 0.95);
    }
    col.needsUpdate = true;
  }
}
