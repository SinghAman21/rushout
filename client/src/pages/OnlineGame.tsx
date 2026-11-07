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
  POWER_UP_CONFIGS,
} from "rushout-shared";
import { renderGame, renderHUD, extractPlayers } from "../game/renderer.js";
import ArcadeButton from "../components/ArcadeButton.js";
import TouchJoystick, { type JoystickDirection } from "../components/TouchJoystick.js";
import MapPreview from "../components/MapPreview.js";
import {playTone} from "../sound.js";
import LandscapeGuard from "../components/LandscapeGuard.js";

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

function currentInput(keys: Record<string, boolean>, touch: OnlineInput = { up: false, left: false, right: false }): OnlineInput {
  return {
    up: touch.up || !!keys["w"] || !!keys["ArrowUp"] || !!keys["8"] || !!keys["W"] || !!keys[" "] || !!keys["Spacebar"],
    left: touch.left || !!keys["a"] || !!keys["ArrowLeft"] || !!keys["4"] || !!keys["A"],
    right: touch.right || !!keys["d"] || !!keys["ArrowRight"] || !!keys["6"] || !!keys["D"],
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
  const ghostUp=player.activePowerUp?.type === "ghost_step";
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

  if ((ghostUp && player.vy<0) || !collidesWithObstacles(player.x, newY, map.obstacles)) {
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

  const blendRate = distance > 60 ? 34 : 42;
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

interface NetworkSnapshot { receivedAt: number; players: PlayerState[] }

function sampleRemotePlayers(history: NetworkSnapshot[], now: number, localId: string) {
  if (!history.length) return new Map<string, PlayerState>();
  const targetTime = now - 50;
  while (history.length > 2 && history[1].receivedAt < targetTime - 100) history.shift();
  let before = history[0];
  let after = history[history.length - 1];
  for (let i = 1; i < history.length; i++) {
    if (history[i].receivedAt >= targetTime) { before = history[i - 1]; after = history[i]; break; }
    before = history[i];
  }
  const span = after.receivedAt - before.receivedAt;
  const alpha = span > 0 ? Math.max(0, Math.min(1, (targetTime - before.receivedAt) / span)) : 1;
  const previous = new Map(before.players.map(player => [player.id, player]));
  const next = new Map(after.players.map(player => [player.id, player]));
  const result = new Map<string, PlayerState>();
  for (const [id, current] of next) {
    if (id === localId) continue;
    const old = previous.get(id);
    if (!old) { result.set(id, current); continue; }
    result.set(id, {
      ...current,
      x: old.x + (current.x - old.x) * alpha,
      y: old.y + (current.y - old.y) * alpha,
    });
  }
  return result;
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

  const endedRef = useRef(false);
  const [lobbyMap,setLobbyMap]=useState(mapName);
  const [lobbyDuration,setLobbyDuration]=useState(roundLength);
  const [lobbyPowerUps,setLobbyPowerUps]=useState(powerUpsEnabled);
  const [countdown,setCountdown]=useState(3);
  const [livePlayers,setLivePlayers]=useState<PlayerState[]>([]);
  const [status, setStatus] = useState<"connecting" | "lobby" | "playing" | "ended">("connecting");
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [roundResult, setRoundResult] = useState<any>(null);
  const [rematchVote, setRematchVote] = useState<{active:boolean;deadline:number;yes:number;eligible:number;yesIds:string[]}>({active:false,deadline:0,yes:0,eligible:0,yesIds:[]});
  const [voteClock, setVoteClock] = useState(Date.now());
  const [actualRoomId, setActualRoomId] = useState(normalizedRoomCode);
  const [serverHostId, setServerHostId] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [copied, setCopied] = useState(false);
  const [hudTimeLeft, setHudTimeLeft] = useState(roundLength);
  const [joystickDirection, setJoystickDirection] = useState<JoystickDirection>(0);

  const clientRef = useRef<Colyseus.Client | null>(null);
  const roomRef = useRef<Colyseus.Room | null>(null);
  const gameFrameRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const touchInputRef = useRef<OnlineInput>({ up: false, left: false, right: false });
  const rafRef = useRef<number>(0);
  const smoothedPlayersRef = useRef<Map<string, PlayerState>>(new Map());
  const connectedRef = useRef(false);
  const eventsRef = useRef<any[]>([]);
  const networkSnapshotsRef = useRef<NetworkSnapshot[]>([]);
  const lastHudUpdateRef = useRef(0);
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

  const setTouchControl = useCallback((control: keyof OnlineInput, pressed: boolean) => {
    const input = touchInputRef.current;
    if (input[control] === pressed) return;

    input[control] = pressed;
    if (control === "up" && pressed) {
      // A short buffer makes a tap reliable even between fixed simulation ticks.
      jumpBufferMsRef.current = 120;
    }
    inputChangedRef.current = true;
  }, []);

  const setJoystickMovement = useCallback((direction: JoystickDirection) => {
    setJoystickDirection(direction);
    setTouchControl("left", direction < 0);
    setTouchControl("right", direction > 0);
  }, [setTouchControl]);

  const releaseTouchControls = useCallback(() => {
    const input = touchInputRef.current;
    setJoystickDirection(0);
    if (!input.up && !input.left && !input.right) return;
    touchInputRef.current = { up: false, left: false, right: false };
    inputChangedRef.current = true;
  }, []);

  useEffect(() => {
    let disposed = false;
    const timeout = window.setTimeout(()=>{if(!roomRef.current){setConnectionError("The server is taking too long. Try again or practice offline.");}},10000);
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
          } catch (error) {
            if(roomOptions.created) throw error;
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

        if(disposed){void room.leave();return;}
        clearTimeout(timeout);
        sessionStorage.setItem(`tag-room-options:${publicRoomCode}`,JSON.stringify({...roomOptions,created:true}));
        roomRef.current = room;
        room.onLeave(()=>{if(!disposed){setConnectionError("Connection closed. Rejoin with your room code, or start a new party.");setStatus("connecting");}});
        room.onError(()=>{if(!disposed){setConnectionError("Connection interrupted. Try again to rejoin your party.");setStatus("connecting");}});
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
          setLobbyMap(state.mapName ?? mapName); setLobbyDuration(state.roundLengthNum ?? roundLength); setLobbyPowerUps(state.powerUpsEnabled !== false);
          if(!endedRef.current)setStatus(gameStarted ? "playing" : "lobby");

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
          if (data.rematchVote) setRematchVote(data.rematchVote);
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
          networkSnapshotsRef.current.push({ receivedAt: performance.now(), players: extractPlayers(frame.players) });
          if (networkSnapshotsRef.current.length > 12) networkSnapshotsRef.current.shift();
          if (frame.hostId) setServerHostId(frame.hostId);
          if (frame.roomCode) setActualRoomId(String(frame.roomCode).toUpperCase().replace(/[^A-Z0-9]/g, ""));
        });
        room.send("requestLobbyState");

        room.onMessage("gameStarted", () => {
          endedRef.current=false; playTone("start");
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
          networkSnapshotsRef.current = [];
          inputChangedRef.current = false;
          setStatus("playing");
        });

        room.onMessage("effect", (data:any)=>{eventsRef.current.push({...data,id:`effect_${Date.now()}`,type:"pickup",remainingMs:1400,maxMs:1400});});
        room.onMessage("tag", (data: any) => {
          playTone("tag");
          eventsRef.current.push({
            id: `ev_${Date.now()}`,
            type: "tag",
            text: "⚡ PRESSURE PASSED!",
            x: extractPlayers(room.state.players).find(p=>p.id===data.taggedId)?.x ?? 800,
            y: (extractPlayers(room.state.players).find(p=>p.id===data.taggedId)?.y ?? 450)-32,
            color: "#EF4444",
            remainingMs: 1500,
            maxMs: 1500,
          });
        });

        room.onMessage("roundEnd", (data: any) => {
          endedRef.current=true; playTone("end");
          setRoundResult(data);
          setHudTimeLeft(0);
          setStatus("ended");
        });

        room.onMessage("rematchVoteState", (data:any) => setRematchVote(data));
        room.onMessage("rematchVoteClosed", () => setRematchVote(v => ({...v,active:false,deadline:0})));

      } catch (err) {
        console.error("Failed to connect:", err);
        if(disposed)return;
        clearTimeout(timeout);
        setConnectionError("Room unavailable or full. Check the code with your host and try again.");
        setStatus("connecting");
      }
    };

    connect();

    return () => {
      disposed=true; clearTimeout(timeout); connectedRef.current=false;
      gameFrameRef.current = null;
      void roomRef.current?.leave();
      clientRef.current = null;
      roomRef.current = null;
      cancelAnimationFrame(rafRef.current);
    };
  }, [myName, isHost, hostKey, normalizedRoomCode, roundLength, mapName, powerUpsEnabled]);

  useEffect(() => {
    if ((status !== "ended" && status !== "lobby") || !rematchVote.active) return;
    const timer = window.setInterval(() => setVoteClock(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [status, rematchVote.active]);

  useEffect(() => {
    if (status !== "playing" && status !== "ended") return;

    const transmitInput = (force = false) => {
      const room = roomRef.current;
      if (!room || status !== "playing") return;
      const input = currentInput(keysRef.current, touchInputRef.current);
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
    const resetKeys=()=>{keysRef.current={}; releaseTouchControls();transmitInput(true);};
    window.addEventListener("blur", resetKeys);

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
      const remaining=state.roundTimeRemaining ?? 0;
      setCountdown(Math.max(0,Math.ceil(remaining-(state.roundLengthNum??state.roundLength??roundLength))));
      const nextHudTime = Math.max(0, Math.ceil(Math.min(remaining,state.roundLengthNum??state.roundLength??roundLength)));
      const updateHud = now - lastHudUpdateRef.current >= 100;
      if (updateHud) {
        lastHudUpdateRef.current = now;
        setHudTimeLeft(current => current === nextHudTime ? current : nextHudTime);
      }

      const input = status === "playing"
        ? currentInput(keysRef.current, touchInputRef.current)
        : { up: false, left: false, right: false };
      if (input.up && !lastJumpHeldRef.current) {
        jumpBufferMsRef.current = 120;
      } else if (!input.up && jumpBufferMsRef.current <= 0) {
        jumpBufferMsRef.current = 0;
      }
      lastJumpHeldRef.current = input.up;

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

        const input = currentInput(keysRef.current, touchInputRef.current);
        if (jumpBufferMsRef.current > 0) {
          jumpBufferMsRef.current = Math.max(0, jumpBufferMsRef.current - FIXED_DT);
        }
        const canJump = jumpBufferMsRef.current > 0;

        const tick = ++clientTickRef.current;
        tickHistoryRef.current.push({ tick, input, canJump });
        if (tickHistoryRef.current.length > 180) {
          tickHistoryRef.current.shift();
        }

        if (predictedStateRef.current && state.roundTimeRemaining <= (state.roundLengthNum??state.roundLength??roundLength)) {
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
      const remoteSamples = sampleRemotePlayers(networkSnapshotsRef.current, now, room.sessionId);
      for (const player of rawPlayerList) {
        if (!player.alive) continue;
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
          const sampled = remoteSamples.get(player.id) ?? player;
          const prev = smoothedPlayersRef.current.get(player.id);
          const smoothed = prev ? smoothRemotePlayer(sampled, prev, frameDelta, map) : sampled;
          smoothedPlayersRef.current.set(player.id, smoothed);
          playerList.push(smoothed);
        }
      }

      if (updateHud) setLivePlayers(playerList);
      const renderState = {
        localPlayerId: room.sessionId,
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


      // Unified responsive renderer
      renderGame(ctx, renderState, canvas.width, canvas.height, map);


      if (status === "playing") {
        rafRef.current = requestAnimationFrame(gameLoop);
      }
    };

    rafRef.current = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener("keydown", handleDown);
      window.removeEventListener("keyup", handleUp);
      window.removeEventListener("blur", resetKeys);
      releaseTouchControls();
      clearInterval(inputInterval);
      cancelAnimationFrame(rafRef.current);
    };
  }, [status]);

  const amHost = serverHostId ? roomRef.current?.sessionId === serverHostId : isHost;

  const handleStartGame = useCallback(() => {
    roomRef.current?.send("startGame");
  }, []);

  const handleCopyCode = async () => {
    if (!actualRoomId) return;
    try { await navigator.clipboard.writeText(actualRoomId); setCopied(true); } catch { setCopied(false); }
  };

  const canStart = players.length >= 2 && players.every(p => p.id === serverHostId || p.ready);
  const me = players.find(p=>p.id===roomRef.current?.sessionId);
  const myVote = rematchVote.yesIds.includes(roomRef.current?.sessionId ?? "");
  const voteSeconds = Math.max(0, Math.ceil((rematchVote.deadline - voteClock) / 1000));
  const resultPlayers = [...(roundResult?.scores ?? [])]
    .sort((a:any,b:any)=>(b.tags??0)-(a.tags??0) || Number(b.wasIt)-Number(a.wasIt) || a.name.localeCompare(b.name))
    .map((p:any, _index:number, all:any[]) => {
      const topTags = Math.max(0,...all.filter((other:any)=>other.participated!==false).map((other:any)=>other.tags??0));
      const title = p.participated === false ? "Sideline Scout" : p.wasIt ? "Last One It" : (p.tags??0)>0 && p.tags===topTags ? "Tag Titan" : (p.tags??0)>0 ? "Pressure Passer" : "Clean Escape";
      return {...p, title};
    });
  const leave = () => navigate('/');
  if(status==='connecting') return <main className="arcade-bg"><section className="arcade-card text-center" style={{maxWidth:520}}><span className="eyebrow">ONLINE / CONNECTION</span><h1 className="my-4 text-3xl">{connectionError?'Couldn’t enter the room':'Opening the gates…'}</h1><p role={connectionError?'alert':'status'} className="muted mb-6">{connectionError || 'Connecting to your party. This should only take a moment.'}</p><div className="result-actions">{connectionError&&<ArcadeButton color="yellow" onClick={()=>window.location.reload()}>Try again</ArcadeButton>}<ArcadeButton color="secondary" onClick={()=>navigate('/join-room')}>Enter another code</ArcadeButton><ArcadeButton color="secondary" onClick={leave}>Leave</ArcadeButton></div></section></main>;
  if(status==='ended'&&roundResult)return <main className="arcade-bg"><section className="arcade-card text-center" style={{maxWidth:760}}><span className="eyebrow">TIME’S UP / PARTY STILL ON</span><h1 className="result-title">{roundResult.reason?"Chase interrupted":`${roundResult.loserName} got caught!`}</h1><p className="muted mb-5">{roundResult.reason || 'Holding IT at zero means you’re out. Everyone else escaped.'}</p><h2 className="eyebrow mb-3">ROUND HALL OF FAME</h2><div className="hall-of-fame">{resultPlayers.map((p:any,i:number)=><article className="hall-of-fame-card" key={p.id}><span className="hall-rank">{String(i+1).padStart(2,'0')}</span><div className="mini-runner" style={{background:p.color}}>{p.wasIt?'IT':'★'}</div><div className="hall-player"><strong>{p.name}{p.id===roomRef.current?.sessionId?' · YOU':''}</strong><small>{p.participated===false?'Watched from the sideline':p.wasIt?'Held IT at zero':`${p.tags??0} tags passed`}</small></div><span className="hall-title">{p.title}</span></article>)}</div><section className="rematch-vote" aria-live="polite"><div><strong>{rematchVote.active?`Next round vote · ${voteSeconds}s`:'Vote closed'}</strong><small>{rematchVote.active?`${rematchVote.yes} yes · 2 needed to play`:`${rematchVote.yes} voted yes`}</small></div>{rematchVote.active?<div className="vote-actions"><ArcadeButton aria-pressed={myVote} color={myVote?'green':'yellow'} onClick={()=>roomRef.current?.send('rematchVote',{yes:true})}>{myVote?'✓ You’re in':'Yes, count me in'}</ArcadeButton><ArcadeButton color="secondary" onClick={()=>roomRef.current?.send('rematchVote',{yes:false})}>No thanks</ArcadeButton></div>:<p className="muted">Head back to the lobby to change the setup or invite more players.</p>}</section><div className="result-actions"><ArcadeButton color="secondary" onClick={()=>{endedRef.current=false;setRoundResult(null);setStatus('lobby');roomRef.current?.send('requestLobbyState');}}>Return to lobby</ArcadeButton><ArcadeButton color="secondary" onClick={leave}>Leave room</ArcadeButton></div></section></main>;
  if(status==='lobby')return <main className="arcade-bg"><section className="arcade-card setup-shell" style={{maxWidth:800}}><header className="setup-header"><div><span className="eyebrow">ONLINE / {players.length} OF 13 RUNNERS</span><h1>Your party’s playground</h1><p className="muted">{amHost?'You’re the host. Start when your crew is ready.':'Get ready, then the host will start the chase.'}</p></div><ArcadeButton color="secondary" size="sm" onClick={leave}>Leave</ArcadeButton></header>{rematchVote.active&&<section className="rematch-vote" aria-live="polite"><div><strong>Rematch vote · {voteSeconds}s</strong><small>{rematchVote.yes} yes · 2 needed to play</small></div><div className="vote-actions"><ArcadeButton aria-pressed={myVote} color={myVote?'green':'yellow'} onClick={()=>roomRef.current?.send('rematchVote',{yes:true})}>{myVote?'✓ You’re in':'Yes, count me in'}</ArcadeButton><ArcadeButton color="secondary" onClick={()=>roomRef.current?.send('rematchVote',{yes:false})}>No thanks</ArcadeButton></div></section>}<div className="lobby-code"><div><small>INVITE CODE</small><strong>{actualRoomId}</strong></div><ArcadeButton color="yellow" size="sm" onClick={handleCopyCode}>{copied?'Copied!':'Copy code'}</ArcadeButton><ArcadeButton color="secondary" size="sm" onClick={async()=>{try{await navigator.clipboard.writeText(`${location.origin}/join-room?code=${actualRoomId}`);setCopied(true);}catch{setConnectionError('Copy the room code shown here to invite friends.');}}}>Copy invite link</ArcadeButton></div><p className="muted text-sm my-4">A/D or ←/→ to move · W, ↑ or Space to jump. Pass IT before time runs out. Pickups activate on contact.</p><div className="lobby-players">{players.map((p,i)=><div className="lobby-player" key={p.id}><div className="mini-runner" style={{background:p.color}}>P{i+1}</div><div><strong>{p.name}{p.id===roomRef.current?.sessionId?' · YOU':''}</strong><small>{p.id===serverHostId?'HOST':p.ready?'✓ READY':'Getting ready…'}</small></div></div>)}</div><section className="my-6"><MapPreview id={lobbyMap}/><p className="muted text-sm mt-2">{lobbyDuration}s rounds · {lobbyPowerUps?'Seven pickups enabled':'Pickups off'}</p>{amHost&&<details className="rules mt-4"><summary>Change arena and rules</summary><div className="choice-row my-3">{Object.entries(MAPS).map(([key,m])=><button key={key} className={`arcade-chip ${lobbyMap===key?'selected':''}`} onClick={()=>roomRef.current?.send('config',{mapName:key})}>{m.name}</button>)}</div><div className="choice-row">{[30,60,120].map(n=><button key={n} className={`arcade-chip ${lobbyDuration===n?'selected':''}`} onClick={()=>roomRef.current?.send('config',{roundLength:n})}>{n}s</button>)}</div><button className="arcade-chip mt-4" aria-pressed={lobbyPowerUps} onClick={()=>roomRef.current?.send('config',{powerUpsEnabled:!lobbyPowerUps})}>Pickups {lobbyPowerUps?'ON':'OFF'}</button></details>}</section><div className="result-actions">{amHost?<ArcadeButton color="green" disabled={!canStart} onClick={handleStartGame}>Start the chase →</ArcadeButton>:<ArcadeButton color={me?.ready?'secondary':'green'} onClick={()=>roomRef.current?.send('ready')}>{me?.ready?'Ready ✓ · Undo':'I’m ready'}</ArcadeButton>}</div><p role="status" className="muted mt-4 text-sm">{players.length<2?'Share the code to invite at least one other runner.':!canStart?'Waiting for every guest to get ready.':'Everyone’s ready. Let’s run!'}</p></section></main>;
  if(status==='playing')return <LandscapeGuard active><div className="fixed inset-0 bg-[#0e0c1f]"><canvas ref={canvasRef} className="w-full h-full" aria-label="Online game arena"/><div className="game-topbar"><span className="muted text-sm">{actualRoomId}</span><div className={`game-time ${hudTimeLeft<=10?'urgent':''}`}>{Math.floor(hudTimeLeft/60)}:{String(hudTimeLeft%60).padStart(2,'0')}</div><ArcadeButton size="sm" color="secondary" onClick={leave}>Leave</ArcadeButton></div>{countdown>0&&<div className="countdown-overlay"><b>{countdown}</b><p>Find YOU. Get ready!</p><span>A/D + W or arrow keys · Pass IT before zero</span></div>}{!livePlayers.some(p=>p.id===roomRef.current?.sessionId&&p.alive)&&<div className="spectator-banner">You’re watching this round. Vote yes after it ends to join the next one.</div>}<div className="game-roster">{livePlayers.filter(p=>p.id===roomRef.current?.sessionId||p.isIt).map(p=><div className="runner-chip" key={p.id} style={{'--runner-color':p.color} as React.CSSProperties}><strong>{p.id===roomRef.current?.sessionId?'YOU · ':''}{p.name}{p.isIt?' · IT!':''}</strong><small>{p.activePowerUp?`${POWER_UP_CONFIGS[p.activePowerUp.type].name} · ${(p.activePowerUp.remainingMs/1000).toFixed(1)}s`:'Run · Jump · Pass'}</small></div>)}</div><div className="touch-controls"><TouchJoystick direction={joystickDirection} onDirectionChange={setJoystickMovement}/><button className="touch-control-button touch-control-button--jump" aria-label="Jump" onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);setTouchControl('up',true);}} onPointerUp={()=>setTouchControl('up',false)} onPointerCancel={()=>setTouchControl('up',false)} onLostPointerCapture={()=>setTouchControl('up',false)}>JUMP</button></div></div></LandscapeGuard>;
  return null;
}
