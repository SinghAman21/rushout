import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  MAPS,
  MAP_NAMES,
  ALL_POWER_UP_TYPES,
  POWER_UP_CONFIGS,
  type PowerUpType,
  type PlayerState,
} from "rushout-shared";
import {
  createLocalGame,
  updateLocalGame,
  spawnPowerUps,
  activatePowerUp,
  type LocalGameState,
  type LocalPlayerInput,
} from "../game/engine.js";
import { renderGame } from "../game/renderer.js";
import { PREDEFINED_PLAYER_NAMES } from "../playerNames.js";

const MAP_KEYS = Object.keys(MAPS);
const MAX_BOTS = 13;

/* ------------------------------------------------------------------ */
/* Test hooks for Playwright                                           */
/* ------------------------------------------------------------------ */

export interface PlaygroundPlayerSnapshot {
  idx: number;
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  isIt: boolean;
  alive: boolean;
  effect: PowerUpType | null;
  effectSecs: number;
}

export interface PlaygroundSnapshot {
  status: "idle" | "running" | "paused" | "ended";
  timeLeft: number;
  itName: string | null;
  aliveCount: number;
  decoys: number;
  stickyPatches: number;
  orbs: number;
  winnerName: string | null;
  players: PlaygroundPlayerSnapshot[];
}

export interface PlaygroundAPI {
  snapshot: () => PlaygroundSnapshot | null;
  triggerAbility: (type: PowerUpType, playerIdx?: number) => boolean;
  eliminate: (playerIdx: number) => boolean;
  crown: (playerIdx: number) => boolean;
  start: () => void;
  setTarget: (playerIdx: number) => void;
}

declare global {
  interface Window {
    __playground?: PlaygroundAPI;
  }
}

