import type { Object3D } from "three";

/**
 * Every visible object is created through a named slot. PR 1 ships procedural low-poly models for
 * each slot; themes (PR 2) can register a model per slot and fall back to these.
 *
 * Model conventions: Y-up, 1 unit = one hex tile width (flat side to flat side), origin at the
 * base centre, facing +Z. Robots may carry `walk` / `idle` / `work` clips; without them the world
 * animates them in code.
 */
export const SLOT_NAMES = [
  "tile",
  "hub",
  "tower.integration",
  "building.planning",
  "building.implementing",
  "building.testing",
  "building.merged",
  "rubble",
  "beacon.failed",
  "robot.coordinator",
  "robot.planner",
  "robot.implementer",
  "robot.tester",
  "prop.solar",
  "prop.crates",
  "prop.rocks",
  "prop.plant",
  "prop.antenna",
] as const;

export type SlotName = (typeof SLOT_NAMES)[number];

export interface SlotContext {
  /** Deterministic per-instance seed, for variation. */
  seed: number;
}

/**
 * Optional per-frame hook a slot object can set on `userData.tick`. `t` is seconds since start,
 * `night` is 0 (day) to 1 (night).
 */
export type Tick = (t: number, night: number) => void;

export type SlotFactory = (ctx: SlotContext) => Object3D;

export class SlotRegistry {
  private overrides = new Map<SlotName, SlotFactory>();

  constructor(private fallback: Record<SlotName, SlotFactory>) {}

  /** Replace the model for one slot (themes). */
  register(name: SlotName, factory: SlotFactory): void {
    this.overrides.set(name, factory);
  }

  create(name: SlotName, ctx: SlotContext): Object3D {
    const obj = (this.overrides.get(name) ?? this.fallback[name])(ctx);
    obj.name = name;
    obj.userData.slot = name;
    return obj;
  }
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
