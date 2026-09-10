import {
  type PlayerState,
  type PowerUpSpawn,
  type StickyPatch,
  type Decoy,
  type GameMap,
  POWER_UP_CONFIGS,
  POWER_UP_INDEX_TO_TYPE,
  PLAYER_SIZE,
} from "chase-tag-shared";
import type { LocalGameState, VisualEvent } from "./engine.js";

// Helper descriptions for the in-game Power-Up HUD
const POWER_UP_EFFECT_DESCRIPTIONS: Record<string, string> = {
  speed_surge: "RUN FASTER (1.8x SPEED BOOST!)",
  freeze_pulse: "FREEZES NEAREST OPPONENT!",
  ghost_step: "INVISIBLE TO OPPONENTS!",
  blink_dash: "WARP DASH FORWARD!",
  mirror_decoy: "SPAWNS RUNNING FAKE CLONE!",
  safe_bubble: "SHIELD: BLOCKS 1 TAG ATTEMPT!",
  sticky_patch: "DROPPED SLOW GOO PUDDLE!",
};

// Normalize players list whether MapSchema or Array
export function extractPlayers(playersData: any): PlayerState[] {
  if (!playersData) return [];
  const list: PlayerState[] = [];
  if (typeof playersData.forEach === "function") {
    playersData.forEach((p: any) => {
      list.push({
        id: p.id,
        name: p.name,
        x: p.x ?? 0,
        y: p.y ?? 0,
        vx: p.vx ?? 0,
        vy: p.vy ?? 0,
        isIt: !!p.isIt,
        alive: p.alive ?? true,
        facing: { x: p.facingX ?? p.facing?.x ?? 1, y: p.facingY ?? p.facing?.y ?? 0 },
        color: p.color || "#FF6B6B",
        score: p.score ?? 0,
        ready: !!p.ready,
        activePowerUp: p.activePowerUpType !== undefined && p.activePowerUpType >= 0 ? {
          type: POWER_UP_INDEX_TO_TYPE[p.activePowerUpType] ?? "speed_surge",
          remainingMs: p.activePowerUpRemaining ?? 0,
          durationMs: p.activePowerUpDuration ?? 1,
        } : (p.activePowerUp ?? null),
        powerUpCooldown: p.powerUpCooldown ?? 0,
        heldPowerUp: p.heldPowerUp !== undefined && p.heldPowerUp >= 0
          ? POWER_UP_INDEX_TO_TYPE[p.heldPowerUp]
          : (p.heldPowerUp ?? null),
        lastSeq: p.lastProcessedTick ?? p.lastSeq ?? 0,
        lastProcessedTick: p.lastProcessedTick ?? p.lastSeq ?? 0,
      });
    });
  }
  return list;
}

// Normalize spawns
export function extractSpawns(spawnsData: any): PowerUpSpawn[] {
  if (!spawnsData) return [];
  const list: PowerUpSpawn[] = [];
  if (typeof spawnsData.forEach === "function") {
    spawnsData.forEach((s: any) => {
      const type = typeof s.type === "number" ? POWER_UP_INDEX_TO_TYPE[s.type] : s.type;
      list.push({
        id: s.id,
        type: type ?? "speed_surge",
        x: s.x,
        y: s.y,
        respawnTimer: s.respawnTimer ?? 0,
      });
    });
  }
  return list;
}

// Normalize sticky patches
export function extractSticky(stickyData: any): StickyPatch[] {
  if (!stickyData) return [];
  if (Array.isArray(stickyData)) return stickyData;
  const list: StickyPatch[] = [];
  if (typeof stickyData.forEach === "function") {
    stickyData.forEach((s: any) => list.push(s));
  }
  return list;
}

// Normalize decoys
export function extractDecoys(decoysData: any): Decoy[] {
  if (!decoysData) return [];
  if (Array.isArray(decoysData)) return decoysData;
  const list: Decoy[] = [];
  if (typeof decoysData.forEach === "function") {
    decoysData.forEach((d: any) => list.push(d));
  }
  return list;
}

