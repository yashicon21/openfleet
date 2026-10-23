import {
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Object3D,
} from "three";
import { rng, type SlotContext, type SlotFactory, type SlotName, type Tick } from "./slots.js";

/** Circumradius of a hex tile whose width (flat to flat) is 1. */
export const HEX_R = 1 / Math.sqrt(3);
export const TILE_H = 0.32;

export const PALETTE = {
  sand: 0xe9d4a4,
  grass: 0x93c47d,
  cliff: 0xa88a64,
  concrete: 0xd8d2c4,
  shell: 0xf4efe4,
  metal: 0x9aa8b2,
  dark: 0x37424c,
  glass: 0x83d6dc,
  warm: 0xffd27a,
  blueprint: 0x58b7ff,
  beacon: 0xff4d3d,
  leaf: 0x4f9a5a,
  crate: 0xc28b4e,
};

export const ROLE_COLOR = {
  coordinator: 0xff9f43,
  planner: 0x4aa3ff,
  implementer: 0xffd23f,
  tester: 0xb07cff,
} as const;

const mats = new Map<string, MeshStandardMaterial>();

function mat(color: number, opts: { emissive?: number; intensity?: number; opacity?: number; metal?: number } = {}) {
  const key = `${color}|${opts.emissive ?? ""}|${opts.intensity ?? ""}|${opts.opacity ?? ""}|${opts.metal ?? ""}`;
  let m = mats.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: 0.82,
      metalness: opts.metal ?? 0.05,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.intensity ?? 1,
      transparent: opts.opacity !== undefined,
      opacity: opts.opacity ?? 1,
    });
    mats.set(key, m);
  }
  return m;
}

/** Window glass glows at night; the scene sets its emissive intensity from the time of day. */
export const windowMaterial = new MeshStandardMaterial({
  color: PALETTE.glass,
  emissive: PALETTE.warm,
  emissiveIntensity: 0,
  flatShading: true,
  roughness: 0.3,
});

function mesh(geo: BufferGeometry, material: MeshStandardMaterial, shadows = true): Mesh {
  const m = new Mesh(geo, material);
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  return m;
}

function at<T extends Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

function tick(o: Object3D, fn: Tick): void {
  o.userData.tick = fn;
}

// --- terrain -------------------------------------------------------------------------------------

function tile(ctx: SlotContext): Object3D {
  const r = rng(ctx.seed);
  const g = new Group();
  const h = TILE_H + r() * 0.08;
  const side = mesh(new CylinderGeometry(HEX_R * 0.98, HEX_R * 0.9, h, 6), mat(PALETTE.cliff));
  side.position.y = h / 2;
  g.add(side);
  const top = mesh(
    new CylinderGeometry(HEX_R * 0.985, HEX_R * 0.985, 0.04, 6),
    mat(r() < 0.5 ? PALETTE.sand : 0xe2cb97),
  );
  top.position.y = h;
  g.add(top);
  g.userData.top = h + 0.02;
  return g;
}

// --- structures ----------------------------------------------------------------------------------

function hub(): Object3D {
  const g = new Group();
  g.add(at(mesh(new CylinderGeometry(0.62, 0.7, 0.18, 8), mat(PALETTE.concrete)), 0, 0.09, 0));
  g.add(at(mesh(new CylinderGeometry(0.42, 0.5, 0.5, 8), mat(PALETTE.shell)), 0, 0.43, 0));
  const band = mesh(new CylinderGeometry(0.425, 0.425, 0.08, 8), windowMaterial);
  g.add(at(band, 0, 0.5, 0));
  g.add(at(mesh(new SphereGeometry(0.38, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(PALETTE.shell)), 0, 0.68, 0));
  // Dish
  const dish = new Group();
  dish.add(mesh(new SphereGeometry(0.22, 10, 5, 0, Math.PI * 2, 0, Math.PI / 3), mat(PALETTE.metal)));
  dish.add(at(mesh(new CylinderGeometry(0.015, 0.015, 0.22, 4), mat(PALETTE.dark)), 0, 0.12, 0));
  dish.rotation.x = Math.PI;
  const mast = new Group();
  mast.add(at(mesh(new CylinderGeometry(0.03, 0.04, 0.3, 5), mat(PALETTE.dark)), 0, 0.15, 0));
  dish.position.y = 0.4;
  dish.rotation.z = Math.PI * 0.75;
  mast.add(dish);
  mast.position.set(0, 1.0, 0);
  g.add(mast);
  // Landing pads for robots
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const pad = mesh(new CylinderGeometry(0.1, 0.1, 0.03, 6), mat(ROLE_COLOR.coordinator));
    g.add(at(pad, Math.cos(a) * 0.55, 0.19, Math.sin(a) * 0.55));
  }
  const light = mesh(
    new OctahedronGeometry(0.06),
    mat(ROLE_COLOR.coordinator, { emissive: ROLE_COLOR.coordinator }),
    false,
  );
  light.position.y = 1.08;
  g.add(light);
  tick(g, (t) => {
    mast.rotation.y = t * 0.4;
    light.scale.setScalar(0.8 + Math.sin(t * 3) * 0.2);
  });
  return g;
}

