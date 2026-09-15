import { Link } from "react-router-dom";

export default function MainMenu() {
  return (
    <div className="arcade-bg">
      <a
        href="https://github.com/SinghAman21/rushout"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View source on GitHub"
        title="View source on GitHub — star & contribute"
        style={{
          position: "absolute",
          top: "1.25rem",
          right: "1.25rem",
          zIndex: 10,
          display: "inline-flex",
          alignItems: "center",
          gap: "0.55rem",
          background: "#FFFFFF",
          border: "3px solid #0D0B1C",
          borderRadius: "999px",
          padding: "0.55rem 1.05rem",
          boxShadow: "0 5px 0 #0D0B1C, 0 12px 20px rgba(0,0,0,0.35)",
          color: "#0D0B1C",
          fontWeight: 900,
          fontSize: "0.95rem",
          letterSpacing: "0.02em",
          textDecoration: "none",
          transform: "rotate(1.5deg)",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#0D0B1C" aria-hidden="true">
          <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.7 5.38-5.27 5.66.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.2.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
        </svg>
        <span>GitHub</span>
        <span style={{ background: "#FFD13B", border: "2px solid #0D0B1C", borderRadius: "999px", padding: "0.1rem 0.45rem", fontSize: "0.8rem", lineHeight: 1 }}>Star</span>
      </a>

      {/* Decorative floating arcade shapes in background */}
      <div className="arcade-shape" style={{ width: 140, height: 140, background: "var(--arcade-yellow)", top: "10%", left: "8%" }} />
      <div className="arcade-shape" style={{ width: 180, height: 180, background: "var(--arcade-purple)", bottom: "12%", right: "8%", animationDelay: "-3s" }} />
      <div className="arcade-shape" style={{ width: 100, height: 100, background: "var(--arcade-red)", top: "60%", left: "12%", animationDelay: "-5s" }} />
      <div className="arcade-shape" style={{ width: 120, height: 120, background: "var(--arcade-green)", top: "15%", right: "14%", animationDelay: "-2s" }} />

      {/* Main Title Hero Section */}
      <div style={{ textAlign: "center", marginBottom: "2.5rem", zIndex: 2 }}>
        {/* Playful Sticker Badge */}
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          background: "#FF4757",
          color: "#FFFFFF",
          padding: "0.4rem 1.1rem",
          borderRadius: "999px",
          border: "3px solid #0D0B1C",
          fontWeight: 800,
          fontSize: "0.95rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          boxShadow: "0 4px 0 #9E1320",
          marginBottom: "0.75rem",
          transform: "rotate(-2deg)",
        }}>
          <span>⚡ ARCADE MULTIPLAYER</span>
        </div>

        {/* 3D Chunky Logo */}
        <h1 style={{
          fontFamily: "'Fredoka', sans-serif",
          fontSize: "clamp(3.2rem, 7vw, 5.5rem)",
          fontWeight: 900,
          lineHeight: 1,
          margin: 0,
          color: "#FFD13B",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          textShadow: `
            0 3px 0 #D4A30B,
            0 6px 0 #9E1320,
            0 9px 0 #0D0B1C,
            0 12px 0 #0D0B1C,
            0 18px 24px rgba(0,0,0,0.6)
          `,
          animation: "bobTitle 4s ease-in-out infinite",
        }}>
          RUSHOUT
        </h1>

        <p style={{
          fontSize: "1.2rem",
          color: "var(--text-dim)",
          fontWeight: 600,
          marginTop: "1rem",
          maxWidth: "480px",
        }}>
          Run fast. Pass the pressure. Beat the countdown in chaotic arcade arenas!
        </p>
      </div>

      {/* 3 Distinct Arcade Game Mode Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 320px))",
        gap: "1.5rem",
        width: "100%",
        maxWidth: "1040px",
        zIndex: 2,
      }}>
        {/* Mode 1: Local Play */}
        <Link
          to="/local"
          className="arcade-card menu-mode-card"
          style={{
            textDecoration: "none",
            background: "linear-gradient(180deg, #24204A 0%, #1A1738 100%)",
            borderColor: "#2ED573",
            boxShadow: "0 10px 0 #146B37, 0 16px 24px rgba(0,0,0,0.4)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            cursor: "pointer",
          }}
        >
          <div>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "1.2rem",
            }}>
              <span style={{ fontSize: "2.6rem" }}>🕹️</span>
              <span style={{
                background: "rgba(46, 213, 115, 0.2)",
                color: "#2ED573",
                border: "2px solid #2ED573",
                borderRadius: "8px",
                padding: "0.2rem 0.6rem",
                fontWeight: 800,
                fontSize: "0.8rem",
              }}>
                SAME KEYBOARD
              </span>
            </div>

            <h2 style={{
              fontFamily: "'Fredoka', sans-serif",
              fontSize: "1.8rem",
              fontWeight: 800,
              color: "#FFFFFF",
              margin: "0 0 0.5rem 0",
            }}>
              Play Local
            </h2>
            <p style={{
              color: "var(--text-dim)",
              fontSize: "0.95rem",
              lineHeight: 1.4,
              margin: "0 0 1.5rem 0",
            }}>
              2 to 4 players on one screen! Dedicated key zones for chaotic party fun.
            </p>
          </div>

          <div className="arcade-btn arcade-btn-green" style={{ width: "100%", pointerEvents: "none" }}>
            START LOCAL
          </div>
        </Link>

        {/* Mode 2: Create Room */}
        <Link
          to="/create-room"
          className="arcade-card menu-mode-card"
          style={{
            textDecoration: "none",
            background: "linear-gradient(180deg, #24204A 0%, #1A1738 100%)",
            borderColor: "#1E90FF",
            boxShadow: "0 10px 0 #0C65C0, 0 16px 24px rgba(0,0,0,0.4)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            cursor: "pointer",
          }}
        >
          <div>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "1.2rem",
            }}>
              <span style={{ fontSize: "2.6rem" }}>📡</span>
              <span style={{
                background: "rgba(30, 144, 255, 0.2)",
                color: "#4BA7FF",
                border: "2px solid #1E90FF",
                borderRadius: "8px",
                padding: "0.2rem 0.6rem",
                fontWeight: 800,
                fontSize: "0.8rem",
              }}>
                HOST MATCH
              </span>
            </div>

            <h2 style={{
              fontFamily: "'Fredoka', sans-serif",
              fontSize: "1.8rem",
              fontWeight: 800,
              color: "#FFFFFF",
              margin: "0 0 0.5rem 0",
            }}>
              Create Room
            </h2>
            <p style={{
              color: "var(--text-dim)",
              fontSize: "0.95rem",
              lineHeight: 1.4,
              margin: "0 0 1.5rem 0",
            }}>
              Host an online arena for up to 13 players with customizable round length and maps.
            </p>
          </div>

          <div className="arcade-btn arcade-btn-blue" style={{ width: "100%", pointerEvents: "none" }}>
            HOST ROOM
          </div>
        </Link>

        {/* Mode 3: Join Room */}
        <Link
          to="/join-room"
          className="arcade-card menu-mode-card"
          style={{
            textDecoration: "none",
            background: "linear-gradient(180deg, #24204A 0%, #1A1738 100%)",
            borderColor: "#FF4757",
            boxShadow: "0 10px 0 #C42635, 0 16px 24px rgba(0,0,0,0.4)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            cursor: "pointer",
          }}
        >
          <div>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "1.2rem",
            }}>
              <span style={{ fontSize: "2.6rem" }}>🎟️</span>
              <span style={{
                background: "rgba(255, 71, 87, 0.2)",
                color: "#FF8A96",
                border: "2px solid #FF4757",
                borderRadius: "8px",
                padding: "0.2rem 0.6rem",
                fontWeight: 800,
                fontSize: "0.8rem",
              }}>
                ENTER CODE
              </span>
            </div>

            <h2 style={{
              fontFamily: "'Fredoka', sans-serif",
              fontSize: "1.8rem",
              fontWeight: 800,
              color: "#FFFFFF",
              margin: "0 0 0.5rem 0",
            }}>
              Join Room
            </h2>
            <p style={{
              color: "var(--text-dim)",
              fontSize: "0.95rem",
              lineHeight: 1.4,
              margin: "0 0 1.5rem 0",
            }}>
              Have a 6-character room code from a friend? Enter it to jump right in!
            </p>
          </div>

          <div className="arcade-btn arcade-btn-red" style={{ width: "100%", pointerEvents: "none" }}>
            ENTER ARENA
          </div>
        </Link>
      </div>

      {/* Quick Rules Arcade Banner */}
      <div style={{
        marginTop: "2.5rem",
        background: "rgba(32, 29, 64, 0.9)",
        border: "3px solid #0D0B1C",
        borderRadius: "16px",
        padding: "0.75rem 1.8rem",
        boxShadow: "0 6px 0 #0D0B1C",
        display: "flex",
        alignItems: "center",
        gap: "1.5rem",
        flexWrap: "wrap",
        justifyContent: "center",
        zIndex: 2,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.95rem", color: "#E0E0FF" }}>
          <span>⚡</span>
          <span><strong>Grab Power-Ups</strong> on the map</span>
        </div>
        <span style={{ color: "var(--border-arcade)" }}>•</span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.95rem", color: "#E0E0FF" }}>
          <span>👑</span>
          <span><strong>Pass the Tag</strong> before timer runs out</span>
        </div>
        <span style={{ color: "var(--border-arcade)" }}>•</span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.95rem", color: "var(--arcade-yellow)" }}>
          <span>⏳</span>
          <span><strong>Last "IT" loses!</strong></span>
        </div>
      </div>

      <a
        href="https://github.com/SinghAman21/rushout"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          marginTop: "1.5rem",
          zIndex: 2,
          display: "inline-flex",
          alignItems: "center",
          gap: "0.6rem",
          background: "rgba(32, 29, 64, 0.9)",
          border: "3px solid #0D0B1C",
          borderRadius: "999px",
          padding: "0.5rem 1.2rem",
          boxShadow: "0 4px 0 #0D0B1C",
          color: "#E0E0FF",
          fontWeight: 700,
          fontSize: "0.95rem",
          textDecoration: "none",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">
          <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.7 5.38-5.27 5.66.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.2.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
        </svg>
        <span>Star on GitHub</span>
      </a>
    </div>
  );
}