export function renderGame(
  ctx: CanvasRenderingContext2D,
  rawState: LocalGameState | any,
  canvasW: number,
  canvasH: number,
  overrideMap?: GameMap
) {
  const map: GameMap = overrideMap || rawState.map;
  if (!map) return;

  const players = extractPlayers(rawState.players);
  const spawns = extractSpawns(rawState.spawns);
  const stickyPatches = extractSticky(rawState.stickyPatches);
  const decoys = extractDecoys(rawState.decoys);
  const events: VisualEvent[] = rawState.events ?? [];

  // Fill the entire canvas with the arena instead of letterboxing it.
  const scaleX = canvasW / map.width;
  const scaleY = canvasH / map.height;

  ctx.fillStyle = "#0e0c1f";
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.save();
  ctx.scale(scaleX, scaleY);

  // Outer arena shadow
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 15;
  ctx.fillStyle = "#161333";
  ctx.fillRect(0, 0, map.width, map.height);
  ctx.restore();

  // Clip strictly inside the arena bounds
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, map.width, map.height);
  ctx.clip();

  // 1. THEMED CARTOON BACKGROUND
  renderThemedBackground(ctx, map);

  // 2. DECORATIVE BACKGROUND SCENERY (Non-blocking)
  if (map.scenery) {
    for (const prop of map.scenery) {
      renderSceneryProp(ctx, prop.type, prop.x, prop.y, prop.scale ?? 1);
    }
  }

  // 3. OBSTACLES: PLATFORMS & SOLID COVER
  for (const o of map.obstacles) {
    if (o.x < 0 || o.x >= map.width) continue;
    if (o.type === "cover_tree") {
      renderSolidCover(ctx, map, o.x, o.y, o.w, o.h);
    } else {
      renderArcadePlatform(ctx, map, o.x, o.y, o.w, o.h);
    }
  }

  // 4. STICKY GOO PUDDLES
  const now = Date.now();
  for (const sp of stickyPatches) {
    const alpha = Math.min(1, sp.remainingMs / 1000);
    const wobble = Math.sin(now / 160 + sp.x) * 3;

    ctx.save();
    // Outer gooey amber puddle
    ctx.fillStyle = `rgba(217, 119, 6, ${alpha * 0.5})`;
    ctx.beginPath();
    ctx.ellipse(sp.x, sp.y, 44 + wobble, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright slime core
    ctx.fillStyle = `rgba(245, 158, 11, ${alpha * 0.8})`;
    ctx.beginPath();
    ctx.ellipse(sp.x, sp.y, 32, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    // Slime bubbles
    ctx.fillStyle = `rgba(254, 240, 138, ${alpha * 0.9})`;
    ctx.beginPath();
    ctx.arc(sp.x - 14, sp.y - 3, 5, 0, Math.PI * 2);
    ctx.arc(sp.x + 12, sp.y + 2, 6, 0, Math.PI * 2);
    ctx.arc(sp.x + 2, sp.y - 5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 5. POWER-UP PICKUPS (Large, glowing, animated orbs)
  for (const spawn of spawns) {
    const config = POWER_UP_CONFIGS[spawn.type];
    if (!config) continue;

    const bob = Math.sin(now / 200 + spawn.x) * 6;
    const cy = spawn.y + bob;

    ctx.save();
    // Glowing radial aura
    const pulse = 0.55 + Math.sin(now / 160 + spawn.y) * 0.3;
    ctx.fillStyle = config.color;
    ctx.globalAlpha = pulse * 0.45;
    ctx.beginPath();
    ctx.arc(spawn.x, cy, 32, 0, Math.PI * 2);
    ctx.fill();

    // Rotating dashed orbital ring
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = config.color;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(spawn.x, cy, 22, (now / 350) % (Math.PI * 2), ((now / 350) % (Math.PI * 2)) + Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Solid core orb with white rim
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#121026";
    ctx.beginPath();
    ctx.arc(spawn.x, cy, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = config.color;
    ctx.beginPath();
    ctx.arc(spawn.x, cy, 16, 0, Math.PI * 2);
    ctx.fill();

    // Top glossy highlight
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.beginPath();
    ctx.arc(spawn.x - 4, cy - 5, 7, 0, Math.PI * 2);
    ctx.fill();

    // Power-up emoji icon badge
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(config.icon, spawn.x, cy + 1);

    // Floating text label beneath orb
    ctx.font = "800 11px 'Fredoka', sans-serif";
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 4;
    ctx.fillText(config.name.toUpperCase(), spawn.x, cy + 32);
    ctx.restore();
  }

  // 6. DECOYS
  for (const decoy of decoys) {
    const owner = players.find(p => p.id === decoy.ownerId);
    const color = owner?.color || "#9C88FF";
    const alpha = Math.min(1, decoy.remainingMs / 1000);

    ctx.save();
    ctx.globalAlpha = alpha * 0.6;
    if (Math.random() > 0.65) {
      ctx.translate((Math.random() - 0.5) * 5, 0);
    }
    drawCartoonPlayer(ctx, decoy.x, decoy.y, color, false, false, { x: -1, y: 0 }, "CLONE");
    ctx.restore();
  }

  // 7. PLAYERS
  for (const player of players) {
    const isGhost = player.activePowerUp?.type === "ghost_step";
    const isFrozen = player.activePowerUp?.type === "freeze_pulse";
    const hasBubble = player.activePowerUp?.type === "safe_bubble";
    const hasSpeed = player.activePowerUp?.type === "speed_surge";

    ctx.save();

    // Speed surge wind lines / trail
    if (hasSpeed) {
      ctx.fillStyle = "rgba(255, 209, 59, 0.45)";
      const trailDx = -(player.facing?.x ?? 1) * 14;
      ctx.beginPath();
      ctx.ellipse(player.x + PLAYER_SIZE + trailDx, player.y + PLAYER_SIZE + 4, PLAYER_SIZE * 1.1, PLAYER_SIZE * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (isGhost) {
      ctx.globalAlpha = 0.28;
    }

    drawCartoonPlayer(
      ctx,
      player.x,
      player.y,
      player.color,
      player.isIt,
      isFrozen,
      player.facing,
      player.name
    );

    // Safe Bubble Shield (Luminous green sphere)
    if (hasBubble) {
      const bRad = PLAYER_SIZE + 12 + Math.sin(now / 140) * 2;
      const bcx = player.x + PLAYER_SIZE;
      const bcy = player.y + PLAYER_SIZE;

      ctx.save();
      const grad = ctx.createRadialGradient(bcx - 5, bcy - 5, 3, bcx, bcy, bRad);
      grad.addColorStop(0, "rgba(46, 213, 115, 0.15)");
      grad.addColorStop(0.7, "rgba(46, 213, 115, 0.35)");
      grad.addColorStop(1, "rgba(46, 213, 115, 0.9)");

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(bcx, bcy, bRad, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#2ED573";
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Shield gloss reflection
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.beginPath();
      ctx.ellipse(bcx - bRad * 0.45, bcy - bRad * 0.45, 6, 3, -Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  // 8. FLOATING VISUAL FEEDBACK POPUPS
  for (const ev of events) {
    const progress = 1 - ev.remainingMs / ev.maxMs;
    const rise = progress * 32;
    const alpha = Math.min(1, ev.remainingMs / 300);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "900 13px 'Fredoka', sans-serif";
    ctx.textAlign = "center";

    const textW = ctx.measureText(ev.text).width + 16;
    const boxX = ev.x - textW / 2;
    const boxY = ev.y - rise - 18;

    // Popup Pill
    ctx.fillStyle = "#121026";
    ctx.beginPath();
    roundRectPath(ctx, boxX, boxY, textW, 22, 7);
    ctx.fill();

    ctx.strokeStyle = ev.color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = ev.color;
    ctx.fillText(ev.text, ev.x, boxY + 15);
    ctx.restore();
  }

  // End stage clipping
  ctx.restore();

  // Chunky cartoon arena border outline
  ctx.strokeStyle = "#0E0C22";
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, map.width, map.height);

  ctx.restore();
}

/* ==========================================================================
   THEMED CARTOON BACKGROUND RENDERING
   ========================================================================== */
function renderThemedBackground(ctx: CanvasRenderingContext2D, map: GameMap) {
  if (map.theme === "neon_rooftops") {
    renderNeonRooftopBackground(ctx, map);
  } else if (map.theme === "desert_ruins") {
    renderDesertRuinsBackground(ctx, map);
  } else {
    renderSunnyCartoonBackground(ctx, map);
  }
}

function renderSunnyCartoonBackground(ctx: CanvasRenderingContext2D, map: GameMap) {
  // Bright cheerful blue daylight sky
  const skyGrad = ctx.createLinearGradient(0, 0, 0, map.height);
  skyGrad.addColorStop(0, "#38BDF8");  // Vibrant sky blue
  skyGrad.addColorStop(0.55, "#7DD3FC"); // Light cyan
  skyGrad.addColorStop(0.85, "#E0F2FE"); // Soft horizon glow
  skyGrad.addColorStop(1, "#BAE6FD");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, map.width, map.height);

  // Radiant cartoon sun in top right
  ctx.save();
  ctx.fillStyle = "rgba(254, 240, 138, 0.4)";
  ctx.beginPath();
  ctx.arc(map.width * 0.86, 110, 85, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#FDE047";
  ctx.beginPath();
  ctx.arc(map.width * 0.86, 110, 48, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Distant rolling green hills (Layer 1 - Soft teal green)
  ctx.fillStyle = "#6EE7B7";
  ctx.beginPath();
  ctx.ellipse(map.width * 0.22, map.height * 0.94, map.width * 0.38, 160, 0, 0, Math.PI * 2);
  ctx.fill();

  // Distant rolling hills (Layer 2 - Lush emerald green)
  ctx.fillStyle = "#34D399";
  ctx.beginPath();
  ctx.ellipse(map.width * 0.78, map.height * 0.95, map.width * 0.42, 140, 0, 0, Math.PI * 2);
  ctx.fill();

  // Fluffy white cartoon clouds
  drawCartoonCloud(ctx, map.width * 0.12, 110, 1);
  drawCartoonCloud(ctx, map.width * 0.48, 90, 1.25);
  drawCartoonCloud(ctx, map.width * 0.78, 160, 0.85);
}

function renderNeonRooftopBackground(ctx: CanvasRenderingContext2D, map: GameMap) {
  const skyGrad = ctx.createLinearGradient(0, 0, 0, map.height);
  skyGrad.addColorStop(0, "#10051F");
  skyGrad.addColorStop(0.5, "#26104A");
  skyGrad.addColorStop(1, "#0F172A");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, map.width, map.height);

  // Giant moon glow
  ctx.fillStyle = "rgba(125, 211, 252, 0.18)";
  ctx.beginPath();
  ctx.arc(map.width * 0.78, 105, 92, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#BAE6FD";
  ctx.beginPath();
  ctx.arc(map.width * 0.78, 105, 50, 0, Math.PI * 2);
  ctx.fill();

  // Distant skyline blocks
  const horizon = map.height * 0.72;
  for (let i = 0; i < 11; i++) {
    const bw = 85 + (i % 3) * 25;
    const bh = 130 + (i % 4) * 34;
    const x = i * 118 - 20;
    ctx.fillStyle = i % 2 === 0 ? "#1E1B4B" : "#312E81";
    ctx.fillRect(x, horizon - bh, bw, bh);

    ctx.fillStyle = i % 2 === 0 ? "#22D3EE" : "#F0ABFC";
    for (let wx = x + 14; wx < x + bw - 12; wx += 24) {
      for (let wy = horizon - bh + 20; wy < horizon - 20; wy += 28) {
        if ((wx + wy) % 3 !== 0) ctx.fillRect(wx, wy, 9, 12);
      }
    }
  }

  // Neon street haze
  ctx.fillStyle = "rgba(236, 72, 153, 0.12)";
  ctx.fillRect(0, horizon - 8, map.width, map.height - horizon + 8);
}

function renderDesertRuinsBackground(ctx: CanvasRenderingContext2D, map: GameMap) {
  const skyGrad = ctx.createLinearGradient(0, 0, 0, map.height);
  skyGrad.addColorStop(0, "#FB923C");
  skyGrad.addColorStop(0.48, "#FDBA74");
  skyGrad.addColorStop(1, "#FEF3C7");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, map.width, map.height);

  // Hot desert sun
  ctx.fillStyle = "rgba(251, 191, 36, 0.28)";
  ctx.beginPath();
  ctx.arc(map.width * 0.18, 120, 95, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FDE68A";
  ctx.beginPath();
  ctx.arc(map.width * 0.18, 120, 48, 0, Math.PI * 2);
  ctx.fill();

  // Distant dunes
  ctx.fillStyle = "#FCD34D";
  ctx.beginPath();
  ctx.ellipse(map.width * 0.28, map.height * 0.9, map.width * 0.46, 140, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#D97706";
  ctx.beginPath();
  ctx.ellipse(map.width * 0.82, map.height * 0.92, map.width * 0.5, 130, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ruined temple silhouettes
  ctx.fillStyle = "rgba(120, 53, 15, 0.35)";
  for (let x = 120; x < map.width; x += 320) {
    ctx.fillRect(x, map.height * 0.5, 36, map.height * 0.24);
    ctx.fillRect(x + 62, map.height * 0.54, 36, map.height * 0.2);
    ctx.fillRect(x - 18, map.height * 0.49, 134, 16);
  }
}

function drawCartoonCloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.arc(24, -12, 22, 0, Math.PI * 2);
  ctx.arc(50, 0, 26, 0, Math.PI * 2);
  ctx.arc(24, 10, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ==========================================================================
   DECORATIVE SCENERY (Non-blocking)
   ========================================================================== */
function renderSceneryProp(ctx: CanvasRenderingContext2D, type: string, x: number, y: number, scale = 1) {
  if (type === "tree") {
    renderDecorativeTree(ctx, x, y, scale);
  } else if (type === "bush") {
    renderDecorativeBush(ctx, x, y, scale);
  } else if (type === "billboard") {
    renderBillboard(ctx, x, y, scale);
  } else if (type === "antenna") {
    renderAntenna(ctx, x, y, scale);
  } else if (type === "sign") {
    renderNeonSign(ctx, x, y, scale);
  } else if (type === "crate") {
    renderSupplyCrate(ctx, x, y, scale);
  } else if (type === "cactus") {
    renderCactus(ctx, x, y, scale);
  } else if (type === "rock") {
    renderRockPile(ctx, x, y, scale);
  } else if (type === "obelisk") {
    renderObelisk(ctx, x, y, scale);
  }
}

function renderDecorativeTree(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Slender wood trunk
  ctx.fillStyle = "#B45309";
  ctx.fillRect(-6, -42, 12, 42);
  ctx.strokeStyle = "#78350F";
  ctx.lineWidth = 2;
  ctx.strokeRect(-6, -42, 12, 42);

  // Lush round canopy layers
  ctx.fillStyle = "#10B981";
  ctx.beginPath();
  ctx.arc(0, -64, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#065F46";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Lighter top leaf puff
  ctx.fillStyle = "#34D399";
  ctx.beginPath();
  ctx.arc(-6, -72, 16, 0, Math.PI * 2);
  ctx.arc(8, -70, 14, 0, Math.PI * 2);
  ctx.fill();

  // Cute red berries
  ctx.fillStyle = "#EF4444";
  ctx.beginPath();
  ctx.arc(-10, -60, 3.5, 0, Math.PI * 2);
  ctx.arc(10, -62, 3.5, 0, Math.PI * 2);
  ctx.arc(0, -50, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function renderDecorativeBush(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#10B981";
  ctx.beginPath();
  ctx.arc(-10, -10, 14, 0, Math.PI * 2);
  ctx.arc(10, -10, 14, 0, Math.PI * 2);
  ctx.arc(0, -18, 16, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#065F46";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function renderBillboard(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#0F172A";
  ctx.fillRect(-42, -70, 84, 48);
  ctx.strokeStyle = "#22D3EE";
  ctx.lineWidth = 4;
  ctx.strokeRect(-42, -70, 84, 48);
  ctx.fillStyle = "#F0ABFC";
  ctx.font = "900 13px 'Fredoka', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("TAG!", 0, -42);
  ctx.fillStyle = "#334155";
  ctx.fillRect(-24, -22, 10, 22);
  ctx.fillRect(14, -22, 10, 22);
  ctx.restore();
}

function renderAntenna(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.strokeStyle = "#CBD5E1";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -86);
  ctx.moveTo(-28, -58);
  ctx.lineTo(28, -78);
  ctx.moveTo(-22, -78);
  ctx.lineTo(22, -58);
  ctx.stroke();
  ctx.strokeStyle = "#22D3EE";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -86, 18, -0.7, 0.7);
  ctx.arc(0, -86, 30, -0.7, 0.7);
  ctx.stroke();
  ctx.restore();
}

function renderNeonSign(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#111827";
  ctx.beginPath();
  roundRectPath(ctx, -34, -50, 68, 34, 7);
  ctx.fill();
  ctx.strokeStyle = "#EC4899";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.font = "900 18px 'Fredoka', sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#67E8F9";
  ctx.fillText("GO", 0, -27);
  ctx.restore();
}

function renderSupplyCrate(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#92400E";
  ctx.fillRect(-22, -28, 44, 28);
  ctx.fillStyle = "#B45309";
  ctx.fillRect(-18, -24, 36, 20);
  ctx.strokeStyle = "#0F172A";
  ctx.lineWidth = 3;
  ctx.strokeRect(-22, -28, 44, 28);
  ctx.beginPath();
  ctx.moveTo(-18, -24);
  ctx.lineTo(18, -4);
  ctx.moveTo(18, -24);
  ctx.lineTo(-18, -4);
  ctx.stroke();
  ctx.restore();
}

function renderCactus(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.strokeStyle = "#0F172A";
  ctx.lineWidth = 3;
  ctx.fillStyle = "#16A34A";
  ctx.beginPath();
  roundRectPath(ctx, -8, -68, 16, 68, 8);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  roundRectPath(ctx, -34, -46, 14, 36, 7);
  roundRectPath(ctx, 20, -54, 14, 42, 7);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#86EFAC";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -60);
  ctx.lineTo(0, -10);
  ctx.stroke();
  ctx.restore();
}

function renderRockPile(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#78716C";
  ctx.beginPath();
  ctx.ellipse(-16, -10, 20, 12, -0.2, 0, Math.PI * 2);
  ctx.ellipse(10, -13, 24, 15, 0.15, 0, Math.PI * 2);
  ctx.ellipse(0, -25, 18, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#292524";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function renderObelisk(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#D6A15D";
  ctx.beginPath();
  ctx.moveTo(0, -96);
  ctx.lineTo(28, -68);
  ctx.lineTo(20, 0);
  ctx.lineTo(-20, 0);
  ctx.lineTo(-28, -68);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#78350F";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  ctx.fillRect(-8, -62, 7, 44);
  ctx.restore();
}

/* ==========================================================================
   SOLID COVER TREES (Interact with gameplay & block tags)
   ========================================================================== */
function renderSolidCover(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  x: number,
  y: number,
  w: number,
  h: number
) {
  if (map.theme === "neon_rooftops") {
    renderSolidNeonColumn(ctx, x, y, w, h);
  } else if (map.theme === "desert_ruins") {
    renderSolidStonePillar(ctx, x, y, w, h);
  } else {
    renderSolidCoverTree(ctx, x, y, w, h);
  }
}

function renderSolidCoverTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const cx = x + w / 2;
  const bottomY = y + h;

  ctx.save();
  // 1. Sturdy Stone Base (Root Anchor)
  ctx.fillStyle = "#64748B";
  ctx.beginPath();
  roundRectPath(ctx, x - 4, bottomY - 10, w + 8, 10, 4);
  ctx.fill();
  ctx.strokeStyle = "#0F172A";
  ctx.lineWidth = 2;
  ctx.stroke();

  // 2. Thick Solid Wood Trunk (The actual physical cover obstacle)
  ctx.fillStyle = "#854D0E";
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h - 8, 6);
  ctx.fill();

  // Wood bark ridges
  ctx.fillStyle = "#713F12";
  ctx.fillRect(x + 4, y + 8, 4, h - 24);
  ctx.fillRect(x + w - 8, y + 14, 4, h - 30);

  ctx.strokeStyle = "#0F172A";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h - 8, 6);
  ctx.stroke();

  // 3. Dense Protective Foliage Canopy
  ctx.fillStyle = "#059669";
  ctx.beginPath();
  ctx.arc(cx, y - 10, 26, 0, Math.PI * 2);
  ctx.arc(cx - 16, y, 20, 0, Math.PI * 2);
  ctx.arc(cx + 16, y, 20, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#064E3B";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // 4. "COVER 🛡️" Badge on trunk so players immediately know it provides tag cover
  ctx.fillStyle = "#1E293B";
  ctx.beginPath();
  roundRectPath(ctx, cx - 22, y + 14, 44, 18, 5);
  ctx.fill();
  ctx.strokeStyle = "#2ED573";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = "900 9px 'Fredoka', sans-serif";
  ctx.fillStyle = "#2ED573";
  ctx.textAlign = "center";
  ctx.fillText("COVER 🛡️", cx, y + 26);

  ctx.restore();
}

function renderSolidNeonColumn(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const cx = x + w / 2;
  ctx.save();
  ctx.fillStyle = "#111827";
  ctx.beginPath();
  roundRectPath(ctx, x - 3, y, w + 6, h, 5);
  ctx.fill();
  ctx.strokeStyle = "#22D3EE";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = "rgba(236, 72, 153, 0.7)";
  ctx.fillRect(cx - 3, y + 8, 6, h - 18);
  ctx.fillStyle = "#0F172A";
  ctx.beginPath();
  roundRectPath(ctx, cx - 22, y + 15, 44, 18, 5);
  ctx.fill();
  ctx.strokeStyle = "#F0ABFC";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.font = "900 9px 'Fredoka', sans-serif";
  ctx.fillStyle = "#F0ABFC";
  ctx.textAlign = "center";
  ctx.fillText("COVER 🛡️", cx, y + 27);
  ctx.restore();
}

function renderSolidStonePillar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const cx = x + w / 2;
  ctx.save();
  ctx.fillStyle = "#A16207";
  ctx.fillRect(x - 6, y + h - 10, w + 12, 10);
  ctx.fillStyle = "#D6A15D";
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h - 8, 4);
  ctx.fill();
  ctx.fillStyle = "rgba(120, 53, 15, 0.25)";
  ctx.fillRect(x + 5, y + 8, 5, h - 24);
  ctx.fillRect(x + w - 11, y + 12, 5, h - 28);
  ctx.strokeStyle = "#78350F";
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x, y, w, h - 8);
  ctx.fillStyle = "#451A03";
  ctx.beginPath();
  roundRectPath(ctx, cx - 22, y + 14, 44, 18, 5);
  ctx.fill();
  ctx.strokeStyle = "#FDE68A";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.font = "900 9px 'Fredoka', sans-serif";
  ctx.fillStyle = "#FDE68A";
  ctx.textAlign = "center";
  ctx.fillText("COVER 🛡️", cx, y + 26);
  ctx.restore();
}

/* ==========================================================================
   CHUNKY ARCADE PLATFORMS
   ========================================================================== */
function renderArcadePlatform(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const turfH = 9;
  const bodyH = h - turfH;
  const palette = map.theme === "neon_rooftops"
    ? { body: "#1E1B4B", shade: "#0F172A", top: "#22D3EE", teeth: "#EC4899", outline: "#0E0C22" }
    : map.theme === "desert_ruins"
      ? { body: "#A16207", shade: "#78350F", top: "#FCD34D", teeth: "#D97706", outline: "#451A03" }
      : { body: "#78350F", shade: "#451A03", top: "#22C55E", teeth: "#15803D", outline: "#0E0C22" };

  // Platform 3D Drop Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.beginPath();
  roundRectPath(ctx, x, y + 4, w, h, 6);
  ctx.fill();

  // Platform sturdy body
  ctx.fillStyle = palette.body;
  ctx.beginPath();
  roundRectPath(ctx, x, y + turfH, w, bodyH, 5);
  ctx.fill();

  // Darker lower half for 3D depth
  ctx.fillStyle = palette.shade;
  ctx.fillRect(x, y + turfH + bodyH * 0.5, w, bodyH * 0.5);

  // Platform walkable top
  ctx.fillStyle = palette.top;
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, turfH + 3, 5);
  ctx.fill();

  // Top highlight edge for clarity
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.fillRect(x + 4, y + 1, w - 8, 2.5);

  // Stylized top-edge teeth/trim overhang
  ctx.fillStyle = palette.teeth;
  for (let px = x + 8; px < x + w - 8; px += 16) {
    ctx.beginPath();
    ctx.moveTo(px, y + turfH);
    ctx.lineTo(px + 4, y + turfH + 5);
    ctx.lineTo(px + 8, y + turfH);
    ctx.fill();
  }

  // Crisp outline
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x, y, w, h);
}

/* ==========================================================================
   EXPRESSIVE CARTOON PLAYER RENDERING
   ========================================================================== */
function drawCartoonPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  isIt: boolean,
  isFrozen: boolean,
  facing: { x: number; y: number } | undefined,
  playerName: string
) {
  const cx = x + PLAYER_SIZE;
  const cy = y + PLAYER_SIZE;

  // 1. Soft Floor Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.beginPath();
  ctx.ellipse(cx, y + PLAYER_SIZE * 2 + 3, PLAYER_SIZE * 0.85, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Chubby Cartoon Bean Body
  const bodyColor = isFrozen ? "#60A5FA" : color;
  const bodyW = PLAYER_SIZE * 2 - 4;
  const bodyH = PLAYER_SIZE * 2 - 2;
  const bodyX = x + 2;
  const bodyY = y + 2;

  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  roundRectPath(ctx, bodyX, bodyY, bodyW, bodyH, 11);
  ctx.fill();

  // 3D bottom shading
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath();
  roundRectPath(ctx, bodyX, bodyY + bodyH * 0.6, bodyW, bodyH * 0.4, 11);
  ctx.fill();

  // Cartoon Outline
  ctx.strokeStyle = "#0E0C22";
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  roundRectPath(ctx, bodyX, bodyY, bodyW, bodyH, 11);
  ctx.stroke();

  // 4. Expressive Cartoon Eyes
  const lookX = (facing?.x ?? 1) * 3.5;
  const eyeCenterY = cy - 2;

  // Eye Sclera (White)
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(cx - 5 + lookX, eyeCenterY, 4.5, 0, Math.PI * 2);
  ctx.arc(cx + 5 + lookX, eyeCenterY, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#0E0C22";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Eye Pupils (Looking in movement direction)
  ctx.fillStyle = "#0F172A";
  ctx.beginPath();
  ctx.arc(cx - 5 + lookX * 1.3, eyeCenterY, 2.5, 0, Math.PI * 2);
  ctx.arc(cx + 5 + lookX * 1.3, eyeCenterY, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Cute white light reflections in pupils
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(cx - 6 + lookX * 1.3, eyeCenterY - 1, 1, 0, Math.PI * 2);
  ctx.arc(cx + 4 + lookX * 1.3, eyeCenterY - 1, 1, 0, Math.PI * 2);
  ctx.fill();

  // 5. FROZEN ICE CUBE EFFECT
  if (isFrozen) {
    ctx.save();
    ctx.fillStyle = "rgba(147, 197, 253, 0.5)";
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    roundRectPath(ctx, x - 3, y - 3, PLAYER_SIZE * 2 + 6, PLAYER_SIZE * 2 + 6, 7);
    ctx.fill();
    ctx.stroke();

    // Frost ice crystals
    ctx.strokeStyle = "#E0F2FE";
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const sx = cx + Math.cos(angle) * (PLAYER_SIZE + 6);
      const sy = cy + Math.sin(angle) * (PLAYER_SIZE + 6);
      ctx.beginPath();
      ctx.moveTo(sx - 3, sy); ctx.lineTo(sx + 3, sy);
      ctx.moveTo(sx, sy - 3); ctx.lineTo(sx, sy + 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 6. Player Name Tag Badge
  ctx.save();
  ctx.font = "bold 11px 'Fredoka', sans-serif";
  ctx.textAlign = "center";
  const textY = y - 10;

  const tagW = ctx.measureText(playerName).width + 14;
  ctx.fillStyle = isIt ? "#EF4444" : "#0F172A";
  ctx.beginPath();
  roundRectPath(ctx, cx - tagW / 2, textY - 11, tagW, 16, 5);
  ctx.fill();

  ctx.strokeStyle = isIt ? "#FFFFFF" : color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(playerName, cx, textY + 1);
  ctx.restore();
}

/* ==========================================================================
   ARCADE HUD & DEDICATED ACTIVE POWER-UP CARD
   ========================================================================== */
export function renderHUD(
  ctx: CanvasRenderingContext2D,
  rawState: LocalGameState | any,
  canvasW: number,
  localPlayerIndex: number = 0
) {
  const players = extractPlayers(rawState.players);
  const localPlayer = players[localPlayerIndex] || players[0];

  // DEDICATED ACTIVE POWER-UP HUD CARD (Floating at bottom center)
  renderActivePowerUpCard(ctx, localPlayer, canvasW, window.innerHeight);
}

function renderActivePowerUpCard(
  ctx: CanvasRenderingContext2D,
  player: PlayerState | undefined,
  canvasW: number,
  canvasH: number
) {
  if (!player) return;

  const cardW = 340;
  const cardH = 58;
  const cardX = Math.floor(canvasW / 2 - cardW / 2);
  const cardY = canvasH - cardH - 14;

  ctx.save();

  if (player.activePowerUp) {
    const type = player.activePowerUp.type;
    const config = POWER_UP_CONFIGS[type];
    const desc = POWER_UP_EFFECT_DESCRIPTIONS[type] ?? "ACTIVE POWER-UP!";
    const pct = Math.max(0, Math.min(1, player.activePowerUp.remainingMs / player.activePowerUp.durationMs));
    const secondsLeft = (player.activePowerUp.remainingMs / 1000).toFixed(1);

    // Active Card Container
    ctx.fillStyle = "#161333";
    ctx.beginPath();
    roundRectPath(ctx, cardX, cardY, cardW, cardH, 14);
    ctx.fill();

    ctx.strokeStyle = config ? config.color : "#2ED573";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Power-up icon box
    ctx.fillStyle = config ? config.color : "#2ED573";
    ctx.beginPath();
    roundRectPath(ctx, cardX + 8, cardY + 8, 42, 42, 10);
    ctx.fill();

    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#121026";
    ctx.fillText(config ? config.icon : "⚡", cardX + 29, cardY + 29);

    // Title & Effect text
    ctx.font = "900 13px 'Fredoka', sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = config ? config.color : "#FDE047";
    ctx.fillText(config ? config.name.toUpperCase() : type.toUpperCase(), cardX + 58, cardY + 22);

    ctx.font = "700 10px 'Fredoka', sans-serif";
    ctx.fillStyle = "#CBD5E1";
    ctx.fillText(desc, cardX + 58, cardY + 36);

    // Timer countdown progress bar
    const barX = cardX + 58;
    const barY = cardY + 42;
    const barW = cardW - 70;
    const barH = 8;

    ctx.fillStyle = "#0F172A";
    ctx.beginPath();
    roundRectPath(ctx, barX, barY, barW, barH, 4);
    ctx.fill();

    ctx.fillStyle = config ? config.color : "#2ED573";
    ctx.beginPath();
    roundRectPath(ctx, barX, barY, Math.max(4, barW * pct), barH, 4);
    ctx.fill();

    // Numeric time badge
    ctx.font = "900 12px 'Outfit', monospace";
    ctx.textAlign = "right";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(`${secondsLeft}s`, cardX + cardW - 12, cardY + 22);
  } else {
    // Subtle empty power-up prompt slot
    ctx.fillStyle = "rgba(18, 16, 38, 0.85)";
    ctx.beginPath();
    roundRectPath(ctx, cardX, cardY + 14, cardW, 36, 12);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = "700 11px 'Fredoka', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#94A3B8";
    ctx.fillText("📦 RUN OVER GLOWING ORBS TO GRAB POWER-UPS!", cardX + cardW / 2, cardY + 32);
  }

  ctx.restore();
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}