function tower(): Object3D {
  const g = new Group();
  const body = new Group();
  g.add(at(mesh(new CylinderGeometry(0.4, 0.44, 0.12, 6), mat(PALETTE.concrete)), 0, 0.06, 0));
  const levels = 5;
  for (let i = 0; i < levels; i++) {
    const w = 0.3 - i * 0.03;
    const lvl = new Group();
    lvl.add(at(mesh(new CylinderGeometry(w, w + 0.02, 0.28, 6), mat(PALETTE.shell)), 0, 0.14, 0));
    lvl.add(at(mesh(new CylinderGeometry(w + 0.005, w + 0.005, 0.05, 6), windowMaterial), 0, 0.2, 0));
    lvl.position.y = 0.12 + i * 0.3;
    lvl.userData.level = i;
    body.add(lvl);
  }
  const cap = new Group();
  cap.add(at(mesh(new ConeGeometry(0.17, 0.3, 6), mat(PALETTE.metal)), 0, 0.15, 0));
  const orb = mesh(new IcosahedronGeometry(0.07), mat(PALETTE.warm, { emissive: PALETTE.warm, intensity: 1.5 }), false);
  cap.add(at(orb, 0, 0.4, 0));
  body.add(cap);
  g.add(body);
  /** `progress` 0..1: share of the repo's children merged; `complete`: the run finished. */
  const setProgress = (p: number, complete: boolean) => {
    const shown = Math.max(1, Math.round(1 + p * (levels - 1)));
    body.children.forEach((c) => {
      const lvl = c.userData.level as number | undefined;
      if (lvl !== undefined) c.visible = lvl < shown;
    });
    cap.position.y = 0.12 + shown * 0.3;
    orb.visible = complete || p >= 1;
  };
  g.userData.setProgress = setProgress;
  setProgress(0, false);
  tick(g, (t) => {
    orb.rotation.y = t;
    orb.position.y = 0.4 + Math.sin(t * 2) * 0.03;
  });
  return g;
}

function foundation(ctx: SlotContext): Object3D {
  const r = rng(ctx.seed);
  const g = new Group();
  g.add(at(mesh(new CylinderGeometry(0.34, 0.36, 0.06, 6), mat(PALETTE.concrete)), 0, 0.03, 0));
  // Glowing blueprint lines on the slab
  const bp = mat(PALETTE.blueprint, { emissive: PALETTE.blueprint, intensity: 0.9 });
  const ring = mesh(new TorusGeometry(0.24, 0.01, 4, 6), bp, false);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.065;
  g.add(ring);
  for (let i = 0; i < 3; i++) {
    const line = mesh(new BoxGeometry(0.46, 0.008, 0.012), bp, false);
    line.rotation.y = (i * Math.PI) / 3;
    line.position.y = 0.065;
    g.add(line);
  }
  // Survey posts
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    g.add(
      at(
        mesh(new BoxGeometry(0.03, 0.14 + r() * 0.05, 0.03), mat(PALETTE.crate)),
        Math.cos(a) * 0.3,
        0.1,
        Math.sin(a) * 0.3,
      ),
    );
  }
  // Floating hologram of the planned dome
  const holo = mesh(
    new SphereGeometry(0.22, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
    mat(PALETTE.blueprint, { emissive: PALETTE.blueprint, intensity: 0.6, opacity: 0.28 }),
    false,
  );
  holo.position.y = 0.08;
  g.add(holo);
  tick(g, (t) => {
    holo.rotation.y = t * 0.6;
    holo.position.y = 0.09 + Math.sin(t * 1.5 + ctx.seed) * 0.02;
  });
  return g;
}