function buildSnapshot(
  game: LocalGameState | null,
  status: PlaygroundSnapshot["status"],
  winnerName: string | null,
): PlaygroundSnapshot | null {
  if (!game) return null;
  return {
    status,
    timeLeft: Math.max(0, Math.ceil(game.roundTimeRemaining)),
    itName: game.players.find((p) => p.isIt)?.name ?? null,
    aliveCount: game.players.filter((p) => p.alive).length,
    decoys: game.decoys.length,
    stickyPatches: game.stickyPatches.length,
    orbs: game.spawns.length,
    winnerName,
    players: game.players.map((p, idx) => ({
      idx,
      id: p.id,
      name: p.name,
      color: p.color,
      x: Math.round(p.x),
      y: Math.round(p.y),
      isIt: p.isIt,
      alive: p.alive,
      effect: p.activePowerUp?.type ?? null,
      effectSecs: p.activePowerUp ? Math.max(0, p.activePowerUp.remainingMs / 1000) : 0,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Random bot brains: wander, jump, chase when IT, flee when chased    */
/* ------------------------------------------------------------------ */

interface Brain {
  dir: -1 | 0 | 1;
  decideAt: number;
  jumpFrames: number;
  lastX: number;
  stuckFrames: number;
}

function freshBrain(now: number): Brain {
  return { dir: 0, decideAt: now, jumpFrames: 0, lastX: 0, stuckFrames: 0 };
}

function nearestOther(players: PlayerState[], me: PlayerState): PlayerState | null {
  let best: PlayerState | null = null;
  let bestD = Infinity;
  for (const o of players) {
    if (o.id === me.id || !o.alive) continue;
    const d = Math.hypot(o.x - me.x, o.y - me.y);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

export default function Playground() {
  const [playerCount, setPlayerCount] = useState(4);
  const [mapKey, setMapKey] = useState<string>("arena");
  const [roundLength, setRoundLength] = useState(120);
  const [orbsEnabled, setOrbsEnabled] = useState(true);
  const [status, setStatus] = useState<PlaygroundSnapshot["status"]>("idle");
  const [targetIdx, setTargetIdx] = useState(0);
  const [snapshot, setSnapshot] = useState<PlaygroundSnapshot | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<LocalGameState | null>(null);
  const brainsRef = useRef<Brain[]>([]);
  const pausedRef = useRef(false);
  const orbsEnabledRef = useRef(true);
  const orbTimerRef = useRef(0);
  const lastTimeRef = useRef(0);
  const lastSnapRef = useRef(0);
  const rafRef = useRef(0);
  const statusRef = useRef<PlaygroundSnapshot["status"]>("idle");
  const winnerRef = useRef<string | null>(null);
  const targetRef = useRef(0);

  const setStatusBoth = useCallback((s: PlaygroundSnapshot["status"]) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const refreshSnapshot = useCallback(() => {
    const snap = buildSnapshot(gameRef.current, statusRef.current, winnerRef.current);
    setSnapshot(snap);
  }, []);

  /* ---------------- actions ---------------- */

  const startGame = useCallback(() => {
    const count = Math.max(2, Math.min(MAX_BOTS, Math.round(playerCount) || 2));
    const map = MAPS[mapKey] ?? MAPS.arena;
    const names = Array.from(
      { length: count },
      (_, i) => PREDEFINED_PLAYER_NAMES[i % PREDEFINED_PLAYER_NAMES.length],
    );
    const game = createLocalGame(map, names, roundLength);
    game.running = true;
    gameRef.current = game;
    const now = performance.now();
    brainsRef.current = game.players.map(() => freshBrain(now));
    pausedRef.current = false;
    orbTimerRef.current = 0;
    lastTimeRef.current = 0;
    lastSnapRef.current = 0;
    winnerRef.current = null;
    targetRef.current = 0;
    setTargetIdx(0);
    setStatusBoth("running");
    refreshSnapshot();
  }, [playerCount, mapKey, roundLength, setStatusBoth, refreshSnapshot]);

  const triggerAbility = useCallback((type: PowerUpType, idx?: number): boolean => {
    const game = gameRef.current;
    if (!game || game.ended) return false;
    const i = idx ?? targetRef.current;
    let player = game.players[i];
    if (!player || !player.alive) {
      player = game.players.find((p) => p.alive) ?? player;
    }
    if (!player) return false;
    player.powerUpCooldown = 0;
    activatePowerUp(game, player, type);
    const config = POWER_UP_CONFIGS[type];
    game.events.push({
      id: `ev_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: "pickup",
      text: `🧪 ${config.icon} ${config.name.toUpperCase()}!`,
      x: player.x + 16,
      y: player.y - 12,
      color: config.color,
      remainingMs: 1400,
      maxMs: 1400,
    });
    refreshSnapshot();
    return true;
  }, [refreshSnapshot]);

  const eliminatePlayer = useCallback((idx: number): boolean => {
    const game = gameRef.current;
    if (!game || game.ended) return false;
    const player = game.players[idx];
    if (!player || !player.alive) return false;
    player.alive = false;
    player.activePowerUp = null;
    // Keep the sim alive: pass IT to the first surviving player.
    if (player.isIt) {
      player.isIt = false;
      const next = game.players.find((p) => p.alive);
      if (next) next.isIt = true;
    }
    refreshSnapshot();
    return true;
  }, [refreshSnapshot]);

  const crownWinner = useCallback((idx: number): boolean => {
    const game = gameRef.current;
    if (!game || game.ended) return false;
    const winner = game.players[idx];
    if (!winner) return false;
    winner.alive = true;
    let loser = game.players.find((p, i) => i !== idx && p.alive);
    if (!loser) {
      loser = game.players.find((p, i) => i !== idx) ?? winner;
      loser.alive = true;
    }
    for (const p of game.players) p.isIt = p.id === loser.id;
    game.ended = true;
    game.running = false;
    game.roundTimeRemaining = 0;
    game.result = { loserId: loser.id, loserName: loser.name };
    winnerRef.current = winner.name;
    setStatusBoth("ended");
    refreshSnapshot();
    return true;
  }, [setStatusBoth, refreshSnapshot]);

  const spawnOrbOnTarget = useCallback((): boolean => {
    const game = gameRef.current;
    if (!game || game.ended) return false;
    const player = game.players[targetRef.current] ?? game.players[0];
    if (!player) return false;
    const type = ALL_POWER_UP_TYPES[Math.floor(Math.random() * ALL_POWER_UP_TYPES.length)];
    game.spawns.push({
      id: `spawn_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      x: player.x + 16,
      y: player.y + 16,
      respawnTimer: 0,
    });
    refreshSnapshot();
    return true;
  }, [refreshSnapshot]);

  const togglePause = useCallback(() => {
    if (statusRef.current !== "running" && statusRef.current !== "paused") return;
    pausedRef.current = !pausedRef.current;
    setStatusBoth(pausedRef.current ? "paused" : "running");
    refreshSnapshot();
  }, [setStatusBoth, refreshSnapshot]);

  /* ---------------- main loop ---------------- */

  useEffect(() => {
    const loop = (timestamp: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      const game = gameRef.current;
      if (!canvas || !wrap || !game) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dt = lastTimeRef.current ? Math.min(timestamp - lastTimeRef.current, 50) : 16;
      lastTimeRef.current = timestamp;

      if (!pausedRef.current && !game.ended) {
        // Drive every player with a random brain.
        const inputs: LocalPlayerInput[] = game.players.map((player, i) => {
          let brain = brainsRef.current[i];
          if (!brain) {
            brain = freshBrain(timestamp);
            brainsRef.current[i] = brain;
          }
          if (!player.alive) return { up: false, down: false, left: false, right: false };

          if (timestamp >= brain.decideAt) {
            const other = nearestOther(game.players, player);
            const roll = Math.random();
            if (player.isIt && other) {
              const dx = other.x - player.x;
              brain.dir = Math.abs(dx) < 8 ? (roll < 0.5 ? -1 : 1) : dx < 0 ? -1 : 1;
              if (roll < 0.2) brain.dir = (roll * 10 < 1 ? -1 : 1) as -1 | 1;
              if (other.y < player.y - 50 || roll < 0.15) brain.jumpFrames = 4;
            } else if (!player.isIt) {
              const it = game.players.find((p) => p.isIt && p.alive);
              if (it && Math.hypot(it.x - player.x, it.y - player.y) < 280) {
                const dx = player.x - it.x;
                brain.dir = dx < 0 ? -1 : 1;
                if (roll < 0.2) brain.jumpFrames = 4;
              } else {
                brain.dir = roll < 0.35 ? -1 : roll < 0.7 ? 1 : 0;
                if (roll > 0.88) brain.jumpFrames = 4;
              }
            }
            brain.decideAt = timestamp + 350 + Math.random() * 850;
          }

          // Stuck against a wall? Hop and turn around.
          if (Math.abs(player.x - brain.lastX) < 1 && brain.dir !== 0) {
            brain.stuckFrames += 1;
          } else {
            brain.stuckFrames = 0;
          }
          brain.lastX = player.x;
          if (brain.stuckFrames > 30) {
            brain.stuckFrames = 0;
            brain.jumpFrames = 6;
            brain.dir = brain.dir === 1 ? -1 : 1;
          }

          const input: LocalPlayerInput = {
            up: brain.jumpFrames > 0,
            down: false,
            left: brain.dir < 0,
            right: brain.dir > 0,
          };
          if (brain.jumpFrames > 0) brain.jumpFrames -= 1;
          return input;
        });

        updateLocalGame(game, inputs, dt);

        if (orbsEnabledRef.current && !game.ended) {
          orbTimerRef.current += dt;
          if (orbTimerRef.current > 5000) {
            orbTimerRef.current = 0;
            spawnPowerUps(game);
          }
        }

        if (game.ended && statusRef.current !== "ended") {
          setStatusBoth("ended");
        }
        if (timestamp - lastSnapRef.current > 300) {
          lastSnapRef.current = timestamp;
          refreshSnapshot();
        }
      }

      const w = wrap.clientWidth || 800;
      const h = 520;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderGame(ctx, game, w, h);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [refreshSnapshot, setStatusBoth]);

  /* ---------------- Playwright API ---------------- */

  useEffect(() => {
    window.__playground = {
      snapshot: () => buildSnapshot(gameRef.current, statusRef.current, winnerRef.current),
      triggerAbility: (type, idx) => triggerAbility(type, idx),
      eliminate: (idx) => eliminatePlayer(idx),
      crown: (idx) => crownWinner(idx),
      start: () => startGame(),
      setTarget: (i) => {
        targetRef.current = i;
        setTargetIdx(i);
      },
    };
    return () => {
      delete window.__playground;
    };
  }, [triggerAbility, eliminatePlayer, crownWinner, startGame]);

  useEffect(() => {
    orbsEnabledRef.current = orbsEnabled;
  }, [orbsEnabled]);

  const statusText = !snapshot
    ? "IDLE — press Start Match"
    : snapshot.status === "ended"
      ? `ENDED — ${snapshot.winnerName ? `👑 ${snapshot.winnerName} WINS!` : `⏱ TIME! ${gameRef.current?.result?.loserName ?? "?"} was IT`}`
      : `${snapshot.status.toUpperCase()} · ${snapshot.timeLeft}s left · IT: ${snapshot.itName ?? "—"} · ${snapshot.aliveCount} alive`;

  return (
    <div className="arcade-bg" style={{ justifyContent: "flex-start" }}>
      <div style={{ textAlign: "center", marginBottom: "1rem", zIndex: 2 }}>
        <Link to="/" style={{ color: "var(--text-dim)", fontWeight: 700, textDecoration: "none", fontSize: "0.95rem" }}>
          ← Back to menu
        </Link>
        <h1 style={{
          fontFamily: "'Fredoka', sans-serif",
          fontSize: "clamp(1.8rem, 4vw, 2.6rem)",
          fontWeight: 900, color: "#FFD13B", margin: "0.4rem 0 0.2rem",
          textTransform: "uppercase", letterSpacing: "0.04em",
          textShadow: "0 3px 0 #9E1320, 0 6px 0 #0D0B1C",
        }}>
          🧪 Ability Playground
        </h1>
        <p style={{ color: "var(--text-dim)", fontWeight: 600, maxWidth: 640, margin: "0 auto", fontSize: "0.95rem" }}>
          Bots run &amp; jump around randomly. Fire any ability instantly, eliminate players,
          or crown a winner. Everything here is also drivable via Playwright
          (<code>window.__playground</code>).
        </p>
        <div data-testid="game-status" style={{ marginTop: "0.5rem", color: "#fff", fontWeight: 800 }}>
          {statusText}
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: "1.25rem",
        width: "100%",
        maxWidth: 1200,
        zIndex: 2,
        alignItems: "start",
      }}>
        {/* Arena */}
        <div className="arcade-card" style={{ padding: "1rem" }}>
          <div ref={wrapRef} style={{ width: "100%" }}>
            <canvas
              ref={canvasRef}
              data-testid="playground-canvas"
              style={{ display: "block", width: "100%", height: 520, borderRadius: 14, background: "#0e0c1f" }}
            />
          </div>
          <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.8rem", flexWrap: "wrap" }}>
            <button data-testid="start-btn" onClick={startGame} className="arcade-btn arcade-btn-green" style={{ flex: 1, fontSize: "0.95rem" }}>
              {snapshot ? "↻ RESTART MATCH" : "▶ START MATCH"}
            </button>
            <button
              data-testid="pause-btn"
              onClick={togglePause}
              className="arcade-btn arcade-btn-secondary"
              style={{ flex: 1, fontSize: "0.95rem" }}
              disabled={!snapshot || snapshot.status === "ended"}
            >
              {status === "paused" ? "▶ RESUME" : "⏸ PAUSE"}
            </button>
          </div>
          {snapshot?.status === "ended" && (
            <div data-testid="result-banner" style={{
              marginTop: "0.8rem", textAlign: "center", fontWeight: 900, fontSize: "1.2rem",
              color: "#FFD13B", background: "var(--bg-card-inner)",
              border: "3px solid #0D0B1C", borderRadius: 12, padding: "0.6rem",
            }}>
              {snapshot.winnerName ? `👑 ${snapshot.winnerName} WINS!` : `⏱ TIME! ${gameRef.current?.result?.loserName} was IT`}
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Setup */}
          <div className="arcade-card" style={{ padding: "1.1rem" }}>
            <h3 style={{ color: "#fff", margin: "0 0 0.7rem", fontFamily: "'Fredoka', sans-serif" }}>⚙️ Setup <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>(applies on restart)</span></h3>
            <label style={{ display: "block", color: "var(--text-dim)", fontWeight: 800, fontSize: "0.85rem", marginBottom: "0.3rem" }}>
              Bots: {playerCount}
            </label>
            <input
              data-testid="player-count-input"
              type="range"
              min={2}
              max={MAX_BOTS}
              value={playerCount}
              onChange={(e) => setPlayerCount(Number(e.target.value))}
              style={{ width: "100%" }}
            />
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.7rem", flexWrap: "wrap" }}>
              {MAP_KEYS.map((key) => (
                <button
                  key={key}
                  data-testid={`map-btn-${key}`}
                  onClick={() => setMapKey(key)}
                  className={`arcade-chip ${mapKey === key ? "selected" : ""}`}
                  style={{ fontSize: "0.8rem" }}
                >
                  {MAP_NAMES[key].replace(" Stage", "")}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.7rem", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ color: "var(--text-dim)", fontWeight: 800, fontSize: "0.85rem" }}>Round:</span>
              {[15, 30, 60, 120, 180].map((s) => (
                <button
                  key={s}
                  data-testid={`round-btn-${s}`}
                  onClick={() => setRoundLength(s)}
                  className={`arcade-chip ${roundLength === s ? "selected" : ""}`}
                  style={{ fontSize: "0.8rem" }}
                >
                  {s}s
                </button>
              ))}
            </div>
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.7rem", color: "var(--text-dim)", fontWeight: 800, fontSize: "0.85rem" }}>
              <input
                data-testid="orbs-toggle"
                type="checkbox"
                checked={orbsEnabled}
                onChange={(e) => setOrbsEnabled(e.target.checked)}
              />
              Auto-spawn ability orbs
            </label>
          </div>

          {/* Ability triggers */}
          <div className="arcade-card" style={{ padding: "1.1rem" }}>
            <h3 style={{ color: "#fff", margin: "0 0 0.7rem", fontFamily: "'Fredoka', sans-serif" }}>⚡ Fire ability instantly</h3>
            <label style={{ display: "block", color: "var(--text-dim)", fontWeight: 800, fontSize: "0.85rem", marginBottom: "0.3rem" }}>
              Target player
            </label>
            <select
              data-testid="target-select"
              value={targetIdx}
              onChange={(e) => {
                targetRef.current = Number(e.target.value);
                setTargetIdx(Number(e.target.value));
              }}
              className="arcade-input"
              style={{ marginBottom: "0.7rem" }}
            >
              {(snapshot?.players ?? Array.from({ length: playerCount }, (_, i) => ({ idx: i, name: `Bot ${i + 1}` }))).map((p) => (
                <option key={p.idx} value={p.idx}>
                  P{p.idx + 1} — {p.name}
                </option>
              ))}
            </select>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              {ALL_POWER_UP_TYPES.map((type) => {
                const c = POWER_UP_CONFIGS[type];
                return (
                  <button
                    key={type}
                    data-testid={`ability-${type}`}
                    onClick={() => triggerAbility(type)}
                    disabled={!snapshot || snapshot.status === "ended"}
                    style={{
                      background: c.color,
                      border: "3px solid #0D0B1C",
                      borderRadius: 12,
                      padding: "0.5rem 0.4rem",
                      fontWeight: 800,
                      fontSize: "0.8rem",
                      cursor: "pointer",
                      color: "#0D0B1C",
                      fontFamily: "'Fredoka', sans-serif",
                    }}
                  >
                    {c.icon} {c.name}
                  </button>
                );
              })}
            </div>
            <button
              data-testid="spawn-orb-btn"
              onClick={spawnOrbOnTarget}
              disabled={!snapshot || snapshot.status === "ended"}
              className="arcade-btn arcade-btn-purple"
              style={{ width: "100%", marginTop: "0.6rem", fontSize: "0.85rem" }}
            >
              🎲 DROP RANDOM ORB ON TARGET (tests real pickup)
            </button>
          </div>

          {/* Roster */}
          <div className="arcade-card" style={{ padding: "1.1rem" }} data-testid="roster">
            <h3 style={{ color: "#fff", margin: "0 0 0.7rem", fontFamily: "'Fredoka', sans-serif" }}>👥 Players</h3>
            {!snapshot && <div style={{ color: "var(--text-muted)" }}>Press Start Match.</div>}
            {snapshot?.players.map((p) => (
              <div
                key={p.idx}
                data-testid={`roster-row-${p.idx}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.4rem 0.5rem",
                  marginBottom: "0.4rem",
                  borderRadius: 10,
                  background: "var(--bg-card-inner)",
                  border: `2px solid ${p.color}`,
                  opacity: p.alive ? 1 : 0.55,
                  fontSize: "0.85rem",
                }}
              >
                <span style={{ width: 14, height: 14, borderRadius: 4, background: p.color, flexShrink: 0 }} />
                <span style={{ color: "#fff", fontWeight: 800 }}>
                  P{p.idx + 1} {p.name}
                </span>
                {p.isIt && <span data-testid={`it-badge-${p.idx}`} style={{ color: "#FF4757", fontWeight: 900 }}>IT</span>}
                {!p.alive && <span style={{ color: "var(--text-muted)", fontWeight: 800 }}>OUT</span>}
                <span style={{ color: "var(--text-dim)", marginLeft: "auto" }} data-testid={`effect-${p.idx}`}>
                  {p.effect ? `${POWER_UP_CONFIGS[p.effect].icon} ${p.effectSecs.toFixed(1)}s` : "—"}
                </span>
                <button
                  data-testid={`eliminate-${p.idx}`}
                  onClick={() => eliminatePlayer(p.idx)}
                  disabled={!p.alive || snapshot.status === "ended"}
                  title="Eliminate player"
                  style={{ background: "#FF4757", border: "2px solid #0D0B1C", borderRadius: 8, cursor: "pointer", fontSize: "0.8rem", padding: "0.1rem 0.4rem" }}
                >
                  💀
                </button>
                <button
                  data-testid={`crown-${p.idx}`}
                  onClick={() => crownWinner(p.idx)}
                  disabled={snapshot.status === "ended"}
                  title="Crown winner (ends round)"
                  style={{ background: "#FFD13B", border: "2px solid #0D0B1C", borderRadius: 8, cursor: "pointer", fontSize: "0.8rem", padding: "0.1rem 0.4rem" }}
                >
                  👑
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
