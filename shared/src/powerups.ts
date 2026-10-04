import type { PowerUpType } from "./types.js";

export interface PowerUpConfig {
  type: PowerUpType;
  name: string;
  description: string;
  durationMs: number;
  cooldownMs: number;
  color: string;
  icon: string;
}

export const POWER_UP_CONFIGS: Record<PowerUpType, PowerUpConfig> = {
  speed_surge: {
    type: "speed_surge",
    name: "Speed Surge",
    description: "Burst of increased speed",
    durationMs: 3000,
    cooldownMs: 8000,
    color: "#FFD700",
    icon: "⚡",
  },
  freeze_pulse: {
    type: "freeze_pulse",
    name: "Freeze Pulse",
    description: "Freezes nearest player for 2s",
    durationMs: 2000,
    cooldownMs: 10000,
    color: "#00BFFF",
    icon: "❄️",
  },
  ghost_step: {
    type: "ghost_step",
    name: "Ghost Step",
    description: "Brief invisibility — jump up through platforms",
    durationMs: 4000,
    cooldownMs: 12000,
    color: "#B0C4DE",
    icon: "👻",
  },
  blink_dash: {
    type: "blink_dash",
    name: "Blink Dash",
    description: "Instant short-range teleport",
    durationMs: 0,
    cooldownMs: 6000,
    color: "#FF69B4",
    icon: "💫",
  },
  mirror_decoy: {
    type: "mirror_decoy",
    name: "Mirror Decoy",
    description: "Spawns a fake duplicate",
    durationMs: 5000,
    cooldownMs: 15000,
    color: "#9370DB",
    icon: "🪞",
  },
  safe_bubble: {
    type: "safe_bubble",
    name: "Safe Bubble",
    description: "One-hit shield against tags",
    durationMs: 10000,
    cooldownMs: 20000,
    color: "#32CD32",
    icon: "🛡️",
  },
  sticky_patch: {
    type: "sticky_patch",
    name: "Sticky Patch",
    description: "Drops a slow zone",
    durationMs: 5000,
    cooldownMs: 10000,
    color: "#8B4513",
    icon: "🫠",
  },
};

export const ALL_POWER_UP_TYPES: PowerUpType[] = Object.keys(POWER_UP_CONFIGS) as PowerUpType[];

export const POWER_UP_TYPE_INDEX: Record<PowerUpType, number> = {
  speed_surge: 0,
  freeze_pulse: 1,
  ghost_step: 2,
  blink_dash: 3,
  mirror_decoy: 4,
  safe_bubble: 5,
  sticky_patch: 6,
};

export const POWER_UP_INDEX_TO_TYPE: PowerUpType[] = [
  "speed_surge",
  "freeze_pulse",
  "ghost_step",
  "blink_dash",
  "mirror_decoy",
  "safe_bubble",
  "sticky_patch",
];

export const ACTIVE_POWER_UPS: PowerUpType[] = [
  "speed_surge",
  "freeze_pulse",
  "ghost_step",
];

export const PASSIVE_POWER_UPS: PowerUpType[] = [
  "blink_dash",
  "mirror_decoy",
  "safe_bubble",
  "sticky_patch",
];

export const POWER_UP_PICKUP_RADIUS = 30;
export const POWER_UP_SPAWN_INTERVAL_MS = 15000;
export const MAX_ACTIVE_SPAWNS = 3;
export const TAG_RADIUS = 32;
export const PLAYER_RADIUS = 16;
export const PLAYER_BASE_SPEED = 3.5;
export const SPEED_SURGE_MULTIPLIER = 1.8;
export const BINK_DASH_DISTANCE = 200;
export const FREEZE_RADIUS = 300;
export const STICKY_PATCH_RADIUS = 40;
export const STICKY_SLOW_MULTIPLIER = 0.4;