function scaffold(ctx: SlotContext): Object3D {
  const r = rng(ctx.seed);
  const g = new Group();
  g.add(at(mesh(new CylinderGeometry(0.34, 0.36, 0.06, 6), mat(PALETTE.concrete)), 0, 0.03, 0));
  // Half-built wall
  g.add(at(mesh(new CylinderGeometry(0.26, 0.26, 0.22, 6, 1, true, 0, Math.PI * 1.3), mat(PALETTE.shell)), 0, 0.17, 0));
  // Scaffold poles and planks
  const pole = mat(PALETTE.warm);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(at(mesh(new BoxGeometry(0.02, 0.5, 0.02), pole), Math.cos(a) * 0.31, 0.3, Math.sin(a) * 0.31));
  }
  for (const y of [0.22, 0.42]) {
    const plank = mesh(new TorusGeometry(0.31, 0.012, 3, 6), mat(PALETTE.crate));
    plank.rotation.x = Math.PI / 2;
    plank.position.y = y;
    g.add(plank);
  }
  // Crane
  const crane = new Group();
  crane.add(at(mesh(new BoxGeometry(0.04, 0.75, 0.04), mat(ROLE_COLOR.implementer)), 0, 0.375, 0));
  const jib = new Group();
  jib.add(at(mesh(new BoxGeometry(0.55, 0.035, 0.035), mat(ROLE_COLOR.implementer)), 0.18, 0, 0));
  jib.add(at(mesh(new BoxGeometry(0.08, 0.06, 0.06), mat(PALETTE.dark)), -0.1, -0.02, 0));
  const hook = mesh(new BoxGeometry(0.05, 0.05, 0.05), mat(PALETTE.crate));
  jib.add(at(hook, 0.38, -0.2, 0));
  jib.position.y = 0.75;
  crane.add(jib);
  crane.position.set(-0.22, 0.06, 0.12);
  g.add(crane);
  const phase = r() * 6;
  tick(g, (t) => {
    jib.rotation.y = Math.sin(t * 0.5 + phase) * 1.2;
    hook.position.y = -0.2 - (Math.sin(t * 1.3 + phase) + 1) * 0.12;
  });
  return g;
}

function dome(complete: boolean): (ctx: SlotContext) => Object3D {
  return (ctx) => {
    const r = rng(ctx.seed);
    const g = new Group();
    g.add(at(mesh(new CylinderGeometry(0.34, 0.36, 0.06, 6), mat(PALETTE.concrete)), 0, 0.03, 0));
    g.add(at(mesh(new CylinderGeometry(0.27, 0.28, 0.2, 6), mat(PALETTE.shell)), 0, 0.16, 0));
    g.add(at(mesh(new CylinderGeometry(0.275, 0.275, 0.05, 6), windowMaterial), 0, 0.18, 0));
    const cap = mesh(
      new SphereGeometry(0.27, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2),
      mat(complete ? PALETTE.shell : 0xe9e4d8),
    );
    cap.position.y = 0.26;
    g.add(cap);
    // Door facing +Z
    g.add(at(mesh(new BoxGeometry(0.09, 0.13, 0.03), mat(PALETTE.dark)), 0, 0.12, 0.255));
    if (complete) {
      const antenna = new Group();
      antenna.add(at(mesh(new CylinderGeometry(0.01, 0.01, 0.25, 4), mat(PALETTE.dark)), 0, 0.125, 0));
      const tip = mesh(new SphereGeometry(0.025, 6, 4), mat(0x5ad19a, { emissive: 0x5ad19a, intensity: 1.2 }), false);
      antenna.add(at(tip, 0, 0.26, 0));
      antenna.position.set(0.08, 0.5, -0.05);
      g.add(antenna);
      // Small solar panel on the side
      const panel = mesh(new BoxGeometry(0.18, 0.015, 0.12), mat(0x2d4f7c, { metal: 0.5 }));
      panel.rotation.x = -0.5;
      g.add(at(panel, -0.25, 0.3, -0.12));
      const seed = r() * 6;
      tick(g, (t) => tip.scale.setScalar(0.8 + 0.3 * Math.max(0, Math.sin(t * 2 + seed))));
    } else {
      // Scanning ring sweeping up and down the dome
      const scan = mesh(
        new TorusGeometry(0.3, 0.012, 4, 18),
        mat(ROLE_COLOR.tester, { emissive: ROLE_COLOR.tester, intensity: 1.4 }),
        false,
      );
      scan.rotation.x = Math.PI / 2;
      g.add(scan);
      const seed = r() * 6;
      tick(g, (t) => {
        const k = (Math.sin(t * 1.6 + seed) + 1) / 2;
        scan.position.y = 0.08 + k * 0.42;
        scan.scale.setScalar(1 - k * k * 0.75);
      });
    }
    return g;
  };
}

