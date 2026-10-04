import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  POWER_UP_CONFIGS,
  ALL_POWER_UP_TYPES,
  PLAYER_SIZE,
  type PowerUpType,
} from "rushout-shared";
import { drawCartoonPlayer, roundRectPath } from "../game/renderer.js";

const HOW_TO_USE: Record<PowerUpType, string> = {
  speed_surge: "Fires on pickup — auto burst for 3s. Great for escaping when you're IT.",
  freeze_pulse: "Fires on pickup — freezes the nearest rival in 300px for 2s. Tag them or run!",
  ghost_step: "Fires on pickup — auto invisibility for 4s. Slip right past the chaser.",
  blink_dash: "Fires on pickup — warps you ~200px forward instantly.",
  mirror_decoy: "Fires on pickup — spawns a running fake clone for 5s.",
  safe_bubble: "Fires on pickup — auto shield for 10s, blocks one tag pass. Play aggressive!",
  sticky_patch: "Fires on pickup — drops a goo puddle behind you that slows chasers.",
};

const TAGLINE: Record<PowerUpType, string> = {
  speed_surge: "RUN FASTER (1.8x SPEED!)",
  freeze_pulse: "FREEZES NEAREST RIVAL!",
  ghost_step: "INVISIBLE TO OPPONENTS!",
  blink_dash: "WARP DASH FORWARD!",
  mirror_decoy: "SPAWNS RUNNING FAKE CLONE!",
  safe_bubble: "BLOCKS 1 PRESSURE PASS!",
  sticky_patch: "DROPPED SLOW GOO PUDDLE!",
};

const SCENARIO: Record<PowerUpType, string> = {
  speed_surge: "YOU flee — IT can't keep up",
  freeze_pulse: "YOU freeze IT, then escape",
  ghost_step: "YOU vanish — IT runs past",
  blink_dash: "YOU warp away from IT",
  mirror_decoy: "IT guesses wrong clone",
  safe_bubble: "IT's tag bounces off",
  sticky_patch: "IT gets stuck in YOUR goo",
};

function formatSec(ms: number): string {
  if (ms <= 0) return "Instant";
  return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
}

/* ------------------------------------------------------------------ */
/* Shared canvas helpers — identical visuals to renderer.ts            */
/* ------------------------------------------------------------------ */

const IT_COLOR = "#FF6B6B";
const YOU_COLOR = "#4ECDC4";
const CLONE_COLOR = "#9C88FF";

function paintStage(ctx: CanvasRenderingContext2D, W: number, H: number, now: number) {
  ctx.fillStyle = "#0e0c1f";
  ctx.fillRect(0, 0, W, H);
  // subtle arena floor dots, like the game bg
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  for (let x = 12; x < W; x += 28) {
    for (let y = 14; y < H; y += 28) {
      ctx.fillRect(x + ((y * 7 + now * 0) % 5), y, 2, 2);
    }
  }
  // ground line
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fillRect(0, H - 26, W, 2);
}

