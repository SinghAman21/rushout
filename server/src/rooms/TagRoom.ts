import { createRequire } from "module";
import type { Client, Room as RoomType } from "colyseus";
import {
  TagRoomStateSchema,
  PlayerSchema,
  PowerUpSpawnSchema,
  StickyPatchSchema,
  DecoySchema,
  POWER_UP_TYPE_INDEX,
  POWER_UP_INDEX_TO_TYPE,
  type GameMap,
  type RoomConfig,
  MAPS,
  PLAYER_COLORS,
  PLAYER_MOVE_SPEED,
  PLAYER_JUMP_SPEED,
  GRAVITY,
  MAX_FALL_SPEED,
  SPEED_SURGE_MULTIPLIER,
  PLAYER_SIZE,
  TAG_RADIUS,
  POWER_UP_PICKUP_RADIUS,
  FREEZE_RADIUS,
  BINK_DASH_DISTANCE,
  STICKY_PATCH_RADIUS,
  STICKY_SLOW_MULTIPLIER,
  POWER_UP_CONFIGS,
  type PowerUpType,
} from "rushout-shared";

const require = createRequire(import.meta.url);
const colyseus = require("colyseus") as any;

const { Room } = colyseus;

const ROOM_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SERVER_TICK_RATE = 60;
const NETWORK_PATCH_RATE = 20;

function generateRoomCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function rectCollides(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function collidesWithObstacles(x: number, y: number, obstacles: any[]): boolean {
  for (const o of obstacles) {
    if (rectCollides(x, y, PLAYER_SIZE * 2, PLAYER_SIZE * 2, o.x, o.y, o.w, o.h)) {
      return true;
    }
  }
  return false;
}

function lineSegmentsIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): boolean {
  const ccw = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  };
  return ccw(x1, y1, x3, y3, x4, y4) !== ccw(x2, y2, x3, y3, x4, y4) &&
         ccw(x1, y1, x2, y2, x3, y3) !== ccw(x1, y1, x2, y2, x4, y4);
}

function lineIntersectsBox(
  x1: number, y1: number, x2: number, y2: number,
  bx: number, by: number, bw: number, bh: number
): boolean {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  if (bx + bw < minX || bx > maxX || by + bh < minY || by > maxY) return false;

  if (x1 > bx && x1 < bx + bw && y1 > by && y1 < by + bh) return true;
  if (x2 > bx && x2 < bx + bw && y2 > by && y2 < by + bh) return true;

  return (
    lineSegmentsIntersect(x1, y1, x2, y2, bx, by, bx + bw, by) ||
    lineSegmentsIntersect(x1, y1, x2, y2, bx, by + bh, bx + bw, by + bh) ||
    lineSegmentsIntersect(x1, y1, x2, y2, bx, by, bx, by + bh) ||
    lineSegmentsIntersect(x1, y1, x2, y2, bx + bw, by, bx + bw, by + bh)
  );
}

function hasLineOfSight(
  x1: number, y1: number, x2: number, y2: number,
  obstacles: any[]
): boolean {
  for (const o of obstacles) {
    if (o.x < 0 || o.x >= 2000) continue;
    if (lineIntersectsBox(x1, y1, x2, y2, o.x, o.y, o.w, o.h)) {
      return false;
    }
  }
  return true;
}

function horizontallyOverlaps(x: number, obstacle: any): boolean {
  const playerW = PLAYER_SIZE * 2;
  return x + playerW > obstacle.x && x < obstacle.x + obstacle.w;
}

function isGrounded(player: { x: number; y: number; vy: number }, map: GameMap): boolean {
  if (player.vy < -0.1) return false;
  const playerH = PLAYER_SIZE * 2;
  const bottom = player.y + playerH;
  if (bottom >= map.height - 0.5) return true;

  for (const o of map.obstacles) {
    if (horizontallyOverlaps(player.x, o)) {
      if (bottom >= o.y - 1 && bottom <= o.y + 3 && player.y < o.y) {
        return true;
      }
    }
  }
  return false;
}