function rubble(ctx: SlotContext): Object3D {
  const r = rng(ctx.seed);
  const g = new Group();
  g.add(at(mesh(new CylinderGeometry(0.34, 0.36, 0.04, 6), mat(0xb9b2a3)), 0, 0.02, 0));
  for (let i = 0; i < 9; i++) {
    const s = 0.05 + r() * 0.09;
    const piece = mesh(new BoxGeometry(s, s * 0.6, s * (0.8 + r())), mat(r() < 0.6 ? PALETTE.shell : PALETTE.concrete));
    const a = r() * Math.PI * 2;
    const d = r() * 0.26;
    piece.position.set(Math.cos(a) * d, 0.05 + r() * 0.04, Math.sin(a) * d);
    piece.rotation.set(r() * 1.2, r() * 3, r() * 1.2);
    g.add(piece);
  }
  const pole = mesh(new BoxGeometry(0.02, 0.36, 0.02), mat(PALETTE.warm));
  pole.position.set(0.12, 0.12, -0.05);
  pole.rotation.z = 0.9;
  g.add(pole);
  return g;
}

/** Puffs rising from a point; returned group animates itself. */
function smoke(seed: number, color = 0x6d6d6d, count = 5): Group {
  const r = rng(seed);
  const g = new Group();
  const puffs: { m: Mesh; off: number; dx: number }[] = [];
  for (let i = 0; i < count; i++) {
    const m = mesh(new DodecahedronGeometry(0.06), mat(color, { opacity: 0.55 }), false);
    g.add(m);
    puffs.push({ m, off: i / count, dx: (r() - 0.5) * 0.2 });
  }
  tick(g, (t) => {
    for (const p of puffs) {
      const k = (t * 0.35 + p.off) % 1;
      p.m.position.set(p.dx * k, k * 0.9, p.dx * 0.5 * k);
      p.m.scale.setScalar(0.5 + k * 1.6);
      p.m.visible = k < 0.95;
    }
  });
  return g;
}

function beacon(ctx: SlotContext): Object3D {
  const g = new Group();
  g.add(at(mesh(new CylinderGeometry(0.02, 0.03, 0.5, 5), mat(PALETTE.dark)), 0, 0.25, 0));
  const lamp = mesh(
    new OctahedronGeometry(0.07),
    mat(PALETTE.beacon, { emissive: PALETTE.beacon, intensity: 2 }),
    false,
  );
  lamp.position.y = 0.56;
  g.add(lamp);
  const halo = mesh(
    new SphereGeometry(0.16, 8, 6),
    mat(PALETTE.beacon, { emissive: PALETTE.beacon, opacity: 0.25 }),
    false,
  );
  halo.position.y = 0.56;
  g.add(halo);
  const s = smoke(ctx.seed, 0x55504b, 6);
  s.position.set(0.05, 0.1, 0);
  g.add(s);
  const smokeTick = s.userData.tick as Tick;
  tick(g, (t, night) => {
    const pulse = (Math.sin(t * 6) + 1) / 2;
    lamp.rotation.y = t * 3;
    halo.scale.setScalar(0.7 + pulse * 0.6);
    (halo.material as MeshStandardMaterial).opacity = 0.15 + pulse * 0.25 + night * 0.1;
    smokeTick(t, night);
  });
  return g;
}

// --- robots --------------------------------------------------------------------------------------

