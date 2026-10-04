import {
  type PlayerState,
  type PowerUpType,
  type PowerUpSpawn,
  type Obstacle,
  type StickyPatch,
  type Decoy,
  type GameMap,
  POWER_UP_CONFIGS,
  ALL_POWER_UP_TYPES,
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
  PLAYER_COLORS,
} from "rushout-shared";

export interface VisualEvent {
  id: string;
  type: "tag" | "shield_block" | "cover_block" | "freeze" | "pickup";
  text: string;
  x: number;
  y: number;
  color: string;
  remainingMs: number;
  maxMs: number;
}

export interface LocalGameState {
  players: PlayerState[];
  spawns: PowerUpSpawn[];
  stickyPatches: StickyPatch[];
  decoys: Decoy[];
  decoyBrains: Record<string, DecoyBrain>;
  map: GameMap;
  roundTimeRemaining: number;
  roundLength: number;
  running: boolean;
  ended: boolean;
  result: { loserId: string; loserName: string } | null;
  tagLocked: boolean;
  events: VisualEvent[];
}

export interface LocalPlayerInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface DecoyBrain {
  dir: -1 | 0 | 1;
  decideAt: number;
  jumpFrames: number;
  lastX: number;
  stuckFrames: number;
}

const ZERO_INPUT: LocalPlayerInput = {
  up: false,
  down: false,
  left: false,
  right: false,
};