function moveVertically(player: PlayerSchema, newY: number, map: GameMap) {
  const playerH = PLAYER_SIZE * 2;
  const oldY = player.y;

  if (player.vy >= 0) {
    const oldBottom = oldY + playerH;
    const newBottom = newY + playerH;
    for (const o of map.obstacles) {
      if (horizontallyOverlaps(player.x, o) && oldBottom <= o.y && newBottom >= o.y) {
        player.y = o.y - playerH;
        player.vy = 0;
        return;
      }
    }
  } else {
    for (const o of map.obstacles) {
      const obstacleBottom = o.y + o.h;
      if (horizontallyOverlaps(player.x, o) && oldY >= obstacleBottom && newY <= obstacleBottom) {
        player.y = obstacleBottom;
        player.vy = 0;
        return;
      }
    }
  }

  if (!collidesWithObstacles(player.x, newY, map.obstacles)) {
    player.y = newY;
  } else {
    player.vy = 0;
  }
}

interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

interface InputData {
  clientTick?: number;
  seq?: number;
  mask?: number;
  up?: boolean;
  left?: boolean;
  right?: boolean;
  down?: boolean;
  jump?: boolean;
}

function decodeInput(data: InputData | number): { state: InputState; clientTick: number; jump: boolean } {
  let mask = 0;
  let clientTick = 0;
  let jump = false;
  if (typeof data === "number") {
    mask = data;
  } else if (data && typeof data === "object") {
    if (typeof data.mask === "number") {
      mask = data.mask;
    } else {
      if (data.up) mask |= 1;
      if (data.down) mask |= 2;
      if (data.left) mask |= 4;
      if (data.right) mask |= 8;
    }
    if (typeof data.clientTick === "number") {
      clientTick = data.clientTick;
    } else if (typeof data.seq === "number") {
      clientTick = data.seq;
    }
    jump = !!data.jump;
  }

  return {
    state: {
      up: (mask & 1) !== 0,
      down: (mask & 2) !== 0,
      left: (mask & 4) !== 0,
      right: (mask & 8) !== 0,
    },
    clientTick,
    jump,
  };
}

function playerList(state: TagRoomStateSchema): PlayerSchema[] {
  const out: PlayerSchema[] = [];
  state.players.forEach((p) => out.push(p));
  return out;
}

function serializePlayers(state: TagRoomStateSchema, lastProcessedTicks?: Map<string, number>) {
  return playerList(state).map(p => ({
    id: p.id,
    name: p.name,
    x: p.x,
    y: p.y,
    vx: p.vx,
    vy: p.vy,
    lastProcessedTick: lastProcessedTicks?.get(p.id) ?? 0,
    lastSeq: lastProcessedTicks?.get(p.id) ?? 0,
    isIt: p.isIt,
    alive: p.alive,
    facingX: p.facingX,
    facingY: p.facingY,
    color: p.color,
    score: p.score,
    ready: p.ready,
    activePowerUpType: p.activePowerUpType,
    activePowerUpRemaining: p.activePowerUpRemaining,
    activePowerUpDuration: p.activePowerUpDuration,
    powerUpCooldown: p.powerUpCooldown,
    heldPowerUp: p.heldPowerUp,
  }));
}


export class TagRoom extends (Room as unknown as typeof RoomType) {
  get s(): TagRoomStateSchema {
    return this.state as TagRoomStateSchema;
  }

  private serverTick = 0;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private powerUpInterval: ReturnType<typeof setInterval> | null = null;
  private lastTick = Date.now();
  private lastFrameBroadcast = 0;
  private playerInputs: Map<string, InputState> = new Map();
  private playerPendingInputs: Map<string, Array<{ clientTick: number; state: InputState; jump: boolean }>> = new Map();
  private playerLastClientTick: Map<string, number> = new Map();
  private playerLastProcessedTick: Map<string, number> = new Map();
  private lastUpInputs: Map<string, boolean> = new Map();
  private jumpBuffer: Map<string, number> = new Map();
  private tagLocked = false;
  private hostId: string | null = null;
  private hostKey: string | null = null;
  private config: RoomConfig = {
    roundLength: 120,
    mapName: "arena",
    powerUpsEnabled: true,
  };
  private map: GameMap = MAPS.arena;