function robot(color: number, kind: "coordinator" | "planner" | "implementer" | "tester"): SlotFactory {
  return (ctx) => {
    const r = rng(ctx.seed);
    const g = new Group();
    const rig = new Group();
    const body = mesh(new CylinderGeometry(0.068, 0.075, 0.09, 8), mat(PALETTE.shell));
    body.position.y = 0.11;
    rig.add(body);
    const band = mesh(new CylinderGeometry(0.078, 0.078, 0.035, 8), mat(color));
    band.position.y = 0.1;
    rig.add(band);
    const head = new Group();
    head.add(mesh(new SphereGeometry(0.06, 8, 6), mat(PALETTE.shell)));
    const visor = mesh(new BoxGeometry(0.08, 0.03, 0.03), mat(PALETTE.dark));
    visor.position.set(0, 0.005, 0.048);
    head.add(visor);
    const eye = mesh(new SphereGeometry(0.012, 6, 4), mat(color, { emissive: color, intensity: 2 }), false);
    eye.position.set(0, 0.006, 0.065);
    head.add(eye);
    head.position.y = 0.23;
    rig.add(head);
    // Role tool
    if (kind === "planner") {
      const pad = mesh(
        new BoxGeometry(0.06, 0.08, 0.01),
        mat(PALETTE.blueprint, { emissive: PALETTE.blueprint, intensity: 0.8 }),
      );
      pad.position.set(0.08, 0.12, 0.05);
      pad.rotation.y = -0.5;
      rig.add(pad);
    } else if (kind === "implementer") {
      const wrench = mesh(new BoxGeometry(0.02, 0.1, 0.02), mat(PALETTE.metal, { metal: 0.6 }));
      wrench.position.set(0.09, 0.1, 0.03);
      wrench.rotation.z = 0.6;
      rig.add(wrench);
    } else if (kind === "tester") {
      const lens = mesh(new TorusGeometry(0.025, 0.007, 4, 10), mat(color, { emissive: color }));
      lens.position.set(0.09, 0.14, 0.04);
      rig.add(lens);
    } else {
      const ant = mesh(new ConeGeometry(0.015, 0.08, 4), mat(color, { emissive: color }));
      ant.position.set(0, 0.31, 0);
      rig.add(ant);
    }
    // Hover thruster
    const glow = mesh(
      new ConeGeometry(0.05, 0.08, 6),
      mat(0x9fe8ff, { emissive: 0x9fe8ff, intensity: 1.5, opacity: 0.7 }),
      false,
    );
    glow.rotation.x = Math.PI;
    glow.position.y = 0.0;
    rig.add(glow);
    g.add(rig);
    const seed = r() * 10;
    g.userData.rig = { rig, head, glow, eye };
    /** Code-driven motion: `mode` is set by the scene (`walk` while flying, `work` at a site, `idle`). */
    g.userData.mode = "idle";
    tick(g, (t) => {
      const mode = g.userData.mode as string;
      const speed = mode === "walk" ? 9 : mode === "work" ? 5 : 2.5;
      rig.position.y = 0.04 + Math.sin(t * speed * 0.5 + seed) * 0.025;
      rig.rotation.x = mode === "walk" ? 0.25 : 0;
      head.rotation.y = mode === "work" ? Math.sin(t * 2.2 + seed) * 0.6 : Math.sin(t * 0.7 + seed) * 0.3;
      head.rotation.x = mode === "work" ? 0.35 : 0;
      glow.scale.y = 0.8 + Math.sin(t * 20 + seed) * 0.2;
    });
    return g;
  };
}

// --- props ---------------------------------------------------------------------------------------

function solar(ctx: SlotContext): Object3D {
  const r = rng(ctx.seed);
  const g = new Group();
  for (let i = 0; i < 2; i++) {
    const p = new Group();
    p.add(at(mesh(new BoxGeometry(0.02, 0.12, 0.02), mat(PALETTE.dark)), 0, 0.06, 0));
    const panel = mesh(new BoxGeometry(0.22, 0.012, 0.14), mat(0x2d4f7c, { metal: 0.5 }));
    panel.rotation.x = -0.55;
    panel.position.y = 0.13;
    p.add(panel);
    p.position.set((i - 0.5) * 0.26, 0, (r() - 0.5) * 0.1);
    g.add(p);
  }
  g.rotation.y = r() * Math.PI;
  return g;
}

