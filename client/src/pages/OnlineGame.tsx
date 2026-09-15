import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as Colyseus from "colyseus.js";
import {
  type GameMap,
  type Obstacle,
  type PlayerState,
  GRAVITY,
  MAPS,
  MAX_FALL_SPEED,
  PLAYER_JUMP_SPEED,
  PLAYER_MOVE_SPEED,
  PLAYER_SIZE,
  POWER_UP_INDEX_TO_TYPE,
  SPEED_SURGE_MULTIPLIER,
} from "rushout-shared";
import { renderGame, renderHUD, extractPlayers } from "../game/renderer.js";
import ArcadeButton from "../components/ArcadeButton.js";

const COLYSEUS_URL = import.meta.env.VITE_COLYSEUS_URL || "ws://localhost:2567";
const ROOM_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generatePublicRoomCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

function lobbyPlayerToState(player: any): PlayerState {
  return {
    id: player.id,
    name: player.name,
    x: player.x ?? 0,
    y: player.y ?? 0,
    vx: player.vx ?? 0,
    vy: player.vy ?? 0,
    isIt: !!player.isIt,
    alive: player.alive ?? true,
    facing: { x: player.facingX ?? 1, y: player.facingY ?? 0 },
    color: player.color,
    score: player.score ?? 0,
    ready: !!player.ready,
    activePowerUp: player.activePowerUpType >= 0 ? {
      type: POWER_UP_INDEX_TO_TYPE[player.activePowerUpType] ?? "speed_surge",
      remainingMs: player.activePowerUpRemaining ?? 0,
      durationMs: player.activePowerUpDuration ?? 1,
    } : null,
    powerUpCooldown: player.powerUpCooldown ?? 0,
    heldPowerUp: player.heldPowerUp >= 0 ? POWER_UP_INDEX_TO_TYPE[player.heldPowerUp] : null,
  };
}

interface OnlineInput {
  up: boolean;
  left: boolean;
  right: boolean;
}

function inputMask(input: OnlineInput) {
  let mask = 0;
  if (input.up) mask |= 1;
  if (input.left) mask |= 4;
  if (input.right) mask |= 8;
  return mask;
}

function currentInput(keys: Record<string, boolean>): OnlineInput {
  return {
    up: !!keys["w"] || !!keys["ArrowUp"] || !!keys["8"] || !!keys["W"] || !!keys[" "] || !!keys["Spacebar"],
    left: !!keys["a"] || !!keys["ArrowLeft"] || !!keys["4"] || !!keys["A"],
    right: !!keys["d"] || !!keys["ArrowRight"] || !!keys["6"] || !!keys["D"],
  };
}