  onCreate(options: { config?: RoomConfig; hostKey?: string; roomCode?: string }) {
    const roomCode = (options.roomCode ?? generateRoomCode()).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    this.setMetadata({ roomCode });
    this.config = options.config ?? this.config;
    this.hostKey = options.hostKey ?? null;
    this.map = MAPS[this.config.mapName] ?? MAPS.arena;
    this.maxClients = 13;

    const state = new TagRoomStateSchema();
    state.mapName = this.config.mapName;
    state.roundLength = this.config.roundLength;
    state.roundLengthNum = this.config.roundLength;
    state.roundTimeRemaining = this.config.roundLength;
    state.powerUpsEnabled = this.config.powerUpsEnabled;
    state.gameStarted = false;
    this.setState(state);
    this.setPatchRate(1000 / NETWORK_PATCH_RATE);

    this.onMessage("input", (client: Client, data: InputData | number) => {
      const { state: input, clientTick, jump: explicitJump } = decodeInput(data);
      const prevClientTick = this.playerLastClientTick.get(client.sessionId) ?? 0;

      // Ignore stale out-of-order packets
      if (clientTick > 0 && clientTick <= prevClientTick) {
        return;
      }

      if (clientTick > 0) {
        this.playerLastClientTick.set(client.sessionId, clientTick);
      }

      const wasUp = this.lastUpInputs.get(client.sessionId) ?? false;
      const isJump = (input.up && !wasUp) || explicitJump;
      this.lastUpInputs.set(client.sessionId, input.up);

      const queue = this.playerPendingInputs.get(client.sessionId) ?? [];
      const last = queue[queue.length - 1];

      // If incoming packet has identical input state and neither has jump, update clientTick
      if (
        last &&
        last.state.up === input.up &&
        last.state.down === input.down &&
        last.state.left === input.left &&
        last.state.right === input.right &&
        !last.jump &&
        !isJump
      ) {
        last.clientTick = clientTick;
      } else {
        queue.push({ clientTick, state: input, jump: isJump });
        if (queue.length > 5) {
          queue.shift();
        }
      }

      this.playerPendingInputs.set(client.sessionId, queue);
    });

    this.onMessage("startGame", (client: Client) => {
      if (client.sessionId !== this.hostId) return;
      if (this.s.gameStarted) return;
      this.startGame();
    });

    this.onMessage("requestLobbyState", (client: Client) => {
      this.sendLobbyState(client);
    });

    this.onMessage("ready", (client: Client) => {
      const player = this.s.players.get(client.sessionId);
      if (player) {
        player.ready = !player.ready;
        this.sendLobbyState();
      }
    });

    this.onMessage("config", (client: Client, data: Partial<RoomConfig>) => {
      if (client.sessionId !== this.hostId) return;
      if (this.s.gameStarted) return;
      if (data.roundLength) {
        this.config.roundLength = data.roundLength;
        this.s.roundLength = data.roundLength;
        this.s.roundLengthNum = data.roundLength;
      }
      if (data.mapName && MAPS[data.mapName]) {
        this.config.mapName = data.mapName;
        this.s.mapName = data.mapName;
        this.map = MAPS[data.mapName];
      }
      if (data.powerUpsEnabled !== undefined) {
        this.config.powerUpsEnabled = data.powerUpsEnabled;
        this.s.powerUpsEnabled = data.powerUpsEnabled;
      }
    });
  }

  onJoin(client: Client, options: { name?: string; hostKey?: string }) {
    if (this.s.players.has(client.sessionId)) {
      console.log(`[JOIN] duplicate ignored for ${client.sessionId}`);
      return;
    }
    const playerIndex = this.s.players.size;
    if (!this.hostId || (this.hostKey && options.hostKey === this.hostKey)) {
      this.hostId = client.sessionId;
      this.s.hostId = client.sessionId;
      this.broadcast("hostUpdate", { hostId: client.sessionId });
    }
    const spawn = this.map.spawnPoints[playerIndex % this.map.spawnPoints.length];

    const player = new PlayerSchema();
    player.id = client.sessionId;
    player.name = options.name ?? `P${playerIndex + 1}`;
    player.x = spawn.x;
    player.y = spawn.y;
    player.isIt = false;
    player.alive = true;
    player.facingX = 1;
    player.facingY = 0;
    player.color = PLAYER_COLORS[playerIndex % PLAYER_COLORS.length];
    player.score = 0;
    player.ready = false;
    player.heldPowerUp = -1;
    player.activePowerUpType = -1;

    this.s.players.set(client.sessionId, player);
    this.playerInputs.set(client.sessionId, {
      up: false, down: false, left: false, right: false,
    });
    console.log(`[JOIN] ${client.sessionId} name="${player.name}"`);
    this.sendLobbyState();
  }

