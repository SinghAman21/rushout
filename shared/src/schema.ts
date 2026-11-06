import { Schema, type, MapSchema } from "@colyseus/schema";

export interface IActivePowerUp {
  type: number;
  remainingMs: number;
  durationMs: number;
}

export interface IPowerUpSpawn {
  id: string;
  type: number;
  x: number;
  y: number;
  respawnTimer: number;
}

export interface IStickyPatch {
  id: string;
  x: number;
  y: number;
  remainingMs: number;
}

export interface IDecoy {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  remainingMs: number;
}

export interface IPlayerSchema {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  isIt: boolean;
  alive: boolean;
  facingX: number;
  facingY: number;
  color: string;
  score: number;
  ready: boolean;
  activePowerUpType: number;
  activePowerUpRemaining: number;
  activePowerUpDuration: number;
  powerUpCooldown: number;
  heldPowerUp: number;
}

export class PlayerSchema extends Schema {
  declare id: string;
  declare name: string;
  declare x: number;
  declare y: number;
  declare vx: number;
  declare vy: number;
  declare isIt: boolean;
  declare alive: boolean;
  declare facingX: number;
  declare facingY: number;
  declare color: string;
  declare score: number;
  declare ready: boolean;
  declare activePowerUpType: number;
  declare activePowerUpRemaining: number;
  declare activePowerUpDuration: number;
  declare powerUpCooldown: number;
  declare heldPowerUp: number;
  constructor() {
    super();
    this.id = "";
    this.name = "";
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.isIt = false;
    this.alive = true;
    this.facingX = 1;
    this.facingY = 0;
    this.color = "#FFFFFF";
    this.score = 0;
    this.ready = false;
    this.activePowerUpType = -1;
    this.activePowerUpRemaining = 0;
    this.activePowerUpDuration = 0;
    this.powerUpCooldown = 0;
    this.heldPowerUp = -1;
  }
}

type("string")(PlayerSchema.prototype, "id");
type("string")(PlayerSchema.prototype, "name");
type("number")(PlayerSchema.prototype, "x");
type("number")(PlayerSchema.prototype, "y");
type("number")(PlayerSchema.prototype, "vx");
type("number")(PlayerSchema.prototype, "vy");
type("boolean")(PlayerSchema.prototype, "isIt");
type("boolean")(PlayerSchema.prototype, "alive");
type("number")(PlayerSchema.prototype, "facingX");
type("number")(PlayerSchema.prototype, "facingY");
type("string")(PlayerSchema.prototype, "color");
type("number")(PlayerSchema.prototype, "score");
type("boolean")(PlayerSchema.prototype, "ready");
type("number")(PlayerSchema.prototype, "activePowerUpType");
type("number")(PlayerSchema.prototype, "activePowerUpRemaining");
type("number")(PlayerSchema.prototype, "activePowerUpDuration");
type("number")(PlayerSchema.prototype, "powerUpCooldown");
type("number")(PlayerSchema.prototype, "heldPowerUp");

export class PowerUpSpawnSchema extends Schema {
  declare id: string;
  declare type: number;
  declare x: number;
  declare y: number;
  declare respawnTimer: number;
  constructor() {
    super();
    this.id = "";
    this.type = 0;
    this.x = 0;
    this.y = 0;
    this.respawnTimer = 0;
  }
}

type("string")(PowerUpSpawnSchema.prototype, "id");
type("number")(PowerUpSpawnSchema.prototype, "type");
type("number")(PowerUpSpawnSchema.prototype, "x");
type("number")(PowerUpSpawnSchema.prototype, "y");
type("number")(PowerUpSpawnSchema.prototype, "respawnTimer");

export class StickyPatchSchema extends Schema {
  declare id: string;
  declare x: number;
  declare y: number;
  declare remainingMs: number;
  constructor() {
    super();
    this.id = "";
    this.x = 0;
    this.y = 0;
    this.remainingMs = 0;
  }
}

type("string")(StickyPatchSchema.prototype, "id");
type("number")(StickyPatchSchema.prototype, "x");
type("number")(StickyPatchSchema.prototype, "y");
type("number")(StickyPatchSchema.prototype, "remainingMs");

export class DecoySchema extends Schema {
  declare id: string;
  declare ownerId: string;
  declare x: number;
  declare y: number;
  declare vx: number;
  declare vy: number;
  declare remainingMs: number;
  constructor() {
    super();
    this.id = "";
    this.ownerId = "";
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.remainingMs = 0;
  }
}

type("string")(DecoySchema.prototype, "id");
type("string")(DecoySchema.prototype, "ownerId");
type("number")(DecoySchema.prototype, "x");
type("number")(DecoySchema.prototype, "y");
type("number")(DecoySchema.prototype, "vx");
type("number")(DecoySchema.prototype, "vy");
type("number")(DecoySchema.prototype, "remainingMs");

export class TagRoomStateSchema extends Schema {
  declare players: MapSchema<PlayerSchema>;
  declare spawns: MapSchema<PowerUpSpawnSchema>;
  declare stickyPatches: MapSchema<StickyPatchSchema>;
  declare decoys: MapSchema<DecoySchema>;
  declare hostId: string;
  declare gameStarted: boolean;
  declare roundTimeRemaining: number;
  declare roundLength: number;
  declare mapName: string;
  declare roundLengthNum: number;
  declare powerUpsEnabled: boolean;
  constructor() {
    super();
    this.players = new MapSchema<PlayerSchema>();
    this.spawns = new MapSchema<PowerUpSpawnSchema>();
    this.stickyPatches = new MapSchema<StickyPatchSchema>();
    this.decoys = new MapSchema<DecoySchema>();
    this.hostId = "";
    this.gameStarted = false;
    this.roundTimeRemaining = 0;
    this.roundLength = 120;
    this.mapName = "arena";
    this.roundLengthNum = 120;
    this.powerUpsEnabled = true;
  }
}

type({ map: PlayerSchema })(TagRoomStateSchema.prototype, "players");
type({ map: PowerUpSpawnSchema })(TagRoomStateSchema.prototype, "spawns");
type({ map: StickyPatchSchema })(TagRoomStateSchema.prototype, "stickyPatches");
type({ map: DecoySchema })(TagRoomStateSchema.prototype, "decoys");
type("string")(TagRoomStateSchema.prototype, "hostId");
type("boolean")(TagRoomStateSchema.prototype, "gameStarted");
type("number")(TagRoomStateSchema.prototype, "roundTimeRemaining");
type("number")(TagRoomStateSchema.prototype, "roundLength");
type("string")(TagRoomStateSchema.prototype, "mapName");
type("number")(TagRoomStateSchema.prototype, "roundLengthNum");
type("boolean")(TagRoomStateSchema.prototype, "powerUpsEnabled");