export function createLocalGame(
  map: GameMap,
  playerNames: string[],
  roundLength: number
): LocalGameState {
  const players: PlayerState[] = playerNames.map((name, i) => ({
    id: `local_${i}`,
    name,
    x: map.spawnPoints[i % map.spawnPoints.length].x,
    y: map.spawnPoints[i % map.spawnPoints.length].y,
    vx: 0,
    vy: 0,
    isIt: i === 0,
    alive: true,
    facing: { x: 1, y: 0 },
    color: PLAYER_COLORS[i % PLAYER_COLORS.length],
    score: 0,
    ready: true,
    activePowerUp: null,
    powerUpCooldown: 0,
    heldPowerUp: null,
  }));

  return {
    players,
    spawns: [],
    stickyPatches: [],
    decoys: [],
    decoyBrains: {},
    map,
    roundTimeRemaining: roundLength,
    roundLength,
    running: false,
    ended: false,
    result: null,
    tagLocked: false,
    events: [],
  };
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

export function hasLineOfSight(
  x1: number, y1: number, x2: number, y2: number,
  obstacles: Obstacle[]
): boolean {
  for (const o of obstacles) {
    if (o.x < 0 || o.x >= 2000) continue;
    if (lineIntersectsBox(x1, y1, x2, y2, o.x, o.y, o.w, o.h)) {
      return false;
    }
  }
  return true;
}

function rectCollides(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function collidesWithObstacles(
  x: number, y: number, obstacles: Obstacle[]
): boolean {
  for (const o of obstacles) {
    if (rectCollides(x, y, PLAYER_SIZE * 2, PLAYER_SIZE * 2, o.x, o.y, o.w, o.h)) {
      return true;
    }
  }
  return false;
}

function horizontallyOverlaps(x: number, obstacle: Obstacle): boolean {
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

function moveVertically(player: { x: number; y: number; vy: number }, newY: number, map: GameMap, ghostUp = false) {
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
    // A ghost that phased up inside a platform (jump peaked or effect
    // expired mid-phase) lands on top instead of getting stuck.
    let landY = Infinity;
    for (const o of map.obstacles) {
      if (rectCollides(player.x, player.y, playerH, playerH, o.x, o.y, o.w, o.h)) {
        landY = Math.min(landY, o.y - playerH);
      }
    }
    if (landY !== Infinity) {
      player.y = landY;
      player.vy = 0;
      return;
    }
  } else if (!ghostUp) {
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
  } else if (ghostUp && player.vy < 0) {
    // Ghost rises straight through platforms (one-way: still lands from above).
    player.y = newY;
  } else {
    player.vy = 0;
  }
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function spawnPowerUps(state: LocalGameState) {
  if (state.spawns.length >= 3) return;
  const availableSlots = state.map.powerUpSpawns.filter(
    ps => !state.spawns.some(s => s.x === ps.x && s.y === ps.y)
  );
  if (availableSlots.length === 0) return;

  const slot = availableSlots[Math.floor(Math.random() * availableSlots.length)];
  const type = ALL_POWER_UP_TYPES[Math.floor(Math.random() * ALL_POWER_UP_TYPES.length)];

  state.spawns.push({
    id: `spawn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    x: slot.x,
    y: slot.y,
    respawnTimer: 0,
  });
}

export function updateLocalGame(
  state: LocalGameState,
  inputs: LocalPlayerInput[],
  dt: number
): void {
  if (!state.running || state.ended) return;

  state.roundTimeRemaining -= dt / 1000;
  if (state.roundTimeRemaining <= 0) {
    state.roundTimeRemaining = 0;
    const itPlayer = state.players.find(p => p.isIt);
    state.ended = true;
    state.running = false;
    state.result = {
      loserId: itPlayer?.id ?? "",
      loserName: itPlayer?.name ?? "Unknown",
    };
    return;
  }

  // Update power-up timers
  for (const player of state.players) {
    if (player.activePowerUp) {
      player.activePowerUp.remainingMs -= dt;
      if (player.activePowerUp.remainingMs <= 0) {
        player.activePowerUp = null;
      }
    }
  }

  // Update sticky patches
  state.stickyPatches = state.stickyPatches.filter(sp => {
    sp.remainingMs -= dt;
    return sp.remainingMs > 0;
  });

  // Update decoys with full player-like movement (gravity, jumps,
  // platform collision) driven by wander brains, so clones move
  // indistinguishably from real players.
  const nowMs = Date.now();
  const frameScale = dt / (1000 / 60);
  const aliveDecoys: Decoy[] = [];
  for (const d of state.decoys) {
    d.remainingMs -= dt;
    if (d.remainingMs <= 0) {
      delete state.decoyBrains[d.id];
      continue;
    }
    let brain = state.decoyBrains[d.id];
    if (!brain) {
      brain = state.decoyBrains[d.id] = { dir: 0, decideAt: 0, jumpFrames: 0, lastX: d.x, stuckFrames: 0 };
    }
    if (nowMs >= brain.decideAt) {
      const roll = Math.random();
      brain.dir = roll < 0.35 ? -1 : roll < 0.7 ? 1 : 0;
      if (roll > 0.75) {
        if (isGrounded(d, state.map)) d.vy = -PLAYER_JUMP_SPEED;
        else brain.jumpFrames = 8;
      }
      brain.decideAt = nowMs + 350 + Math.random() * 850;
    }
    if (Math.abs(d.x - brain.lastX) < 1 && brain.dir !== 0) brain.stuckFrames++;
    else brain.stuckFrames = 0;
    brain.lastX = d.x;
    if (brain.stuckFrames > 30) {
      brain.stuckFrames = 0;
      brain.jumpFrames = 6;
      brain.dir = brain.dir === 1 ? -1 : 1;
    }

    let dspeed = PLAYER_MOVE_SPEED;
    const dcx = d.x + PLAYER_SIZE;
    const dcy = d.y + PLAYER_SIZE;
    for (const patch of state.stickyPatches) {
      const sdx = dcx - patch.x;
      const sdy = dcy - patch.y;
      if (Math.sqrt(sdx * sdx + sdy * sdy) < STICKY_PATCH_RADIUS) {
        dspeed *= STICKY_SLOW_MULTIPLIER;
      }
    }

    if (brain.jumpFrames > 0 && isGrounded(d, state.map)) {
      d.vy = -PLAYER_JUMP_SPEED;
    }
    if (brain.jumpFrames > 0) brain.jumpFrames -= 1;

    d.vx = brain.dir * dspeed * frameScale;
    d.vy = Math.min(MAX_FALL_SPEED, d.vy + GRAVITY * frameScale);
    const dnx = d.x + d.vx;
    if (!collidesWithObstacles(dnx, d.y, state.map.obstacles)) {
      d.x = dnx;
    } else {
      d.vx = 0;
    }
    moveVertically(d, d.y + d.vy * frameScale, state.map);
    d.x = Math.max(0, Math.min(state.map.width - PLAYER_SIZE * 2, d.x));
    d.y = Math.max(0, Math.min(state.map.height - PLAYER_SIZE * 2, d.y));
    if (d.y >= state.map.height - PLAYER_SIZE * 2) d.vy = 0;
    aliveDecoys.push(d);
  }
  state.decoys = aliveDecoys;

  // Move players
  for (let i = 0; i < state.players.length; i++) {
    const player = state.players[i];
    const input = inputs[i] ?? ZERO_INPUT;

    if (!player.alive) continue;

    // Check if frozen
    const isFrozen = player.activePowerUp?.type === "freeze_pulse";
    const isGhost = player.activePowerUp?.type === "ghost_step";

    let speed = PLAYER_MOVE_SPEED;
    if (player.activePowerUp?.type === "speed_surge") {
      speed *= SPEED_SURGE_MULTIPLIER;
    }

    // Check sticky patches (center-to-center, matches server)
    const pcx = player.x + PLAYER_SIZE;
    const pcy = player.y + PLAYER_SIZE;
    for (const patch of state.stickyPatches) {
      const sdx = pcx - patch.x;
      const sdy = pcy - patch.y;
      if (Math.sqrt(sdx * sdx + sdy * sdy) < STICKY_PATCH_RADIUS) {
        speed *= STICKY_SLOW_MULTIPLIER;
      }
    }

    const frameScale = dt / (1000 / 60);
    let dx = 0;
    if (!isFrozen) {
      if (input.left) dx -= speed * frameScale;
      if (input.right) dx += speed * frameScale;
      if (dx !== 0) player.facing = { x: Math.sign(dx), y: 0 };
      if (input.up && isGrounded(player, state.map)) {
        player.vy = -PLAYER_JUMP_SPEED;
      }
    }

    player.vx = dx;
    player.vy = Math.min(MAX_FALL_SPEED, player.vy + GRAVITY * frameScale);

    const newX = player.x + player.vx;
    if (!collidesWithObstacles(newX, player.y, state.map.obstacles)) {
      player.x = newX;
    } else {
      player.vx = 0;
    }

    const newY = player.y + player.vy * frameScale;
    moveVertically(player, newY, state.map, isGhost);

    // Clamp to map
    player.x = Math.max(0, Math.min(state.map.width - PLAYER_SIZE * 2, player.x));
    player.y = Math.max(0, Math.min(state.map.height - PLAYER_SIZE * 2, player.y));
    if (player.y >= state.map.height - PLAYER_SIZE * 2) player.vy = 0;
  }

  // Update visual events
  if (state.events) {
    state.events = state.events.filter(ev => {
      ev.remainingMs -= dt;
      return ev.remainingMs > 0;
    });
  } else {
    state.events = [];
  }

  // Power-up pickup (always fires instantly, no cooldown)
  for (const player of state.players) {
    for (let si = state.spawns.length - 1; si >= 0; si--) {
      const spawn = state.spawns[si];
      if (dist(player, spawn) < POWER_UP_PICKUP_RADIUS) {
        activatePowerUp(state, player, spawn.type);
        const config = POWER_UP_CONFIGS[spawn.type];

        state.events.push({
          id: `ev_${Date.now()}_${Math.random()}`,
          type: "pickup",
          text: `+ ${config.icon} ${config.name.toUpperCase()}!`,
          x: player.x + PLAYER_SIZE,
          y: player.y - 12,
          color: config.color,
          remainingMs: 1400,
          maxMs: 1400,
        });
        state.spawns.splice(si, 1);
      }
    }
  }

  // Tag check
  const itPlayer = state.players.find(p => p.isIt);
  if (itPlayer) {
    const itCx = itPlayer.x + PLAYER_SIZE;
    const itCy = itPlayer.y + PLAYER_SIZE;

    if (state.tagLocked) {
      let stillOverlapping = false;
      for (const other of state.players) {
        if (other.id === itPlayer.id) continue;
        if (!other.alive) continue;
        if (dist(itPlayer, other) < TAG_RADIUS) {
          stillOverlapping = true;
          break;
        }
      }
      if (!stillOverlapping) {
        state.tagLocked = false;
      }
    }

    if (!state.tagLocked) {
      for (const other of state.players) {
        if (other.id === itPlayer.id) continue;
        if (!other.alive) continue;

        if (dist(itPlayer, other) < TAG_RADIUS) {
          const otherCx = other.x + PLAYER_SIZE;
          const otherCy = other.y + PLAYER_SIZE;

          // Check line-of-sight cover (solid platform or cover tree)
          if (!hasLineOfSight(itCx, itCy, otherCx, otherCy, state.map.obstacles)) {
            // Visual indicator for blocked tag behind cover (throttled)
            if (!state.events.some(e => e.type === "cover_block" && e.remainingMs > 800)) {
              state.events.push({
                id: `ev_${Date.now()}`,
                type: "cover_block",
                text: "🌳 COVER BLOCKED!",
                x: (itCx + otherCx) / 2,
                y: Math.min(itCy, otherCy) - 16,
                color: "#2ED573",
                remainingMs: 1000,
                maxMs: 1000,
              });
            }
            continue;
          }

          // Check safe bubble
          if (other.activePowerUp?.type === "safe_bubble") {
            other.activePowerUp = null;
            state.events.push({
              id: `ev_${Date.now()}`,
              type: "shield_block",
              text: "🛡️ SHIELD BLOCKED!",
              x: otherCx,
              y: other.y - 16,
              color: "#2ED573",
              remainingMs: 1200,
              maxMs: 1200,
            });
            continue;
          }

          // Swap pressure roles, then wait for separation before swapping again.
          itPlayer.isIt = false;
          other.isIt = true;
          itPlayer.score += 1;
          state.tagLocked = true;

          state.events.push({
            id: `ev_${Date.now()}_tag`,
            type: "tag",
            text: `⚡ ${itPlayer.name} PASSED PRESSURE TO ${other.name}!`,
            x: (itCx + otherCx) / 2,
            y: Math.min(itCy, otherCy) - 24,
            color: "#FF4757",
            remainingMs: 1600,
            maxMs: 1600,
          });
          break;
        }
      }
    }
  }
}

export function activatePowerUp(
  state: LocalGameState,
  player: PlayerState,
  type: PowerUpType
): void {
  switch (type) {
    case "speed_surge":
      player.activePowerUp = {
        type,
        remainingMs: POWER_UP_CONFIGS.speed_surge.durationMs,
        durationMs: POWER_UP_CONFIGS.speed_surge.durationMs,
      };
      break;

    case "freeze_pulse": {
      let closest: PlayerState | null = null;
      let closestDist = Infinity;
      for (const other of state.players) {
        if (other.id === player.id) continue;
        const d = dist(player, other);
        if (d < FREEZE_RADIUS && d < closestDist) {
          closestDist = d;
          closest = other;
        }
      }
      if (closest) {
        closest.activePowerUp = {
          type: "freeze_pulse",
          remainingMs: POWER_UP_CONFIGS.freeze_pulse.durationMs,
          durationMs: POWER_UP_CONFIGS.freeze_pulse.durationMs,
        };
      } else {
        // Fizzle feedback: orb fires but nobody is in range
        state.events.push({
          id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: "freeze",
          text: "❄ NO ONE IN RANGE!",
          x: player.x + PLAYER_SIZE,
          y: player.y - 34,
          color: "#00BFFF",
          remainingMs: 1200,
          maxMs: 1200,
        });
      }
      break;
    }

    case "ghost_step":
      player.activePowerUp = {
        type,
        remainingMs: POWER_UP_CONFIGS.ghost_step.durationMs,
        durationMs: POWER_UP_CONFIGS.ghost_step.durationMs,
      };
      break;

    case "blink_dash": {
      const dashX = player.x + player.facing.x * BINK_DASH_DISTANCE;
      const dashY = player.y + player.facing.y * BINK_DASH_DISTANCE;
      const clampedX = Math.max(0, Math.min(state.map.width - PLAYER_SIZE * 2, dashX));
      const clampedY = Math.max(0, Math.min(state.map.height - PLAYER_SIZE * 2, dashY));
      if (!collidesWithObstacles(clampedX, clampedY, state.map.obstacles)) {
        player.x = clampedX;
        player.y = clampedY;
      }
      break;
    }

    case "mirror_decoy":
      state.decoys.push({
        id: `decoy_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ownerId: player.id,
        x: player.x,
        y: player.y,
        vx: player.vx,
        vy: player.vy,
        remainingMs: POWER_UP_CONFIGS.mirror_decoy.durationMs,
      });
      break;

    case "safe_bubble":
      player.activePowerUp = {
        type,
        remainingMs: POWER_UP_CONFIGS.safe_bubble.durationMs,
        durationMs: POWER_UP_CONFIGS.safe_bubble.durationMs,
      };
      break;

    case "sticky_patch": {
      // Drop behind the runner (outside the slow radius) so the
      // dropper isn't instantly slowed by their own goo.
      const behind = STICKY_PATCH_RADIUS + PLAYER_SIZE;
      const px = player.x + PLAYER_SIZE - player.facing.x * behind;
      const py = player.y + PLAYER_SIZE - player.facing.y * behind;
      state.stickyPatches.push({
        id: `sticky_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        x: Math.max(0, Math.min(state.map.width, px)),
        y: Math.max(0, Math.min(state.map.height, py)),
        remainingMs: POWER_UP_CONFIGS.sticky_patch.durationMs,
      });
      break;
    }
  }
}