  onLeave(client: Client) {
    this.s.players.delete(client.sessionId);
    this.playerInputs.delete(client.sessionId);
    this.playerPendingInputs.delete(client.sessionId);
    this.lastUpInputs.delete(client.sessionId);
    this.jumpBuffer.delete(client.sessionId);
    this.playerLastClientTick.delete(client.sessionId);
    this.playerLastProcessedTick.delete(client.sessionId);

    if (this.s.players.size === 0) {
      this.disconnect();
      return;
    }

    if (client.sessionId === this.hostId) {
      this.hostId = playerList(this.s)[0]?.id ?? null;
      this.s.hostId = this.hostId ?? "";
      this.broadcast("hostUpdate", { hostId: this.hostId ?? "" });
    }

    if (this.s.gameStarted) {
      const players = playerList(this.s);
      const itPlayer = players.find(p => p.isIt);
      if (!itPlayer && players.length > 0) {
        const randomPlayer = players[Math.floor(Math.random() * players.length)];
        randomPlayer.isIt = true;
      }
    }

    this.sendLobbyState();
  }

  private sendLobbyState(client?: Client) {
    const payload = {
      serverTick: this.serverTick,
      hostId: this.hostId ?? "",
      players: serializePlayers(this.s, this.playerLastProcessedTick),
      count: this.s.players.size,
      maxClients: this.maxClients,
      roomCode: this.metadata?.roomCode ?? "",
    };

    if (client) {
      client.send("lobbyState", payload);
    } else {
      this.broadcast("lobbyState", payload);
    }
  }


  private sendGameFrame() {
    this.broadcast("gameFrame", {
      serverTick: this.serverTick,
      hostId: this.hostId ?? "",
      roomCode: this.metadata?.roomCode ?? "",
      gameStarted: this.s.gameStarted,
      roundTimeRemaining: this.s.roundTimeRemaining,
      roundLength: this.s.roundLength,
      mapName: this.s.mapName,
      powerUpsEnabled: this.s.powerUpsEnabled,
      players: serializePlayers(this.s, this.playerLastProcessedTick),
      spawns: (() => {
        const out: Array<{ id: string; type: number; x: number; y: number; respawnTimer: number }> = [];
        this.s.spawns.forEach(s => out.push({
          id: s.id,
          type: s.type,
          x: s.x,
          y: s.y,
          respawnTimer: s.respawnTimer,
        }));
        return out;
      })(),
      stickyPatches: (() => {
        const out: Array<{ id: string; x: number; y: number; remainingMs: number }> = [];
        this.s.stickyPatches.forEach(s => out.push({
          id: s.id,
          x: s.x,
          y: s.y,
          remainingMs: s.remainingMs,
        }));
        return out;
      })(),
      decoys: (() => {
        const out: Array<{ id: string; ownerId: string; x: number; y: number; vx: number; vy: number; remainingMs: number }> = [];
        this.s.decoys.forEach(d => out.push({
          id: d.id,
          ownerId: d.ownerId,
          x: d.x,
          y: d.y,
          vx: d.vx,
          vy: d.vy,
          remainingMs: d.remainingMs,
        }));
        return out;
      })(),
    });
  }

  startGame() {
    this.serverTick = 0;
    this.lastFrameBroadcast = 0;
    this.s.gameStarted = true;
    this.s.roundTimeRemaining = this.config.roundLength;
    this.tagLocked = false;
    this.jumpBuffer.clear();
    this.lastUpInputs.clear();
    this.playerLastClientTick.clear();
    this.playerLastProcessedTick.clear();
    this.playerPendingInputs.clear();

    const players = playerList(this.s);
    const initialItId = this.hostId ?? players[0]?.id ?? "";
    let idx = 0;
    this.s.players.forEach((player) => {
      const spawn = this.map.spawnPoints[idx % this.map.spawnPoints.length];
      player.x = spawn.x;
      player.y = spawn.y;
      player.vx = 0;
      player.vy = 0;
      player.isIt = player.id === initialItId;
      player.alive = true;
      player.score = 0;
      player.activePowerUpType = -1;
      player.activePowerUpRemaining = 0;
      player.activePowerUpDuration = 0;
      player.powerUpCooldown = 0;
      player.heldPowerUp = -1;
      idx++;
    });

    this.s.spawns.clear();
    this.s.stickyPatches.clear();
    this.s.decoys.clear();

    this.lastTick = Date.now();

    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.powerUpInterval) clearInterval(this.powerUpInterval);
    this.tickInterval = setInterval(() => this.gameTick(), 1000 / SERVER_TICK_RATE);
    if (this.config.powerUpsEnabled) {
      this.powerUpInterval = setInterval(() => this.spawnPowerUp(), 12000);
    }

