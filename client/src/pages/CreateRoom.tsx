import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MAP_NAMES } from "rushout-shared";
import { randomPlayerName } from "../playerNames.js";
import ArcadeButton from "../components/ArcadeButton.js";

const MAP_KEYS = Object.keys(MAP_NAMES);
const ROOM_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generateRoomCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

export default function CreateRoom() {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState(() => randomPlayerName());
  const [roundLength, setRoundLength] = useState<60 | 120 | 180>(120);
  const [selectedMap, setSelectedMap] = useState("arena");
  const [powerUps, setPowerUps] = useState(true);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!playerName.trim()) return;
    setCreating(true);

    const code = generateRoomCode();
    sessionStorage.setItem(
      `tag-room-options:${code}`,
      JSON.stringify({
        host: true,
        name: playerName.trim(),
        roundLength,
        mapName: selectedMap,
        powerUpsEnabled: powerUps,
        hostKey: crypto.randomUUID(),
      })
    );
    navigate(`/online/${code}`);
  };

  const handleRandomize = () => {
    setPlayerName(randomPlayerName());
  };

  return (
    <div className="arcade-bg">
      <div className="arcade-card" style={{ maxWidth: "520px" }}>
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
            <span style={{ fontSize: "2.4rem" }}>📡</span>
            <div>
              <h1 style={{
                fontFamily: "'Fredoka', sans-serif",
                fontSize: "2rem",
                fontWeight: 800,
                color: "#FFFFFF",
                margin: 0,
              }}>
                Host Game Room
              </h1>
              <span style={{ color: "var(--text-dim)", fontSize: "0.95rem" }}>
                Configure rules for your online match
              </span>
            </div>
          </div>

          <ArcadeButton color="secondary" size="sm" onClick={() => navigate("/")}>
            ← BACK
          </ArcadeButton>
        </div>

        {/* Player Name Field */}
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{
            display: "block",
            fontSize: "0.85rem",
            fontWeight: 800,
            color: "var(--text-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "0.5rem",
          }}>
            👤 Your Display Name
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              className="arcade-input"
              maxLength={12}
            />
            <button
              onClick={handleRandomize}
              className="arcade-chip"
              title="Generate Random Name"
              type="button"
              style={{ padding: "0 1rem", fontSize: "1.2rem" }}
            >
              🎲
            </button>
          </div>
        </div>

        {/* Round Length Selector */}
        <div style={{ marginBottom: "1.5rem" }}>
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
                type="button"
                onClick={() => setRoundLength(s as 60 | 120 | 180)}
                className={`arcade-chip ${roundLength === s ? "selected" : ""}`}
                style={{ flex: 1 }}
              >
                {s}s ({s / 60}m)
              </button>
            ))}
          </div>
        </div>

        {/* Map Selector */}
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{
            display: "block",
            fontSize: "0.85rem",
            fontWeight: 800,
            color: "var(--text-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "0.5rem",
          }}>
            🗺️ Battle Arena
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {MAP_KEYS.map(key => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedMap(key)}
                className={`arcade-chip ${selectedMap === key ? "selected" : ""}`}
                style={{ flex: 1, fontSize: "0.9rem" }}
              >
                {MAP_NAMES[key].replace(" Stage", "")}
              </button>
            ))}
          </div>
        </div>

        {/* Power-Ups Toggle */}
        <div style={{
          marginBottom: "2rem",
          background: "var(--bg-card-inner)",
          border: "3px solid #0D0B1C",
          borderRadius: "14px",
          padding: "0.85rem 1.2rem",
        }}>
          <label style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span style={{ fontSize: "1.4rem" }}>⚡</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: "1rem", color: "#FFFFFF" }}>
                  Spawn Power-Ups
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
                  Speed, Freeze, Shields, Blinks & Sticky traps
                </div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={powerUps}
              onChange={e => setPowerUps(e.target.checked)}
              style={{
                width: "22px",
                height: "22px",
                accentColor: "var(--arcade-blue)",
                cursor: "pointer",
              }}
            />
          </label>
        </div>

        {/* Action Button */}
        <ArcadeButton
          color="blue"
          size="lg"
          fullWidth
          onClick={handleCreate}
          disabled={!playerName.trim() || creating}
          icon="📡"
        >
          {creating ? "CREATING ROOM..." : "LAUNCH ROOM"}
        </ArcadeButton>
      </div>
    </div>
  );
}
