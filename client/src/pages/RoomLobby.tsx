import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PLAYER_COLORS } from "rushout-shared";
import ArcadeButton from "../components/ArcadeButton.js";

interface LobbyPlayer {
  id: string;
  name: string;
  ready: boolean;
  color: string;
}

export default function RoomLobby() {
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

  const isHost = roomOptions.host === true;
  const myName = roomOptions.name ?? "Player";

  const [players, setPlayers] = useState<LobbyPlayer[]>([
    {
      id: "host",
      name: isHost ? myName : "Host",
      ready: true,
      color: PLAYER_COLORS[0],
    },
  ]);
  const [myReady, setMyReady] = useState(false);
  const [simulating, setSimulating] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isHost) {
      setPlayers(prev => [
        prev[0],
        { id: "me", name: myName, ready: false, color: PLAYER_COLORS[1] },
      ]);
    } else {
      setPlayers(prev => [
        { ...prev[0], name: myName },
      ]);
    }
  }, [isHost, myName]);

  useEffect(() => {
    if (!simulating) return;
    const names = ["Chaser", "Runner", "Swift", "Ninja", "Dash"];
    let added = 0;

    const timer = setInterval(() => {
      if (added >= 2) {
        clearInterval(timer);
        setSimulating(false);
        return;
      }
      const idx = players.length;
      setPlayers(prev => [
        ...prev,
        {
          id: `bot_${idx}`,
          name: names[idx % names.length],
          ready: Math.random() > 0.5,
          color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
        },
      ]);
      added++;
    }, 2000);

    return () => clearInterval(timer);
  }, [simulating, players.length]);

  const toggleReady = useCallback(() => {
    setMyReady(r => !r);
    setPlayers(prev => prev.map(p =>
      p.id === "me" || (isHost && p.id === "host")
        ? { ...p, ready: !myReady }
        : p
    ));
  }, [myReady, isHost]);

  const startGame = useCallback(() => {
    navigate("/local");
  }, [navigate]);

  const copyCode = () => {
    navigator.clipboard?.writeText(roomId ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="arcade-bg">
      <div className="arcade-card" style={{ maxWidth: "560px" }}>
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.5rem",
          borderBottom: "3px solid var(--border-arcade)",
          paddingBottom: "1.2rem",
        }}>
          <div>
            <h1 style={{
              fontFamily: "'Fredoka', sans-serif",
              fontSize: "2rem",
              fontWeight: 800,
              color: "#FFFFFF",
              margin: 0,
            }}>
              Room Lobby
            </h1>
            <span style={{ color: "var(--text-dim)", fontSize: "0.95rem" }}>
              Waiting for players to ready up
            </span>
          </div>

          <ArcadeButton color="secondary" size="sm" onClick={() => navigate("/")}>
            ← MENU
          </ArcadeButton>
        </div>

        {/* Room Code Badge */}
        <div style={{
          background: "var(--bg-card-inner)",
          border: "3px solid #0D0B1C",
          borderRadius: "16px",
          padding: "1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.5rem",
          boxShadow: "0 4px 0 #0D0B1C",
        }}>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 800, textTransform: "uppercase" }}>
              ROOM CODE
            </div>
            <div style={{
              fontFamily: "'Outfit', monospace",
              fontSize: "2rem",
              fontWeight: 900,
              color: "var(--arcade-yellow)",
              letterSpacing: "0.2em",
              lineHeight: 1,
            }}>
              {roomId}
            </div>
          </div>
          <button
            onClick={copyCode}
            className="arcade-chip"
            style={{ padding: "0.6rem 1rem", fontSize: "0.9rem" }}
          >
            {copied ? "✅ COPIED!" : "📋 COPY CODE"}
          </button>
        </div>

        {/* Player Roster */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.6rem",
          marginBottom: "1.8rem",
          maxHeight: "280px",
          overflowY: "auto",
        }}>
          {players.map(p => {
            const isMe = p.id === "me" || (isHost && p.id === "host");

            return (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1.2rem",
                  background: "var(--bg-card-inner)",
                  border: `3px solid ${p.color}`,
                  borderRadius: "12px",
                  boxShadow: "0 4px 0 #0D0B1C",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    background: p.color,
                    border: "2px solid #FFFFFF",
                  }} />
                  <span style={{ color: "#FFFFFF", fontWeight: 800, fontSize: "1.05rem" }}>
                    {p.name}
                  </span>
                  {isMe && (
                    <span style={{
                      background: "var(--arcade-blue)",
                      color: "#FFFFFF",
                      fontSize: "0.7rem",
                      fontWeight: 900,
                      padding: "0.15rem 0.45rem",
                      borderRadius: "4px",
                    }}>
                      YOU
                    </span>
                  )}
                </div>

                <span style={{
                  background: p.ready ? "rgba(46, 213, 115, 0.2)" : "rgba(255, 71, 87, 0.2)",
                  color: p.ready ? "var(--arcade-green)" : "var(--arcade-red)",
                  border: `2px solid ${p.ready ? "var(--arcade-green)" : "var(--arcade-red)"}`,
                  borderRadius: "8px",
                  padding: "0.2rem 0.6rem",
                  fontWeight: 800,
                  fontSize: "0.8rem",
                }}>
                  {p.ready ? "READY" : "NOT READY"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "1rem" }}>
          <ArcadeButton
            color={myReady ? "purple" : "yellow"}
            size="lg"
            fullWidth
            onClick={toggleReady}
            icon={myReady ? "✓" : "⚡"}
          >
            {myReady ? "UNREADY" : "READY UP"}
          </ArcadeButton>

          {isHost && (
            <ArcadeButton color="green" size="lg" fullWidth onClick={startGame} icon="▶">
              START GAME
            </ArcadeButton>
          )}
        </div>
      </div>
    </div>
  );
}
