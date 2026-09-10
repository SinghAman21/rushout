export interface Vec2 {
  x: number;
  y: number;
}

export interface PlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  isIt: boolean;
  alive: boolean;
  facing: Vec2;
  color: string;
  score: number;
  ready: boolean;
  activePowerUp: ActivePowerUp | null;
  powerUpCooldown: number;
  heldPowerUp: PowerUpType | null;
  lastSeq?: number;
  lastProcessedTick?: number;
}

export interface ActivePowerUp {
  type: PowerUpType;
  remainingMs: number;
  durationMs: number;
}

export interface PowerUpSpawn {
  id: string;
  type: PowerUpType;
  x: number;
  y: number;
  respawnTimer: number;
}

export interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  type?: "platform" | "cover_tree" | "wall";
}

export type MapTheme = "skyline" | "neon_rooftops" | "desert_ruins";

export interface SceneryProp {
  type: "tree" | "bush" | "cloud" | "sign" | "billboard" | "antenna" | "crate" | "cactus" | "rock" | "obelisk";
  x: number;
  y: number;
  scale?: number;
}

export interface GameMap {
  name: string;
  theme?: MapTheme;
  width: number;
  height: number;
  obstacles: Obstacle[];
  spawnPoints: Vec2[];
  powerUpSpawns: Vec2[];
  scenery?: SceneryProp[];
}

export interface StickyPatch {
  id: string;
  x: number;
  y: number;
  remainingMs: number;
}

export interface Decoy {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  remainingMs: number;
}

export type PowerUpType =
  | "speed_surge"
  | "freeze_pulse"
  | "ghost_step"
  | "blink_dash"
  | "mirror_decoy"
  | "safe_bubble"
  | "sticky_patch";

export type PlayerColor =
  | "#FF6B6B"
  | "#4ECDC4"
  | "#FFE66D"
  | "#A78BFA"
  | "#F97316"
  | "#34D399"
  | "#F472B6"
  | "#60A5FA"
  | "#FBBF24"
  | "#818CF8"
  | "#FB7185"
  | "#2DD4BF"
  | "#C084FC";

export const PLAYER_COLORS: PlayerColor[] = [
  "#FF6B6B",
  "#4ECDC4",
  "#FFE66D",
  "#A78BFA",
  "#F97316",
  "#34D399",
  "#F472B6",
  "#60A5FA",
  "#FBBF24",
  "#818CF8",
  "#FB7185",
  "#2DD4BF",
  "#C084FC",
];

export interface RoomConfig {
  roundLength: 60 | 120 | 180;
  mapName: string;
  powerUpsEnabled: boolean;
}

export interface RoomLobbyState {
  roomId: string;
  hostId: string;
  config: RoomConfig;
  players: PlayerLobbyInfo[];
  gameStarted: boolean;
}

export interface PlayerLobbyInfo {
  id: string;
  name: string;
  ready: boolean;
  color: string;
}

export interface EndOfRoundResult {
  loserId: string;
  loserName: string;
  timeExpired: boolean;
  taggerId?: string;
  taggerName?: string;
  reason: "time_expired" | "tagged";
}
