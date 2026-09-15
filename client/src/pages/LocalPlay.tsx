import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  MAPS,
  MAP_NAMES,
  PLAYER_COLORS,
} from "rushout-shared";
import {
  createLocalGame,
  updateLocalGame,
  spawnPowerUps,
  type LocalGameState,
} from "../game/engine.js";
import { renderGame, renderHUD } from "../game/renderer.js";
import { useLocalInputs } from "../hooks/useLocalInputs.js";
import ArcadeButton from "../components/ArcadeButton.js";
import Keycap from "../components/Keycap.js";

const MAP_KEYS = Object.keys(MAPS);

const PLAYER_KEY_INFO = [
  { move: ["A", "D"], jump: "W" },
  { move: ["◀", "▶"], jump: "▲" },
  { move: ["F", "H"], jump: "T" },
  { move: ["4", "6"], jump: "8" },
];

export default function LocalPlay() {
  const navigate = useNavigate();
  const [numPlayers, setNumPlayers] = useState(2);
  const [roundLength, setRoundLength] = useState(120);
  const [selectedMap, setSelectedMap] = useState<string>("arena");
  const [gameStarted, setGameStarted] = useState(false);
  const [hudTimeLeft, setHudTimeLeft] = useState(roundLength);
  const [, setRenderVersion] = useState(0);
  const [playerNames, setPlayerNames] = useState(["Dash", "Blitz", "Rocket", "Ninja"]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<LocalGameState | null>(null);
  const lastTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const powerUpTimerRef = useRef<number>(0);
  const getInputs = useLocalInputs(numPlayers);

  const startGame = useCallback(() => {
    const map = MAPS[selectedMap];
    const names = playerNames.slice(0, numPlayers).map((n, i) => n.trim() || `Player ${i + 1}`);
    gameRef.current = createLocalGame(map, names, roundLength);
    gameRef.current.running = true;
    powerUpTimerRef.current = 0;
    setHudTimeLeft(roundLength);
    setGameStarted(true);
  }, [selectedMap, numPlayers, roundLength, playerNames]);

  const gameLoop = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    const game = gameRef.current;
    if (!canvas || !game || game.ended) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dt = lastTimeRef.current ? Math.min(timestamp - lastTimeRef.current, 50) : 16;
    lastTimeRef.current = timestamp;

    const inputs = getInputs();
    updateLocalGame(game, inputs, dt);
    const nextHudTime = Math.max(0, Math.ceil(game.roundTimeRemaining));
    setHudTimeLeft(current => current === nextHudTime ? current : nextHudTime);

    if (!game.ended) {
      powerUpTimerRef.current += dt;
      if (powerUpTimerRef.current > 12000) {
        powerUpTimerRef.current = 0;
        spawnPowerUps(game);
      }
    }

    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Unified responsive renderer
    renderGame(ctx, game, canvas.width, canvas.height);
    renderHUD(ctx, game, canvas.width, 0);

    if (game.ended) {
      setRenderVersion(v => v + 1);
      return;
    }

    rafRef.current = requestAnimationFrame(gameLoop);
  }, [getInputs]);

  useEffect(() => {
    if (gameStarted) {
      lastTimeRef.current = 0;
      rafRef.current = requestAnimationFrame(gameLoop);
      return () => cancelAnimationFrame(rafRef.current);
    }
  }, [gameStarted, gameLoop]);

  const handleRestart = useCallback(() => {
    setGameStarted(false);
    gameRef.current = null;
  }, []);

  // 1. ROUND OVER VIEW
  if (gameStarted && gameRef.current?.ended) {
    const game = gameRef.current;
    const loserPlayer = game.players.find(p => p.id === game.result?.loserId || p.isIt);

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

          {loserPlayer && (
            <div style={{
              background: "var(--bg-card-inner)",
              border: `3px solid ${loserPlayer.color}`,
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
                background: loserPlayer.color,
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
                {loserPlayer.name}
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
          )}

          <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
            <ArcadeButton color="green" size="lg" fullWidth onClick={handleRestart} icon="🔄">
              PLAY AGAIN
            </ArcadeButton>
            <ArcadeButton color="secondary" size="lg" onClick={() => navigate("/")} icon="🏠">
              MENU
            </ArcadeButton>
          </div>
        </div>
      </div>
    );
  }

  // 2. ACTIVE CANVAS VIEW
  if (gameStarted) {
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

  // 3. LOCAL PLAY SETUP VIEW
  return (
    <div className="arcade-bg">
      <div className="arcade-card" style={{ maxWidth: "780px" }}>
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.8rem",
          borderBottom: "3px solid var(--border-arcade)",
          paddingBottom: "1.2rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontSize: "2.4rem" }}>🕹️</span>
            <div>
              <h1 style={{
                fontFamily: "'Fredoka', sans-serif",
                fontSize: "2rem",
                fontWeight: 800,
                color: "#FFFFFF",
                margin: 0,
              }}>
                Local Match Setup
              </h1>
              <span style={{ color: "var(--text-dim)", fontSize: "0.95rem" }}>
                2 to 4 players on one keyboard
              </span>
            </div>
          </div>

          <ArcadeButton color="secondary" size="sm" onClick={() => navigate("/")}>
            ← BACK
          </ArcadeButton>
        </div>

        {/* Player Count Tabs */}
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{
            display: "block",
            fontSize: "0.9rem",
            fontWeight: 800,
            color: "var(--text-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "0.6rem",
          }}>
            Select Number of Players
          </label>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            {[2, 3, 4].map(n => (
              <button
                key={n}
                onClick={() => setNumPlayers(n)}
                className={`arcade-chip ${numPlayers === n ? "selected" : ""}`}
                style={{ flex: 1, padding: "0.85rem 1rem", fontSize: "1.1rem" }}
              >
                <span>🎮</span> {n} Players
              </button>
            ))}
          </div>
        </div>

        {/* Players Cards Grid with Names & Keycaps */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "1rem",
          marginBottom: "1.8rem",
        }}>
          {Array.from({ length: numPlayers }).map((_, i) => {
            const keys = PLAYER_KEY_INFO[i];
            const color = PLAYER_COLORS[i];

            return (
              <div
                key={i}
                style={{
                  background: "var(--bg-card-inner)",
                  border: `3px solid ${color}`,
                  borderRadius: "16px",
                  padding: "1rem",
                  boxShadow: `0 6px 0 ${color}40, 0 8px 0 #0D0B1C`,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.8rem",
                }}
              >
                {/* Player header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{
                    background: color,
                    color: "#0D0B1C",
                    fontWeight: 900,
                    fontSize: "0.85rem",
                    padding: "0.2rem 0.6rem",
                    borderRadius: "6px",
                  }}>
                    P{i + 1}
                  </span>
                  {i === 0 && (
                    <span style={{
                      background: "var(--arcade-red)",
                      color: "#FFFFFF",
                      fontWeight: 800,
                      fontSize: "0.75rem",
                      padding: "0.15rem 0.45rem",
                      borderRadius: "6px",
                    }}>
                      STARTS IT
                    </span>
                  )}
                </div>

                {/* Name input */}
                <input
                  value={playerNames[i]}
                  onChange={e => {
                    const next = [...playerNames];
                    next[i] = e.target.value;
                    setPlayerNames(next);
                  }}
                  className="arcade-input"
                  style={{
                    padding: "0.55rem 0.8rem",
                    fontSize: "1rem",
                    textAlign: "center",
                    borderColor: color,
                  }}
                  maxLength={12}
                  placeholder={`Player ${i + 1}`}
                />

                {/* Key Controls Showcase */}
                <div style={{
                  background: "#100E26",
                  borderRadius: "10px",
                  padding: "0.6rem 0.4rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.45rem",
                  alignItems: "center",
                }}>
                  {/* Jump key */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <Keycap label={keys.jump} size="sm" />
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700 }}>Jump</span>
                  </div>

                  {/* Move keys */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <Keycap label={keys.move[0]} size="sm" />
                    <Keycap label={keys.move[1]} size="sm" />
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700 }}>Move</span>
                  </div>

                </div>
              </div>
            );
          })}
        </div>

        {/* Game Rules: Round Length & Map Selector */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1.2rem",
          marginBottom: "2rem",
        }}>
          {/* Round Length */}
          <div>
            <label style={{
              display: "block",
              fontSize: "0.85rem",
              fontWeight: 800,
              color: "var(--text-dim)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "0.5rem",
            }}>
              ⏱️ Round Length
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {[60, 120, 180].map(s => (
                <button
                  key={s}
                  onClick={() => setRoundLength(s)}
                  className={`arcade-chip ${roundLength === s ? "selected" : ""}`}
                  style={{ flex: 1 }}
                >
                  {s}s
                </button>
              ))}
            </div>
          </div>

          {/* Map Selector */}
          <div>
            <label style={{
              display: "block",
              fontSize: "0.85rem",
              fontWeight: 800,
              color: "var(--text-dim)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "0.5rem",
            }}>
              🗺️ Arena Map
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {MAP_KEYS.map(key => (
                <button
                  key={key}
                  onClick={() => setSelectedMap(key)}
                  className={`arcade-chip ${selectedMap === key ? "selected" : ""}`}
                  style={{ flex: 1, fontSize: "0.85rem" }}
                >
                  {MAP_NAMES[key].replace(" Stage", "")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Large Start Button */}
        <ArcadeButton
          color="green"
          size="lg"
          fullWidth
          onClick={startGame}
          icon="▶"
          style={{ boxShadow: "0 8px 0 var(--arcade-green-shadow), 0 16px 20px rgba(0,0,0,0.5)" }}
        >
          START MATCH!
        </ArcadeButton>
      </div>
    </div>
  );
}