function drawSpeedTrail(ctx: CanvasRenderingContext2D, x: number, y: number, facingX: number) {
  ctx.save();
  ctx.fillStyle = "rgba(255, 209, 59, 0.45)";
  const trailDx = -facingX * 14;
  ctx.beginPath();
  ctx.ellipse(
    x + PLAYER_SIZE + trailDx, y + PLAYER_SIZE + 4,
    PLAYER_SIZE * 1.1, PLAYER_SIZE * 0.8, 0, 0, Math.PI * 2,
  );
  ctx.fill();
  // wind streaks
  ctx.strokeStyle = "rgba(255, 209, 59, 0.8)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const wy = y + 6 + i * 10;
    ctx.beginPath();
    ctx.moveTo(x - 14 - (i * 4), wy);
    ctx.lineTo(x - 2, wy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBubbleShield(ctx: CanvasRenderingContext2D, x: number, y: number, now: number) {
  const bRad = PLAYER_SIZE + 12 + Math.sin(now / 140) * 2;
  const bcx = x + PLAYER_SIZE;
  const bcy = y + PLAYER_SIZE;
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
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.beginPath();
  ctx.ellipse(bcx - bRad * 0.45, bcy - bRad * 0.45, 6, 3, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGooPuddle(ctx: CanvasRenderingContext2D, x: number, y: number, now: number, alpha = 1) {
  const wobble = Math.sin(now / 160 + x) * 3;
  ctx.save();
  ctx.fillStyle = `rgba(217, 119, 6, ${alpha * 0.5})`;
  ctx.beginPath();
  ctx.ellipse(x, y, 44 + wobble, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(245, 158, 11, ${alpha * 0.8})`;
  ctx.beginPath();
  ctx.ellipse(x, y, 32, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(254, 240, 138, ${alpha * 0.9})`;
  ctx.beginPath();
  ctx.arc(x - 14, y - 3, 5, 0, Math.PI * 2);
  ctx.arc(x + 12, y + 2, 6, 0, Math.PI * 2);
  ctx.arc(x + 2, y - 5, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPopup(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  ctx.save();
  ctx.font = "900 12px 'Fredoka', sans-serif";
  ctx.textAlign = "center";
  const textW = ctx.measureText(text).width + 16;
  ctx.fillStyle = "#121026";
  ctx.beginPath();
  roundRectPath(ctx, x - textW / 2, y - 11, textW, 22, 7);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + 4);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Per-ability scene directors. t = loop seconds, auto-playing.        */
/* Every scene stars IT (red tag, chasing) vs YOU (teal, escaping).    */
/* ------------------------------------------------------------------ */

function drawScene(type: PowerUpType, ctx: CanvasRenderingContext2D, W: number, H: number, t: number, now: number) {
  paintStage(ctx, W, H, now);
  const groundY = H - 26 - PLAYER_SIZE * 2;

  switch (type) {
    case "speed_surge": {
      // YOU sprints ahead with trail, IT lags behind
      const loop = 2.4;
      const p = (t % loop) / loop;
      const youX = 10 + p * (W - 70);
      const itX = 10 + Math.max(0, p - 0.18) * (W - 70) * 0.9;
      drawSpeedTrail(ctx, youX, groundY, 1);
      ctx.save();
      drawCartoonPlayer(ctx, itX, groundY + 6, IT_COLOR, true, false, { x: 1, y: 0 }, "IT");
      ctx.restore();
      drawCartoonPlayer(ctx, youX, groundY, YOU_COLOR, false, false, { x: 1, y: 0 }, "YOU ⚡");
      drawPopup(ctx, W / 2, 26, "1.8x SPEED — CAN'T CATCH YOU!", "#FFD13B");
      break;
    }
    case "freeze_pulse": {
      // 3.6s loop: chase → pulse ring → IT frozen solid → thaw
      const loop = 3.6;
      const lt = t % loop;
      const youX = W - 110;
      const itX = W - 190 + Math.min(lt, 0.7) * 30;
      const frozen = lt > 0.8 && lt < 2.8;
      const ringP = lt < 0.8 ? lt / 0.8 : -1;
      // pulse ring expanding from YOU toward IT
      if (ringP >= 0) {
        const cx = youX + PLAYER_SIZE;
        const cy = groundY + PLAYER_SIZE;
        const r = 12 + ringP * 90;
        ctx.save();
        ctx.globalAlpha = 1 - ringP * 0.7;
        ctx.strokeStyle = "#00BFFF";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(0,191,255,0.4)";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      // flash burst at freeze moment
      if (lt >= 0.8 && lt < 1.1) {
        ctx.save();
        ctx.globalAlpha = (1.1 - lt) / 0.3;
        ctx.fillStyle = "rgba(147,197,253,0.5)";
        ctx.beginPath();
        ctx.arc(itX + PLAYER_SIZE, groundY + 6 + PLAYER_SIZE, 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      drawCartoonPlayer(ctx, youX, groundY, YOU_COLOR, false, false, { x: -1, y: 0 }, "YOU ❄");
      // IT: frozen solid with the real in-game ice cube
      drawCartoonPlayer(ctx, itX, groundY + 6, IT_COLOR, true, frozen, { x: 1, y: 0 }, frozen ? "IT ❄" : "IT");
      if (frozen) {
        ctx.font = "bold 20px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("❄️", itX + PLAYER_SIZE, groundY - 8 + Math.sin(now / 200) * 2);
        drawPopup(ctx, W / 2, 26, "FROZEN 2s — RUN!", "#00BFFF");
      } else {
        drawPopup(ctx, W / 2, 26, lt < 0.8 ? "FREEZE PULSE…" : "THAWED!", "#00BFFF");
      }
      break;
    }
    case "ghost_step": {
      // YOU fades to 0.28 alpha (exact game value), IT runs past confused
      const loop = 3.2;
      const lt = t % loop;
      const ghost = lt > 0.6 && lt < 2.5;
      const fade = ghost ? 0.28 : lt < 0.6 ? 1 - (lt / 0.6) * 0.72 : 0.28 + ((lt - 2.5) / 0.7) * 0.72;
      const youX = W / 2 - 10 + Math.sin(lt * 1.2) * 6;
      const itX = lt < 1.6 ? 20 + (lt / 1.6) * (W - 60) : 20 + ((3.2 - lt) / 1.6) * (W - 60);
      drawCartoonPlayer(ctx, itX, groundY + 6, IT_COLOR, true, false, { x: itX < W / 2 ? 1 : -1, y: 0 }, "IT");
      if (ghost) {
        ctx.save();
        ctx.font = "900 16px 'Fredoka', sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#fff";
        ctx.fillText("?", itX + PLAYER_SIZE, groundY - 14);
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0.28, Math.min(1, fade));
      drawCartoonPlayer(ctx, youX, groundY, YOU_COLOR, false, false, { x: 1, y: 0 }, ghost ? "YOU …" : "YOU 👻");
      ctx.restore();
      drawPopup(ctx, W / 2, 26, ghost ? "INVISIBLE — IT RUNS PAST!" : "GHOST STEP FADING…", "#B0C4DE");
      break;
    }
    case "blink_dash": {
      // 2s loop: YOU cornered → blink → reappear far away
      const loop = 2.2;
      const lt = t % loop;
      const blinked = lt > 0.7;
      const fromX = 60;
      const toX = W - 100;
      const itX = blinked ? 70 : 20 + (lt / 0.7) * 40;
      if (!blinked) {
        const flicker = lt > 0.55 ? (Math.sin(lt * 60) > 0 ? 1 : 0.4) : 1;
        ctx.save();
        ctx.globalAlpha = flicker;
        drawCartoonPlayer(ctx, fromX, groundY, YOU_COLOR, false, false, { x: 1, y: 0 }, "YOU 💫");
        ctx.restore();
        drawPopup(ctx, W / 2, 26, "CORNERED…", "#FF69B4");
      } else {
        const appearP = Math.min(1, (lt - 0.7) / 0.3);
        // dashed warp trail between points
        ctx.save();
        ctx.strokeStyle = "#FF69B4";
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 7]);
        ctx.beginPath();
        ctx.moveTo(fromX + 32, groundY + 16);
        ctx.lineTo(toX, groundY + 16);
        ctx.stroke();
        ctx.setLineDash([]);
        // burst at destination
        ctx.globalAlpha = 1 - appearP * 0.6;
        ctx.fillStyle = "rgba(255,105,180,0.5)";
        ctx.beginPath();
        ctx.arc(toX + PLAYER_SIZE, groundY + PLAYER_SIZE, 30 * (1 - appearP) + 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        drawCartoonPlayer(ctx, toX, groundY, YOU_COLOR, false, false, { x: 1, y: 0 }, "YOU 💫");
        drawPopup(ctx, W / 2, 26, "WARP +200px — ESCAPED!", "#FF69B4");
      }
      drawCartoonPlayer(ctx, itX, groundY + 6, IT_COLOR, true, false, { x: 1, y: 0 }, "IT");
      break;
    }
    case "mirror_decoy": {
      // YOU splits; clone (translucent, like renderer alpha 0.6) runs opposite way; IT picks wrong one
      const loop = 3.0;
      const lt = t % loop;
      const split = Math.min(1, Math.max(0, (lt - 0.5) / 0.8));
      const cx0 = W / 2 - PLAYER_SIZE;
      const youX = cx0 - split * 80;
      const cloneX = cx0 + split * 80;
      const itToClone = split > 0.9;
      const itX = cx0 + (itToClone ? split * 55 : -10) + Math.sin(now / 300) * 2;
      drawCartoonPlayer(ctx, youX, groundY, YOU_COLOR, false, false, { x: -1, y: 0 }, "YOU");
      ctx.save();
      ctx.globalAlpha = 0.6 * Math.min(1, split * 2);
      drawCartoonPlayer(ctx, cloneX, groundY, CLONE_COLOR, false, false, { x: 1, y: 0 }, "CLONE");
      ctx.restore();
      if (split > 0.3) {
        ctx.save();
        ctx.strokeStyle = "rgba(156,136,255,0.7)";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(itX + PLAYER_SIZE, groundY - 6);
        ctx.lineTo(cloneX + PLAYER_SIZE, groundY + 8);
        ctx.stroke();
        ctx.restore();
      }
      drawCartoonPlayer(ctx, itX, groundY + 6, IT_COLOR, true, false, { x: 1, y: 0 }, "IT 😵");
      drawPopup(ctx, W / 2, 26, split < 0.5 ? "DECOY SPLITS…" : "IT CHASES THE FAKE!", "#9370DB");
      break;
    }
    case "safe_bubble": {
      // IT lunges, bounces off the exact in-game bubble shield
      const loop = 2.6;
      const lt = t % loop;
      const lunge = Math.sin((lt / loop) * Math.PI * 2);
      const youX = W / 2 - 10;
      const itX = W / 2 - 10 - 95 + Math.max(0, lunge) * 62;
      const blocked = lunge > 0.72;
      drawCartoonPlayer(ctx, youX, groundY, YOU_COLOR, false, false, { x: -1, y: 0 }, "YOU 🛡");
      drawBubbleShield(ctx, youX, groundY, now);
      drawCartoonPlayer(ctx, itX, groundY + 6, IT_COLOR, true, false, { x: 1, y: 0 }, "IT");
      if (blocked) {
        // knockback stars
        ctx.save();
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("✨", itX + 6, groundY - 4);
        ctx.fillText("💥", (itX + youX) / 2 + PLAYER_SIZE, groundY - 12);
        ctx.restore();
        drawPopup(ctx, W / 2, 26, "BLOCKED! 1 TAG SAVED", "#2ED573");
      } else {
        drawPopup(ctx, W / 2, 26, "SHIELD HOLDS 10s", "#2ED573");
      }
      break;
    }
    case "sticky_patch": {
      // YOU drops goo, sprints out; IT wades through slowly
      const loop = 3.4;
      const lt = t % loop;
      const gooX = W / 2;
      const gooY = groundY + PLAYER_SIZE + 12;
      drawGooPuddle(ctx, gooX, gooY, now, 1);
      // YOU: drops at start then escapes right
      const youP = Math.min(1, lt / 1.2);
      const youX = 20 + youP * (W - 70);
      // IT: chases but crawls through the goo zone
      let itX: number;
      if (lt < 1.0) itX = 8 + (lt / 1.0) * (gooX - 60);
      else if (lt < 2.4) itX = gooX - 52 + ((lt - 1.0) / 1.4) * 60; // slow wade
      else itX = gooX + 8 + ((lt - 2.4) / 1.0) * 60;
      const inGoo = Math.abs(itX + PLAYER_SIZE - gooX) < 46;
      ctx.save();
      if (inGoo) ctx.globalAlpha = 0.85;
      drawCartoonPlayer(ctx, itX, groundY + 6 + (inGoo ? 3 : 0), "#8B4513", true, false, { x: 1, y: 0 }, inGoo ? "IT 🐌" : "IT");
      ctx.restore();
      drawCartoonPlayer(ctx, youX, groundY, YOU_COLOR, false, false, { x: 1, y: 0 }, "YOU");
      if (inGoo) drawPopup(ctx, W / 2, 26, "SLOWED 60% IN GOO!", "#F59E0B");
      else drawPopup(ctx, W / 2, 26, "DROP GOO, RUN!", "#F59E0B");
      break;
    }
  }
}

function DemoCanvas({ type }: { type: PowerUpType }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const start = performance.now();
    const render = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = canvas.clientWidth || 300;
      const cssH = 150;
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const now = performance.now();
      const t = (now - start) / 1000;
      drawScene(type, ctx, cssW, cssH, t, now);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [type]);

  return (
    <canvas
      ref={ref}
      style={{
        width: "100%",
        height: 150,
        display: "block",
        borderRadius: 14,
        background: "#0e0c1f",
        border: "2px solid #0d0b1c",
        boxShadow: "inset 0 3px 10px rgba(0,0,0,0.6)",
        marginBottom: "1rem",
      }}
    />
  );
}

/* ------------------------------------------------------------------ */

export default function Effects() {
  const ordered: PowerUpType[] = [...ALL_POWER_UP_TYPES];

  return (
    <div className="arcade-bg" style={{ justifyContent: "flex-start" }}>
      <style>{`
        .fx-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 340px));
          gap: 1.5rem;
          justify-content: center;
          width: 100%;
          max-width: 1100px;
          z-index: 2;
        }
      `}</style>

      <div style={{ textAlign: "center", marginBottom: "1.5rem", zIndex: 2 }}>
        <Link to="/" style={{ color: "var(--text-dim)", fontWeight: 700, textDecoration: "none", fontSize: "0.95rem" }}>
          ← Back to menu
        </Link>
        <h1 style={{
          fontFamily: "'Fredoka', sans-serif",
          fontSize: "clamp(2rem, 5vw, 3.2rem)",
          fontWeight: 900, color: "#FFD13B", margin: "0.5rem 0 0.25rem",
          textTransform: "uppercase", letterSpacing: "0.04em",
          textShadow: "0 3px 0 #9E1320, 0 6px 0 #0D0B1C",
        }}>
          Ability Lab ✨
        </h1>
        <p style={{ color: "var(--text-dim)", fontWeight: 600, maxWidth: 600, margin: "0 auto" }}>
          All {ordered.length} abilities, demoed live with the real in-game characters —{" "}
          <span style={{ color: "#FF8A96" }}>IT (red tag, chasing)</span> vs{" "}
          <span style={{ color: "#4ECDC4" }}>YOU (escaping)</span>.
          <br />
          Each demo plays automatically on loop — just watch.
          <br />
          <span style={{ color: "#2ED573" }}>
            Every ability fires automatically the moment you grab its orb — no buttons to press, no cooldowns.
          </span>
        </p>
      </div>

      <div className="fx-grid">
        {ordered.map((type) => {
          const c = POWER_UP_CONFIGS[type];
          return (
            <div
              key={type}
              className="arcade-card"
              style={{ padding: "1.25rem", borderColor: c.color, textAlign: "left" }}
            >
              <DemoCanvas type={type} />
              <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--text-muted)", marginBottom: "0.4rem" }}>
                🎬 {SCENARIO[type]}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", marginBottom: "0.5rem" }}>
                <span style={{
                  width: 46, height: 46, borderRadius: 12, flexShrink: 0,
                  background: c.color, border: "3px solid #0D0B1C",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem",
                }}>
                  {c.icon}
                </span>
                <div>
                  <div style={{ fontFamily: "'Fredoka', sans-serif", fontWeight: 800, color: "#fff", fontSize: "1.15rem", lineHeight: 1.1 }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 900, letterSpacing: "0.08em", color: c.color }}>
                    {TAGLINE[type]}
                  </div>
                </div>
                <span style={{
                  marginLeft: "auto", fontSize: "0.7rem", fontWeight: 900,
                  padding: "0.2rem 0.55rem", borderRadius: 8,
                  background: "rgba(46,213,115,.15)",
                  color: "#2ED573",
                  border: "2px solid #2ED573",
                  whiteSpace: "nowrap",
                }}>
                  ⚡ AUTO ON PICKUP
                </span>
              </div>

              <p style={{ color: "var(--text-dim)", fontSize: "0.92rem", margin: "0 0 0.6rem", minHeight: "2.2em" }}>
                {c.description}. {HOW_TO_USE[type]}
              </p>

              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={pillStyle}>⏱ In-game duration: {formatSec(c.durationMs)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <Link to="/" className="arcade-btn arcade-btn-yellow" style={{ marginTop: "2rem", zIndex: 2, textDecoration: "none" }}>
        ▶ Play now
      </Link>
    </div>
  );
}

const pillStyle: React.CSSProperties = {
  fontSize: "0.78rem",
  fontWeight: 800,
  color: "#E0E0FF",
  background: "rgba(255,255,255,0.06)",
  border: "2px solid var(--border-arcade)",
  borderRadius: 8,
  padding: "0.25rem 0.6rem",
};
