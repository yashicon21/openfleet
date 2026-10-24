import { rng, hash } from "./slots.js";

/** Pointy-top hex grid with tile width 1 (flat side to flat side). */
export function hexToXZ(q: number, r: number): { x: number; z: number } {
  return { x: q + r / 2, z: r * (Math.sqrt(3) / 2) };
}

const DIRS: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];

/** Hex coordinates in spiral order: the centre, then ring 1, ring 2, ... */
export function spiral(count: number): { q: number; r: number; ring: number }[] {
  const out = [{ q: 0, r: 0, ring: 0 }];
  for (let ring = 1; out.length < count; ring++) {
    let q = DIRS[4]![0] * ring;
    let r = DIRS[4]![1] * ring;
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < ring; step++) {
        out.push({ q, r, ring });
        q += DIRS[side]![0];
        r += DIRS[side]![1];
      }
    }
  }
  return out.slice(0, count);
}

export type Prop = "prop.solar" | "prop.crates" | "prop.rocks" | "prop.plant" | "prop.antenna";

export interface TileSpot {
  x: number;
  z: number;
  /** Child id built on this tile. */
  child?: string;
  prop?: Prop;
  seed: number;
}

export interface IslandLayout {
  repo: string;
  x: number;
  z: number;
  radius: number;
  tiles: TileSpot[];
  /** Integration child on the centre tile (shown as the tower). */
  integration?: string;
}

export interface WorldLayout {
  hub: IslandLayout;
  islands: IslandLayout[];
  /** Radius of everything, for camera framing. */
  extent: number;
}

export interface RepoInput {
  id: string;
  /** Children in display order. */
  children: { id: string; integration: boolean }[];
}

const PROPS: Prop[] = [
  "prop.plant",
  "prop.rocks",
  "prop.plant",
  "prop.crates",
  "prop.solar",
  "prop.rocks",
  "prop.antenna",
];

function ringsFor(sites: number): number {
  let n = 1;
  let ring = 0;
  while (n < sites) {
    ring++;
    n += 6 * ring;
  }
  return ring;
}

function island(repo: string, members: { id: string; integration: boolean }[]): IslandLayout {
  const integ = members.find((m) => m.integration);
  const units = members.filter((m) => !m.integration);
  const centre = integ?.id ?? (units.length === 1 ? units[0]!.id : undefined);
  const others = units.filter((u) => u.id !== centre);
  const siteRings = ringsFor(1 + others.length);
  const rings = siteRings + 1;
  const total = 1 + 3 * rings * (rings + 1);
  const rand = rng(hash(repo));
  const spots = spiral(total);
  const tiles: TileSpot[] = [];
  spots.forEach((h, i) => {
    const { x, z } = hexToXZ(h.q, h.r);
    const seed = hash(`${repo}:${h.q}:${h.r}`);
    if (i === 0) {
      tiles.push({ x, z, seed, child: centre, prop: centre ? undefined : "prop.antenna" });
      return;
    }
    const child = others[i - 1]?.id;
    if (child) {
      tiles.push({ x, z, seed, child });
      return;
    }
    // Shoreline: keep most outer tiles so the island looks irregular, decorate some.
    if (h.ring === rings && rand() < 0.35) return;
    const prop = rand() < 0.55 ? PROPS[Math.floor(rand() * PROPS.length)] : undefined;
    tiles.push({ x, z, seed, prop });
  });
  return { repo, x: 0, z: 0, radius: rings + 0.5, tiles, integration: integ?.id };
}

export function layoutWorld(repos: RepoInput[]): WorldLayout {
  const hubTiles = spiral(7).map((h, i) => {
    const { x, z } = hexToXZ(h.q, h.r);
    const props: (Prop | undefined)[] = [
      undefined,
      "prop.solar",
      undefined,
      "prop.crates",
      "prop.solar",
      undefined,
      "prop.antenna",
    ];
    return { x, z, seed: hash(`hub:${i}`), prop: props[i] };
  });
  const hub: IslandLayout = { repo: "", x: 0, z: 0, radius: 1.5, tiles: hubTiles };
  const islands = repos.map((r) => island(r.id, r.children));
  const n = islands.length;
  const maxR = islands.reduce((m, i) => Math.max(m, i.radius), 1);
  const dist =
    n <= 1 ? hub.radius + maxR + 2.2 : Math.max(hub.radius + maxR + 2.2, (maxR + 1.2) / Math.sin(Math.PI / n));
  islands.forEach((isl, i) => {
    // Start towards the back of the default camera view so the first island faces the viewer.
    const a = -Math.PI * 0.75 + (i / Math.max(1, n)) * Math.PI * 2;
    isl.x = Math.cos(a) * dist;
    isl.z = Math.sin(a) * dist;
  });
  return { hub, islands, extent: dist + maxR + 1 };
}