function crates(ctx: SlotContext): Object3D {
  const r = rng(ctx.seed);
  const g = new Group();
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const s = 0.08 + r() * 0.05;
    const c = mesh(new BoxGeometry(s, s, s), mat(r() < 0.7 ? PALETTE.crate : ROLE_COLOR.coordinator));
    c.position.set((r() - 0.5) * 0.3, s / 2 + (i > 2 ? 0.1 : 0), (r() - 0.5) * 0.3);
    c.rotation.y = r() * 1.5;
    g.add(c);
  }
  return g;
}

function rocks(ctx: SlotContext): Object3D {
  const r = rng(ctx.seed);
  const g = new Group();
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const s = 0.05 + r() * 0.1;
    const m = mesh(new DodecahedronGeometry(s, 0), mat(r() < 0.5 ? 0x9a8b78 : 0x857664));
    m.position.set((r() - 0.5) * 0.4, s * 0.5, (r() - 0.5) * 0.4);
    m.scale.y = 0.6 + r() * 0.4;
    m.rotation.set(r(), r() * 3, r());
    g.add(m);
  }
  return g;
}

function plant(ctx: SlotContext): Object3D {
  const r = rng(ctx.seed);
  const g = new Group();
  if (r() < 0.5) {
    // Palm
    const h = 0.35 + r() * 0.2;
    const trunk = mesh(new CylinderGeometry(0.02, 0.03, h, 5), mat(0x8a6a44));
    trunk.position.y = h / 2;
    trunk.rotation.z = (r() - 0.5) * 0.3;
    g.add(trunk);
    for (let i = 0; i < 5; i++) {
      const leaf = mesh(new ConeGeometry(0.04, 0.24, 3), mat(PALETTE.leaf));
      const a = (i / 5) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 0.09, h, Math.sin(a) * 0.09);
      leaf.rotation.set(Math.sin(a) * 1.6, 0, -Math.cos(a) * 1.6);
      g.add(leaf);
    }
  } else {
    // Shrubs
    for (let i = 0; i < 3; i++) {
      const s = 0.06 + r() * 0.06;
      const b = mesh(new IcosahedronGeometry(s, 0), mat(r() < 0.5 ? PALETTE.grass : PALETTE.leaf));
      b.position.set((r() - 0.5) * 0.25, s * 0.8, (r() - 0.5) * 0.25);
      g.add(b);
    }
  }
  return g;
}

function antenna(ctx: SlotContext): Object3D {
  const r = rng(ctx.seed);
  const g = new Group();
  const h = 0.5 + r() * 0.2;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = mesh(new BoxGeometry(0.015, h, 0.015), mat(PALETTE.metal));
    leg.position.set(Math.cos(a) * 0.05, h / 2, Math.sin(a) * 0.05);
    leg.rotation.set(Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08);
    g.add(leg);
  }
  const tip = mesh(
    new SphereGeometry(0.025, 6, 4),
    mat(PALETTE.beacon, { emissive: PALETTE.beacon, intensity: 1.5 }),
    false,
  );
  tip.position.y = h + 0.02;
  g.add(tip);
  const seed = r() * 5;
  tick(g, (t) => (tip.visible = Math.sin(t * 2.5 + seed) > -0.2));
  return g;
}

/** A soft circular shadow-catcher used under hovering robots. */
export function blobShadow(): Mesh {
  const m = new Mesh(new CircleGeometry(0.07, 10), mat(0x000000, { opacity: 0.22 }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

export const PROCEDURAL: Record<SlotName, SlotFactory> = {
  tile,
  hub,
  "tower.integration": tower,
  "building.planning": foundation,
  "building.implementing": scaffold,
  "building.testing": dome(false),
  "building.merged": dome(true),
  rubble,
  "beacon.failed": beacon,
  "robot.coordinator": robot(ROLE_COLOR.coordinator, "coordinator"),
  "robot.planner": robot(ROLE_COLOR.planner, "planner"),
  "robot.implementer": robot(ROLE_COLOR.implementer, "implementer"),
  "robot.tester": robot(ROLE_COLOR.tester, "tester"),
  "prop.solar": solar,
  "prop.crates": crates,
  "prop.rocks": rocks,
  "prop.plant": plant,
  "prop.antenna": antenna,
};

export { smoke };