    this.sendLobbyState();
    this.sendGameFrame();
    this.broadcast("gameStarted", {});
  }

  gameTick() {
    if (!this.s.gameStarted) return;

    this.serverTick++;
    const now = Date.now();
    this.lastTick = now;
    const dt = 1000 / SERVER_TICK_RATE;

    this.s.roundTimeRemaining -= 1 / SERVER_TICK_RATE;
    if (this.s.roundTimeRemaining <= 0) {
      this.s.roundTimeRemaining = 0;
      this.endRound();
      return;
    }

    const staleSpawns: string[] = [];
    this.s.spawns.forEach((spawn, key) => {
      if (spawn.respawnTimer > 0) {
        spawn.respawnTimer -= dt;
        if (spawn.respawnTimer <= 0) staleSpawns.push(key);
      }
    });
    for (const k of staleSpawns) this.s.spawns.delete(k);

    const staleSticky: string[] = [];
    this.s.stickyPatches.forEach((sp, key) => {
      sp.remainingMs -= dt;
      if (sp.remainingMs <= 0) staleSticky.push(key);
    });
    for (const k of staleSticky) this.s.stickyPatches.delete(k);

    const staleDecoys: string[] = [];
    this.s.decoys.forEach((d, key) => {
      d.remainingMs -= dt;
      d.x += d.vx;
      d.y += d.vy;
      d.vx *= 0.97;
      d.vy *= 0.97;
      if (d.remainingMs <= 0) staleDecoys.push(key);
    });
    for (const k of staleDecoys) this.s.decoys.delete(k);

    this.s.players.forEach((player, sessionId) => {
      if (player.activePowerUpType >= 0) {
        player.activePowerUpRemaining -= dt;
        if (player.activePowerUpRemaining <= 0) {
          player.activePowerUpType = -1;
          player.activePowerUpRemaining = 0;
          player.activePowerUpDuration = 0;
        }
      }
      if (player.powerUpCooldown > 0) {
        player.powerUpCooldown -= dt;
        if (player.powerUpCooldown < 0) player.powerUpCooldown = 0;
      }

      const pending = this.playerPendingInputs.get(sessionId);
      if (pending && pending.length > 0) {
        const next = pending.shift()!;
        this.playerInputs.set(sessionId, next.state);
        if (next.clientTick > 0) {
          this.playerLastProcessedTick.set(sessionId, next.clientTick);
        }
        if (next.jump) {
          this.jumpBuffer.set(sessionId, 120);
        }
      }

      const input = this.playerInputs.get(sessionId) ?? { up: false, down: false, left: false, right: false };

      let bufferRemaining = this.jumpBuffer.get(sessionId) ?? 0;
      if (bufferRemaining > 0) {
        bufferRemaining = Math.max(0, bufferRemaining - dt);
        this.jumpBuffer.set(sessionId, bufferRemaining);
      }
      const canJump = (this.jumpBuffer.get(sessionId) ?? 0) > 0;

      const isFrozen = player.activePowerUpType === POWER_UP_TYPE_INDEX.freeze_pulse;

      let speed = PLAYER_MOVE_SPEED;
      if (player.activePowerUpType === POWER_UP_TYPE_INDEX.speed_surge) {
        speed *= SPEED_SURGE_MULTIPLIER;
      }

      this.s.stickyPatches.forEach((patch) => {
        if (distSq(player.x + PLAYER_SIZE, player.y + PLAYER_SIZE, patch.x, patch.y) < STICKY_PATCH_RADIUS * STICKY_PATCH_RADIUS) {
          speed *= STICKY_SLOW_MULTIPLIER;
        }
      });

      let dx = 0;
      if (!isFrozen) {
        if (input.left) dx -= speed;
        if (input.right) dx += speed;
        if (dx !== 0) {
          player.facingX = Math.sign(dx);
          player.facingY = 0;
        }
        if (canJump && isGrounded(player, this.map)) {
          player.vy = -PLAYER_JUMP_SPEED;
          this.jumpBuffer.set(sessionId, 0);
        }
      }

      player.vx = dx;
      player.vy = Math.min(MAX_FALL_SPEED, player.vy + GRAVITY);

      const newX = player.x + player.vx;
      if (!collidesWithObstacles(newX, player.y, this.map.obstacles)) {
        player.x = newX;
      } else {
        player.vx = 0;
      }

      const newY = player.y + player.vy;
      moveVertically(player, newY, this.map);

      player.x = Math.max(0, Math.min(this.map.width - PLAYER_SIZE * 2, player.x));
      player.y = Math.max(0, Math.min(this.map.height - PLAYER_SIZE * 2, player.y));
      if (player.y >= this.map.height - PLAYER_SIZE * 2) player.vy = 0;
    });

    this.s.players.forEach((player) => {
      if (player.heldPowerUp >= 0) return;
      const consumed: string[] = [];
      this.s.spawns.forEach((spawn, key) => {
        if (distSq(player.x + PLAYER_SIZE, player.y + PLAYER_SIZE, spawn.x, spawn.y) < POWER_UP_PICKUP_RADIUS * POWER_UP_PICKUP_RADIUS) {
          if (player.powerUpCooldown <= 0) {
            const type = POWER_UP_INDEX_TO_TYPE[spawn.type];
            if (type) {
              this.activatePowerUp(player, type);
              const config = POWER_UP_CONFIGS[type as PowerUpType];
              player.powerUpCooldown = config.cooldownMs;
            }
          }
          consumed.push(key);
        }
      });
      for (const k of consumed) this.s.spawns.delete(k);
    });

    const itPlayer = playerList(this.s).find(p => p.isIt);
    if (itPlayer) {
      const itCx = itPlayer.x + PLAYER_SIZE;
      const itCy = itPlayer.y + PLAYER_SIZE;

      if (this.tagLocked) {
        let stillOverlapping = false;
        for (const other of this.s.players.values()) {
          if (other.id === itPlayer.id) continue;
          if (!other.alive) continue;
          if (distSq(itCx, itCy, other.x + PLAYER_SIZE, other.y + PLAYER_SIZE) < TAG_RADIUS * TAG_RADIUS) {
            stillOverlapping = true;
            break;
          }
        }
        if (!stillOverlapping) {
          this.tagLocked = false;
        }
      }

      if (!this.tagLocked) {
        for (const other of this.s.players.values()) {
          if (other.id === itPlayer.id) continue;
          if (!other.alive) continue;

          if (distSq(itCx, itCy, other.x + PLAYER_SIZE, other.y + PLAYER_SIZE) < TAG_RADIUS * TAG_RADIUS) {
            // Check line of sight cover (trees or platforms)
            if (!hasLineOfSight(itCx, itCy, other.x + PLAYER_SIZE, other.y + PLAYER_SIZE, this.map.obstacles)) {
              continue;
            }

            if (other.activePowerUpType === POWER_UP_TYPE_INDEX.safe_bubble) {
              other.activePowerUpType = -1;
              other.activePowerUpRemaining = 0;
              other.activePowerUpDuration = 0;
              continue;
            }

            itPlayer.isIt = false;
            other.isIt = true;
            itPlayer.score += 1;
            this.tagLocked = true;

            this.broadcast("tag", {
              taggerId: itPlayer.id,
              taggedId: other.id,
            });
            break;
          }
        }
      }
    }

    const FRAME_BROADCAST_INTERVAL = 1000 / 30; // 30 Hz = 33.3ms
    if (now - this.lastFrameBroadcast >= FRAME_BROADCAST_INTERVAL) {
      this.lastFrameBroadcast = now;
      this.sendGameFrame();
    }
  }

  activatePowerUp(player: PlayerSchema, type: PowerUpType) {
    const typeIdx = POWER_UP_TYPE_INDEX[type];
    const config = POWER_UP_CONFIGS[type];

    switch (type) {
      case "speed_surge":
      case "ghost_step":
      case "safe_bubble":
        player.activePowerUpType = typeIdx;
        player.activePowerUpRemaining = config.durationMs;
        player.activePowerUpDuration = config.durationMs;
        break;

      case "freeze_pulse": {
        let closest: PlayerSchema | null = null;
        let closestDist = Infinity;
        for (const other of this.s.players.values()) {
          if (other.id === player.id) continue;
          const d = distSq(player.x + PLAYER_SIZE, player.y + PLAYER_SIZE, other.x + PLAYER_SIZE, other.y + PLAYER_SIZE);
          if (d < FREEZE_RADIUS * FREEZE_RADIUS && d < closestDist) {
            closestDist = d;
            closest = other;
          }
        }
        if (closest) {
          closest.activePowerUpType = POWER_UP_TYPE_INDEX.freeze_pulse;
          closest.activePowerUpRemaining = config.durationMs;
          closest.activePowerUpDuration = config.durationMs;
        }
        break;
      }

      case "blink_dash": {
        const dashX = player.x + player.facingX * BINK_DASH_DISTANCE;
        const dashY = player.y + player.facingY * BINK_DASH_DISTANCE;
        const clampedX = Math.max(0, Math.min(this.map.width - PLAYER_SIZE * 2, dashX));
        const clampedY = Math.max(0, Math.min(this.map.height - PLAYER_SIZE * 2, dashY));
        if (!collidesWithObstacles(clampedX, clampedY, this.map.obstacles)) {
          player.x = clampedX;
          player.y = clampedY;
        }
        break;
      }

      case "mirror_decoy": {
        const decoy = new DecoySchema();
        decoy.id = `decoy_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        decoy.ownerId = player.id;
        decoy.x = player.x;
        decoy.y = player.y;
        decoy.vx = -player.facingX * 2;
        decoy.vy = -player.facingY * 2;
        decoy.remainingMs = config.durationMs;
        this.s.decoys.set(decoy.id, decoy);
        break;
      }

      case "sticky_patch": {
        const patch = new StickyPatchSchema();
        patch.id = `sticky_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        patch.x = player.x + PLAYER_SIZE;
        patch.y = player.y + PLAYER_SIZE;
        patch.remainingMs = config.durationMs;
        this.s.stickyPatches.set(patch.id, patch);
        break;
      }
    }
  }

  spawnPowerUp() {
    if (this.s.spawns.size >= 3) return;
    const existing: PowerUpSpawnSchema[] = [];
    this.s.spawns.forEach((s) => existing.push(s));
    const available = this.map.powerUpSpawns.filter(
      ps => !existing.some(s => s.x === ps.x && s.y === ps.y)
    );
    if (available.length === 0) return;

    const slot = available[Math.floor(Math.random() * available.length)];
    const typeKeys = Object.keys(POWER_UP_TYPE_INDEX) as PowerUpType[];
    const type = typeKeys[Math.floor(Math.random() * typeKeys.length)];

    const spawn = new PowerUpSpawnSchema();
    spawn.id = `spawn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    spawn.type = POWER_UP_TYPE_INDEX[type];
    spawn.x = slot.x;
    spawn.y = slot.y;
    spawn.respawnTimer = 0;

    this.s.spawns.set(spawn.id, spawn);
  }

  endRound() {
    this.s.gameStarted = false;
    this.tagLocked = false;
    this.jumpBuffer.clear();
    this.lastUpInputs.clear();
    this.playerLastClientTick.clear();
    this.playerLastProcessedTick.clear();
    this.playerPendingInputs.clear();

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.powerUpInterval) {
      clearInterval(this.powerUpInterval);
      this.powerUpInterval = null;
    }

    const itPlayer = playerList(this.s).find(p => p.isIt);
    const scores = playerList(this.s).map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      wasIt: p.isIt,
    }));

    this.sendLobbyState();
    this.broadcast("roundEnd", {
      loserId: itPlayer?.id ?? "",
      loserName: itPlayer?.name ?? "Unknown",
      scores,
    });
  }

  onDispose() {
    this.jumpBuffer.clear();
    this.lastUpInputs.clear();
    this.playerLastClientTick.clear();
    this.playerLastProcessedTick.clear();
    this.playerPendingInputs.clear();
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.powerUpInterval) {
      clearInterval(this.powerUpInterval);
      this.powerUpInterval = null;
    }
  }
}