function rectCollides(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function collidesWithObstacles(x: number, y: number, obstacles: Obstacle[]) {
  return obstacles.some(o => rectCollides(x, y, PLAYER_SIZE * 2, PLAYER_SIZE * 2, o.x, o.y, o.w, o.h));
}

function horizontallyOverlaps(x: number, obstacle: Obstacle) {
  const playerW = PLAYER_SIZE * 2;
  return x + playerW > obstacle.x && x < obstacle.x + obstacle.w;
}

function isGrounded(player: { x: number; y: number; vy: number }, map: GameMap) {
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

function movePredictedVertically(player: PlayerState, newY: number, map: GameMap) {
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

const FIXED_DT = 1000 / 60; // 16.666667 ms

interface TickHistoryEntry {
  tick: number;
  input: OnlineInput;
  canJump: boolean;
}

function stepPlayerPhysics(
  player: PlayerState,
  input: OnlineInput,
  canJump: boolean,
  map: GameMap
): { player: PlayerState; jumpConsumed: boolean } {
  const p: PlayerState = {
    ...player,
    facing: { ...player.facing },
  };

  const isFrozen = p.activePowerUp?.type === "freeze_pulse";
  let speed = PLAYER_MOVE_SPEED;
  if (p.activePowerUp?.type === "speed_surge") {
    speed *= SPEED_SURGE_MULTIPLIER;
  }

  let dx = 0;
  let jumpConsumed = false;
  if (!isFrozen) {
    if (input.left) dx -= speed;
    if (input.right) dx += speed;
    if (dx !== 0) p.facing = { x: Math.sign(dx), y: 0 };
    if (canJump && isGrounded(p, map)) {
      p.vy = -PLAYER_JUMP_SPEED;
      jumpConsumed = true;
    }
  }

  p.vx = dx;
  p.vy = Math.min(MAX_FALL_SPEED, p.vy + GRAVITY);

  const newX = p.x + p.vx;
  if (!collidesWithObstacles(newX, p.y, map.obstacles)) {
    p.x = newX;
  } else {
    p.vx = 0;
  }

  movePredictedVertically(p, p.y + p.vy, map);

  p.x = Math.max(0, Math.min(map.width - PLAYER_SIZE * 2, p.x));
  p.y = Math.max(0, Math.min(map.height - PLAYER_SIZE * 2, p.y));
  if (p.y >= map.height - PLAYER_SIZE * 2) p.vy = 0;

  return { player: p, jumpConsumed };
}

function smoothRemotePlayer(
  player: PlayerState,
  previous: PlayerState,
  dtMs: number,
  map: GameMap
): PlayerState {
  const dx = player.x - previous.x;
  const dy = player.y - previous.y;
  const distance = Math.hypot(dx, dy);

  if (distance > 180) {
    return { ...player, facing: { ...player.facing } };
  }

  const blendRate = distance > 60 ? 45 : 65;
  const alpha = 1 - Math.exp(-dtMs / blendRate);

  let targetX = previous.x + dx * alpha;
  let targetY = previous.y + dy * alpha;

  if (collidesWithObstacles(targetX, targetY, map.obstacles)) {
    if (!collidesWithObstacles(targetX, previous.y, map.obstacles)) {
      targetY = previous.y;
    } else if (!collidesWithObstacles(previous.x, targetY, map.obstacles)) {
      targetX = previous.x;
    } else {
      targetX = collidesWithObstacles(player.x, player.y, map.obstacles) ? previous.x : player.x;
      targetY = collidesWithObstacles(player.x, player.y, map.obstacles) ? previous.y : player.y;
    }
  }

  return {
    ...player,
    x: targetX,
    y: targetY,
    facing: { ...player.facing },
  };
}

export default function OnlineGame() {
  const { roomId } = useParams<{ roomId: string }>();
  const normalizedRoomCode = (roomId ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const navigate = useNavigate();
  const roomOptions = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`tag-room-options:${normalizedRoomCode}`) ?? "{}");
    } catch {
      return {};
    }
  }, [normalizedRoomCode]);
  const myName = roomOptions.name ?? "Player";
  const isHost = roomOptions.host === true;
  const hostKey = roomOptions.hostKey;
  const roundLength = Number(roomOptions.roundLength ?? 120);
  const mapName = roomOptions.mapName ?? "arena";
  const powerUpsEnabled = roomOptions.powerUpsEnabled !== false;

  const [status, setStatus] = useState<"connecting" | "lobby" | "playing" | "ended">("connecting");
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [roundResult, setRoundResult] = useState<any>(null);
  const [actualRoomId, setActualRoomId] = useState(normalizedRoomCode);
  const [serverHostId, setServerHostId] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [copied, setCopied] = useState(false);
  const [hudTimeLeft, setHudTimeLeft] = useState(roundLength);

  const clientRef = useRef<Colyseus.Client | null>(null);
  const roomRef = useRef<Colyseus.Room | null>(null);
  const gameFrameRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const rafRef = useRef<number>(0);
  const smoothedPlayersRef = useRef<Map<string, PlayerState>>(new Map());
  const connectedRef = useRef(false);
  const eventsRef = useRef<any[]>([]);
  const lastJumpHeldRef = useRef(false);
  const jumpBufferMsRef = useRef(0);
  const clientTickRef = useRef(0);
  const tickHistoryRef = useRef<TickHistoryEntry[]>([]);
  const accumulatorRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const lastServerTickRef = useRef(0);
  const lastAckedClientTickRef = useRef(0);
  const predictedStateRef = useRef<PlayerState | null>(null);
  const visualOffsetRef = useRef({ x: 0, y: 0 });
  const lastSentMaskRef = useRef(-1);
  const lastSentAtRef = useRef(0);
  const inputChangedRef = useRef(false);

  useEffect(() => {
    const connect = async () => {
      if (connectedRef.current) return;
      connectedRef.current = true;
      try {
        const client = new Colyseus.Client(COLYSEUS_URL);
        clientRef.current = client;

        const publicRoomCode = normalizedRoomCode === "NEW" ? generatePublicRoomCode() : normalizedRoomCode;
        const joinOptions = { name: myName, hostKey, roomCode: publicRoomCode };
        let room: Colyseus.Room;
        if (isHost) {
          try {
            room = await client.join("tag_room", joinOptions);
          } catch {
            room = await client.create("tag_room", {
              ...joinOptions,
              config: {
                roundLength,
                mapName,
                powerUpsEnabled,
              },
            });
          }
        } else {
          room = await client.join("tag_room", joinOptions);
        }

        roomRef.current = room;
        setActualRoomId(publicRoomCode);
        setConnectionError("");

        if (normalizedRoomCode === "NEW") {
          sessionStorage.setItem(`tag-room-options:${publicRoomCode}`, JSON.stringify({
            host: true,
            name: myName,
            roundLength,
            mapName,
            powerUpsEnabled,
            hostKey,
          }));
          window.history.replaceState(null, "", `/online/${publicRoomCode}`);
        }

        const syncState = (state: any) => {
          const gameStarted = !!state.gameStarted;
          setServerHostId(state.hostId ?? "");
          setStatus(gameStarted ? "playing" : "lobby");

          // During gameplay the canvas reads Colyseus' patched room.state directly.
          // Updating React player state for every patch causes avoidable rerenders/stutter.
          if (!gameStarted) {
            const p: PlayerState[] = [];
            if (state.players) {
              state.players.forEach((value: any, key: string) => {
                p.push({ ...lobbyPlayerToState({ ...value, id: value.id || key }), isIt: false });
              });
            }
            setPlayers(p);
          }
        };

        room.onStateChange(syncState);
        room.onMessage("hostUpdate", (data: any) => {
          if (data.hostId) setServerHostId(data.hostId);
        });

        room.onMessage("lobbyState", (data: any) => {
          setPlayers((data.players ?? []).map((player: any) => ({ ...lobbyPlayerToState(player), isIt: false })));
          setServerHostId(data.hostId ?? "");
          if (data.roomCode) setActualRoomId(String(data.roomCode).toUpperCase().replace(/[^A-Z0-9]/g, ""));
        });
        room.onMessage("gameFrame", (frame: any) => {
          if (frame.serverTick && lastServerTickRef.current && frame.serverTick <= lastServerTickRef.current) {
            return; // Discard stale/out-of-order frame
          }
          if (frame.serverTick) {
            lastServerTickRef.current = frame.serverTick;
          }
          gameFrameRef.current = frame;
          if (frame.hostId) setServerHostId(frame.hostId);
          if (frame.roomCode) setActualRoomId(String(frame.roomCode).toUpperCase().replace(/[^A-Z0-9]/g, ""));
        });
        room.send("requestLobbyState");

        room.onMessage("gameStarted", () => {
          setRoundResult(null);
          setHudTimeLeft(roundLength);
          smoothedPlayersRef.current.clear();
          lastFrameTimeRef.current = 0;
          accumulatorRef.current = 0;
          clientTickRef.current = 0;
          tickHistoryRef.current = [];
          lastServerTickRef.current = 0;
          lastAckedClientTickRef.current = 0;
          lastJumpHeldRef.current = false;
          jumpBufferMsRef.current = 0;
          predictedStateRef.current = null;
          visualOffsetRef.current = { x: 0, y: 0 };
          lastSentMaskRef.current = -1;
          lastSentAtRef.current = 0;
          gameFrameRef.current = null;
          inputChangedRef.current = false;
          setStatus("playing");
        });

        room.onMessage("tag", (data: any) => {
          eventsRef.current.push({
            id: `ev_${Date.now()}`,
            type: "tag",
            text: "⚡ PRESSURE PASSED!",
            x: 800,
            y: 450,
            color: "#EF4444",
            remainingMs: 1500,
            maxMs: 1500,
          });
        });

        room.onMessage("roundEnd", (data: any) => {
          setRoundResult(data);
          setHudTimeLeft(0);
          setStatus("ended");
        });

      } catch (err) {
        console.error("Failed to connect:", err);
        setConnectionError(err instanceof Error ? err.message : "Unable to connect to room");
        setStatus("connecting");
      }
    };

    connect();

    return () => {
      gameFrameRef.current = null;
      roomRef.current?.leave();
      clientRef.current = null;
      roomRef.current = null;
      cancelAnimationFrame(rafRef.current);
    };
  }, [myName, isHost, hostKey, normalizedRoomCode, roundLength, mapName, powerUpsEnabled]);

  useEffect(() => {
    if (status !== "playing" && status !== "ended") return;

    const transmitInput = (force = false) => {
      const room = roomRef.current;
      if (!room || status !== "playing") return;
      const input = currentInput(keysRef.current);
      const mask = inputMask(input);
      const now = performance.now();
      if (force || mask !== lastSentMaskRef.current || now - lastSentAtRef.current >= 33) {
        room.send("input", {
          clientTick: clientTickRef.current,
          mask,
          jump: jumpBufferMsRef.current > 0,
        });
        lastSentMaskRef.current = mask;
        lastSentAtRef.current = now;
      }
    };

    const handleDown = (e: KeyboardEvent) => {
      keysRef.current[e.key] = true;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }
      if (["w", "ArrowUp", "W", " ", "Spacebar", "8"].includes(e.key) && !lastJumpHeldRef.current) {
        jumpBufferMsRef.current = 120;
      }
      inputChangedRef.current = true;
    };
    const handleUp = (e: KeyboardEvent) => {
      keysRef.current[e.key] = false;
      inputChangedRef.current = true;
    };

    window.addEventListener("keydown", handleDown);
    window.addEventListener("keyup", handleUp);

    const inputInterval = setInterval(() => transmitInput(false), 33);

    const gameLoop = () => {
      const canvas = canvasRef.current;
      const room = roomRef.current;
      if (!canvas || !room) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }

      const state = gameFrameRef.current ?? room.state;
      const map = MAPS[state.mapName] ?? MAPS.arena;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const now = performance.now();
      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = now;
      }
      const frameDelta = Math.min(100, now - lastFrameTimeRef.current);
      lastFrameTimeRef.current = now;

      // Decay online events
      eventsRef.current = eventsRef.current.filter(e => {
        e.remainingMs -= frameDelta;
        return e.remainingMs > 0;
      });
      const nextHudTime = Math.max(0, Math.ceil(state.roundTimeRemaining ?? 0));
      setHudTimeLeft(current => current === nextHudTime ? current : nextHudTime);

      const now = performance.now();
      const dtMs = lastRenderAtRef.current > 0 ? Math.min(50, now - lastRenderAtRef.current) : 16;
      lastRenderAtRef.current = now;

      const input = status === "playing" ? currentInput(keysRef.current) : { up: false, down: false, left: false, right: false };
      if (input.up && !lastJumpHeldRef.current) {
        jumpBufferMsRef.current = 120;
      } else if (!currentKeys.up && jumpBufferMsRef.current <= 0) {
        jumpBufferMsRef.current = 0;
      }
      lastJumpHeldRef.current = currentKeys.up;

      // 1. RECONCILIATION: Check authoritative server state
      const rawPlayerList = extractPlayers(state.players);
      const serverLocal = rawPlayerList.find(p => p.id === room.sessionId);

      if (serverLocal) {
        const ackTick = serverLocal.lastProcessedTick ?? serverLocal.lastSeq ?? 0;

        if (predictedStateRef.current === null) {
          // Initialize predicted state on first packet/spawn
          predictedStateRef.current = { ...serverLocal, facing: { ...serverLocal.facing } };
          lastAckedClientTickRef.current = ackTick;
          visualOffsetRef.current = { x: 0, y: 0 };
        } else if (ackTick > lastAckedClientTickRef.current) {
          lastAckedClientTickRef.current = ackTick;

          // Prune client tick history up to acknowledged tick
          tickHistoryRef.current = tickHistoryRef.current.filter(entry => entry.tick > ackTick);

          // Replay ONLY the unacknowledged client simulation ticks from server authoritative state
          let replayed: PlayerState = {
            ...serverLocal,
            facing: { ...serverLocal.facing },
          };

          for (const entry of tickHistoryRef.current) {
            const res = stepPlayerPhysics(replayed, entry.input, entry.canJump, map);
            replayed = res.player;
          }

          // Absorb divergence into visual offset
          const errX = predictedStateRef.current.x - replayed.x;
          const errY = predictedStateRef.current.y - replayed.y;
          const errDist = Math.hypot(errX, errY);

          if (errDist > 120) {
            // Major disparity (teleport, respawn, blink dash warp)
            visualOffsetRef.current = { x: 0, y: 0 };
          } else {
            visualOffsetRef.current.x += errX;
            visualOffsetRef.current.y += errY;
            visualOffsetRef.current.x = Math.max(-40, Math.min(40, visualOffsetRef.current.x));
            visualOffsetRef.current.y = Math.max(-40, Math.min(40, visualOffsetRef.current.y));
          }

          predictedStateRef.current = replayed;
        }
      }

      // 2. FIXED TIMESTEP SIMULATION ACCUMULATOR
      accumulatorRef.current += frameDelta;
      while (accumulatorRef.current >= FIXED_DT) {
        accumulatorRef.current -= FIXED_DT;

        const input = currentInput(keysRef.current);
        if (jumpBufferMsRef.current > 0) {
          jumpBufferMsRef.current = Math.max(0, jumpBufferMsRef.current - FIXED_DT);
        }
        const canJump = jumpBufferMsRef.current > 0;

        const tick = ++clientTickRef.current;
        tickHistoryRef.current.push({ tick, input, canJump });
        if (tickHistoryRef.current.length > 180) {
          tickHistoryRef.current.shift();
        }

        if (predictedStateRef.current) {
          const res = stepPlayerPhysics(predictedStateRef.current, input, canJump, map);
          predictedStateRef.current = res.player;
          if (res.jumpConsumed) {
            jumpBufferMsRef.current = 0;
          }
        }
      }

      // 3. INPUT TRANSMISSION
      const forceTransmit = inputChangedRef.current;
      inputChangedRef.current = false;
      transmitInput(forceTransmit);

      // 4. DECAY VISUAL OFFSET SMOOTHLY
      const decay = Math.exp(-frameDelta / 40);
      visualOffsetRef.current.x *= decay;
      visualOffsetRef.current.y *= decay;
      if (Math.abs(visualOffsetRef.current.x) < 0.05) visualOffsetRef.current.x = 0;
      if (Math.abs(visualOffsetRef.current.y) < 0.05) visualOffsetRef.current.y = 0;

      // 5. ASSEMBLE PLAYERS FOR RENDERING
      const playerList: PlayerState[] = [];
      for (const player of rawPlayerList) {
        if (player.id === room.sessionId) {
          if (predictedStateRef.current) {
            playerList.push({
              ...predictedStateRef.current,
              // Authoritative attributes from server
              isIt: player.isIt,
              score: player.score,
              alive: player.alive,
              color: player.color,
              name: player.name,
              activePowerUp: player.activePowerUp,
              powerUpCooldown: player.powerUpCooldown,
              heldPowerUp: player.heldPowerUp,
              x: Math.max(0, Math.min(map.width - PLAYER_SIZE * 2, predictedStateRef.current.x + visualOffsetRef.current.x)),
              y: Math.max(0, Math.min(map.height - PLAYER_SIZE * 2, predictedStateRef.current.y + visualOffsetRef.current.y)),
            });
          } else {
            playerList.push(player);
          }
        } else {
          const prev = smoothedPlayersRef.current.get(player.id);
          const smoothed = prev ? smoothRemotePlayer(player, prev, frameDelta, map) : player;
          smoothedPlayersRef.current.set(player.id, smoothed);
          playerList.push(smoothed);
        }
      }

      const renderState = {
        players: playerList,
        spawns: state.spawns,
        stickyPatches: state.stickyPatches,
        decoys: state.decoys,
        hostId: state.hostId,
        gameStarted: state.gameStarted,
        roundTimeRemaining: state.roundTimeRemaining,
        roundLength: state.roundLength,
        mapName: state.mapName,
        roundLengthNum: state.roundLengthNum,
        powerUpsEnabled: state.powerUpsEnabled,
        events: eventsRef.current,
      };

      const myIndex = playerList.findIndex(p => p.id === room.sessionId || p.name === myName);

      // Unified responsive renderer
      renderGame(ctx, renderState, canvas.width, canvas.height, map);
      renderHUD(ctx, renderState, canvas.width, myIndex >= 0 ? myIndex : 0);

      if (status === "playing") {
        rafRef.current = requestAnimationFrame(gameLoop);
      }
    };

    rafRef.current = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener("keydown", handleDown);
      window.removeEventListener("keyup", handleUp);
      clearInterval(inputInterval);
      cancelAnimationFrame(rafRef.current);
    };
  }, [status]);

  const amHost = serverHostId ? roomRef.current?.sessionId === serverHostId : isHost;

  const handleStartGame = useCallback(() => {
    roomRef.current?.send("startGame");
  }, []);

  const handleCopyCode = () => {
    if (!actualRoomId) return;
    navigator.clipboard?.writeText(actualRoomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 1. CONNECTING VIEW
  if (status === "connecting") {
    return (
      <div className="arcade-bg">
        <div className="arcade-card" style={{ maxWidth: "460px", textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }} className="arcade-btn-pulse">
            📡
          </div>
          <h2 style={{
            fontFamily: "'Fredoka', sans-serif",
            fontSize: "2rem",
            fontWeight: 800,
            color: "#FFFFFF",
            margin: "0 0 0.8rem 0",
          }}>
            Connecting to Arena...
          </h2>
          <p style={{ color: "var(--text-dim)", fontSize: "0.95rem", marginBottom: "1.5rem" }}>
            {connectionError || `Contacting Colyseus server on ${COLYSEUS_URL}`}
          </p>

          {connectionError ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{
                background: "rgba(255, 71, 87, 0.15)",
                border: "2px solid var(--arcade-red)",
                borderRadius: "10px",
                color: "var(--arcade-red)",
                padding: "0.75rem",
                fontWeight: 700,
                fontSize: "0.9rem",
              }}>
                Could not reach the game server. Ensure <code>npm run dev:server</code> is running!
              </div>
              <ArcadeButton color="secondary" size="md" onClick={() => navigate("/")}>
                ← BACK TO MENU
              </ArcadeButton>
            </div>
          ) : (
            <div style={{
              display: "inline-block",
              padding: "0.6rem 1.4rem",
              background: "var(--bg-card-inner)",
              border: "2px solid var(--border-arcade)",
              borderRadius: "999px",
              color: "var(--arcade-yellow)",
              fontWeight: 800,
              fontSize: "0.9rem",
            }}>
              ESTABLISHING WEBSOCKET CONNECTION...
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2. ROUND OVER VIEW
  if (status === "ended" && roundResult) {
    const loserPlayer = roundResult.scores?.find((p: any) => p.id === roundResult.loserId) ?? null;

    return (
      <div className="arcade-bg">
        <div className="arcade-card" style={{ maxWidth: "520px", textAlign: "center" }}>
          <div style={{
            display: "inline-block",
            background: "var(--arcade-yellow)",
            color: "#3A2800",
            padding: "0.3rem 1.2rem",
            borderRadius: "999px",
            border: "3px solid #0D0B1C",
            fontWeight: 900,
            fontSize: "0.85rem",
            letterSpacing: "0.08em",
            boxShadow: "0 4px 0 #D4A30B",
            marginBottom: "1rem",
          }}>
            MATCH COMPLETE!
          </div>

          <h1 style={{
            fontFamily: "'Fredoka', sans-serif",
            fontSize: "2.8rem",
            fontWeight: 900,
            color: "#FFFFFF",
            margin: "0 0 1.3rem 0",
            textShadow: "0 4px 0 #0D0B1C",
          }}>
            ROUND OVER!
          </h1>

          <div style={{
            background: "var(--bg-card-inner)",
            border: `3px solid ${loserPlayer?.color ?? "#FFFFFF"}`,
            borderRadius: "14px",
            padding: "1.1rem",
            marginBottom: "1.6rem",
            boxShadow: "0 5px 0 #0D0B1C",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.55rem",
          }}>
            <div style={{
              width: "58px",
              height: "66px",
              background: loserPlayer?.color ?? "#FFFFFF",
              border: "4px solid #0E0C22",
              borderRadius: "24px 24px 17px 17px",
              boxShadow: "inset 0 -18px 0 rgba(0, 0, 0, 0.22), 0 5px 0 rgba(0, 0, 0, 0.3)",
              position: "relative",
            }}>
              <span style={{
                position: "absolute",
                left: "13px",
                top: "22px",
                width: "11px",
                height: "11px",
                background: "#FFFFFF",
                border: "2px solid #0E0C22",
                borderRadius: "50%",
              }} />
              <span style={{
                position: "absolute",
                right: "13px",
                top: "22px",
                width: "11px",
                height: "11px",
                background: "#FFFFFF",
                border: "2px solid #0E0C22",
                borderRadius: "50%",
              }} />
            </div>
            <div style={{ color: "#FFFFFF", fontWeight: 900, fontSize: "1.1rem" }}>
              {loserPlayer?.name ?? roundResult.loserName ?? "Player"}
            </div>
            <div style={{
              color: "var(--arcade-red)",
              fontWeight: 900,
              fontSize: "1rem",
              letterSpacing: "0.12em",
            }}>
              LOSER
            </div>
          </div>

          <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
            {amHost && (
              <ArcadeButton color="green" size="lg" fullWidth onClick={handleStartGame} icon="🔄">
                REMATCH!
              </ArcadeButton>
            )}
            <ArcadeButton color="secondary" size="lg" onClick={() => navigate("/")} icon="🏠">
              LEAVE
            </ArcadeButton>
          </div>
        </div>
      </div>
    );
  }

  // 3. MULTIPLAYER LOBBY VIEW
  if (status === "lobby") {
    return (
      <div className="arcade-bg">
        <div className="arcade-card" style={{ maxWidth: "640px" }}>
          {/* Header & Room Code Box */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
            marginBottom: "1.8rem",
            borderBottom: "3px solid var(--border-arcade)",
            paddingBottom: "1.2rem",
          }}>
            <div>
              <div style={{
                display: "inline-block",
                background: "rgba(30, 144, 255, 0.2)",
                color: "#4BA7FF",
                padding: "0.2rem 0.6rem",
                borderRadius: "6px",
                border: "2px solid #1E90FF",
                fontWeight: 800,
                fontSize: "0.75rem",
                marginBottom: "0.3rem",
              }}>
                ONLINE MATCH LOBBY
              </div>
              <h1 style={{
                fontFamily: "'Fredoka', sans-serif",
                fontSize: "1.8rem",
                fontWeight: 800,
                color: "#FFFFFF",
                margin: 0,
              }}>
                Arena: {MAPS[mapName]?.name || "Skyline Stage"}
              </h1>
            </div>

            {/* Room Code Badge with Copy */}
            <div style={{
              background: "var(--bg-card-inner)",
              border: "3px solid #0D0B1C",
              borderRadius: "14px",
              padding: "0.5rem 1rem",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              boxShadow: "0 4px 0 #0D0B1C",
            }}>
              <div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 800, textTransform: "uppercase" }}>
                  ROOM CODE
                </div>
                <div style={{
                  fontFamily: "'Outfit', monospace",
                  fontSize: "1.6rem",
                  fontWeight: 900,
                  color: "var(--arcade-yellow)",
                  letterSpacing: "0.15em",
                  lineHeight: 1,
                }}>
                  {actualRoomId}
                </div>
              </div>
              <button
                onClick={handleCopyCode}
                className="arcade-chip"
                style={{ padding: "0.45rem 0.8rem", fontSize: "0.85rem" }}
              >
                {copied ? "✅ COPIED!" : "📋 COPY"}
              </button>
            </div>
          </div>

          {/* Participants Counter */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.8rem",
          }}>
            <span style={{
              fontSize: "0.9rem",
              fontWeight: 800,
              color: "var(--text-dim)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}>
              PARTICIPANTS ({players.length}/13)
            </span>
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              {players.length < 2 ? "Waiting for players to join..." : "Ready to launch!"}
            </span>
          </div>

          {/* Participant Cards Grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "0.75rem",
            marginBottom: "2rem",
            maxHeight: "360px",
            overflowY: "auto",
            paddingRight: "4px",
          }}>
            {players.map(p => {
              const isMe = p.name === myName;
              const isServerHost = p.id === serverHostId;

              return (
                <div
                  key={p.id}
                  style={{
                    background: "var(--bg-card-inner)",
                    border: `3px solid ${p.color}`,
                    borderRadius: "14px",
                    padding: "0.8rem",
                    boxShadow: `0 4px 0 ${p.color}40, 0 6px 0 #0D0B1C`,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                  }}
                >
                  <span style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    background: p.color,
                    border: "2px solid #FFFFFF",
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 800,
                      fontSize: "1rem",
                      color: "#FFFFFF",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {p.name} {isMe && "(YOU)"}
                    </div>
                    <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.2rem" }}>
                      {isServerHost && (
                        <span style={{
                          background: "var(--arcade-yellow)",
                          color: "#3A2800",
                          fontSize: "0.65rem",
                          fontWeight: 900,
                          padding: "0.1rem 0.4rem",
                          borderRadius: "4px",
                        }}>
                          HOST
                        </span>
                      )}

                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Actions */}
          <div style={{ display: "flex", gap: "1rem" }}>
            {amHost ? (
              <ArcadeButton
                color="green"
                size="lg"
                fullWidth
                onClick={handleStartGame}
                disabled={players.length < 1}
                icon="▶"
              >
                START GAME
              </ArcadeButton>
            ) : (
              <div style={{
                flex: 1,
                background: "var(--bg-card-inner)",
                border: "3px solid #0D0B1C",
                borderRadius: "16px",
                padding: "0.85rem",
                textAlign: "center",
                color: "var(--text-dim)",
                fontWeight: 700,
              }}>
                ⏳ WAITING FOR HOST TO START...
              </div>
            )}

            <ArcadeButton color="secondary" size="lg" onClick={() => navigate("/")}>
              LEAVE
            </ArcadeButton>
          </div>
        </div>
      </div>
    );
  }

  // 4. ACTIVE PLAYING CANVAS VIEW
  if (status === "playing") {
    return (
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#0C0A1A" }}>
        <canvas
          ref={canvasRef}
          style={{
            display: "block",
            width: "100vw",
            height: "100vh",
            background: "#0C0A1A",
            cursor: "none",
          }}
        />
        <div style={{
          position: "fixed",
          top: "0.75rem",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 50,
          minWidth: "110px",
          padding: "0.25rem 0.85rem",
          background: hudTimeLeft <= 10 ? "var(--arcade-red)" : "#1E1B4B",
          border: `3px solid ${hudTimeLeft <= 10 ? "var(--arcade-yellow)" : "#383464"}`,
          borderRadius: "10px",
          boxShadow: "0 4px 0 #0D0B1C",
          color: "var(--arcade-yellow)",
          fontFamily: "'Outfit', monospace",
          fontSize: "1.35rem",
          fontWeight: 900,
          textAlign: "center",
          pointerEvents: "none",
        }}>
          {Math.floor(hudTimeLeft / 60)}:{String(hudTimeLeft % 60).padStart(2, "0")}
        </div>

      </div>
    );
  }

  return null;
}
