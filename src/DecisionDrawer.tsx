import { useState, useEffect, useRef, useCallback } from "react";

interface Props {
  showToast: (msg: string, ok: boolean) => void;
}

type Mode = "menu" | "coin" | "dice" | "wheel";

const WHEEL_COLORS = [
  "#7c6af7","#5851d8","#9d8cf5","#4a3fa0",
  "#c4b8ff","#6366f1","#a78bfa","#818cf8",
];

// Pip grid: 3×3 positions [left%, top%]
// 0=tl  1=tc  2=tr
// 3=ml  4=mc  5=mr
// 6=bl  7=bc  8=br
const PIP_POS = [
  [22, 22],[50, 22],[78, 22],
  [22, 50],[50, 50],[78, 50],
  [22, 78],[50, 78],[78, 78],
];
const PIP_LAYOUTS = [
  [4],                // 1
  [2, 6],             // 2
  [2, 4, 6],          // 3
  [0, 2, 6, 8],       // 4
  [0, 2, 4, 6, 8],    // 5
  [0, 2, 3, 5, 6, 8], // 6
];

function DiceFace({ value, rolling }: { value: number; rolling: boolean }) {
  const pips = value >= 0 && value <= 5 ? PIP_LAYOUTS[value] : [];
  return (
    <div className={`dice-box${rolling ? " is-rolling" : ""}`}>
      {pips.map((pos, i) => (
        <span
          key={i}
          className="dice-pip"
          style={{ left: `${PIP_POS[pos][0]}%`, top: `${PIP_POS[pos][1]}%` }}
        />
      ))}
    </div>
  );
}

export function DecisionDrawer({ showToast }: Props) {
  const [mode, setMode] = useState<Mode>("menu");

  // ── Coin ────────────────────────────────────────────────────────────────────
  const [coinRotation, setCoinRotation] = useState(0);
  const [coinFace, setCoinFace]         = useState<"H" | "T" | null>(null);
  const [coinFlipping, setCoinFlipping] = useState(false);

  // ── Dice ────────────────────────────────────────────────────────────────────
  const [diceDisplay, setDiceDisplay] = useState(0);
  const [diceRolled, setDiceRolled]   = useState(false);
  const [diceRolling, setDiceRolling] = useState(false);
  const diceTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Wheel ───────────────────────────────────────────────────────────────────
  const [wheelItems, setWheelItems]     = useState(["Option A", "Option B", "Option C"]);
  const [wheelInput, setWheelInput]     = useState("");
  const [wheelAngle, setWheelAngle]     = useState(0);
  const [wheelSpinning, setWheelSpinning] = useState(false);
  const [wheelResult, setWheelResult]   = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number | null>(null);

  const goTo = (m: Mode) => {
    setMode(m);
    setCoinFlipping(false);
    setDiceRolling(false);
    setWheelSpinning(false);
    setWheelResult(null);
  };

  useEffect(() => () => {
    if (diceTimer.current) clearInterval(diceTimer.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Coin flip ────────────────────────────────────────────────────────────────
  const doFlip = useCallback(() => {
    if (coinFlipping) return;
    const result: "H" | "T" = Math.random() < 0.5 ? "H" : "T";
    const targetMod = result === "H" ? 0 : 180;
    const delta = ((targetMod - coinRotation % 360) + 360) % 360;
    setCoinRotation(r => r + delta + 5 * 360);
    setCoinFlipping(true);
    setTimeout(() => {
      setCoinFace(result);
      setCoinFlipping(false);
      showToast(`🪙 ${result === "H" ? "Heads!" : "Tails!"}`, true);
    }, 1400);
  }, [coinFlipping, coinRotation, showToast]);

  // ── Dice roll ────────────────────────────────────────────────────────────────
  const doRoll = useCallback(() => {
    if (diceRolling) return;
    const result = Math.floor(Math.random() * 6);
    setDiceRolling(true);
    let count = 0;
    diceTimer.current = setInterval(() => {
      setDiceDisplay(Math.floor(Math.random() * 6));
      count++;
      if (count >= 18) {
        clearInterval(diceTimer.current!);
        setDiceDisplay(result);
        setDiceRolled(true);
        setDiceRolling(false);
        showToast(`🎲 ${result + 1}`, true);
      }
    }, 75);
  }, [diceRolling, showToast]);

  // ── Wheel draw ───────────────────────────────────────────────────────────────
  const drawWheel = useCallback((angleDeg: number, items: string[]) => {
    const canvas = canvasRef.current;
    if (!canvas || items.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr  = window.devicePixelRatio || 1;
    const SIZE = 160;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const cx  = SIZE / 2;
    const cy  = SIZE / 2;
    const r   = cx - 6;
    const sliceRad = (2 * Math.PI) / items.length;
    const angleRad = (angleDeg * Math.PI) / 180;

    items.forEach((item, i) => {
      const start = angleRad + i * sliceRad;
      const end   = start + sliceRad;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length];
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.28)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const fs = Math.max(7, Math.min(10, Math.floor(150 / items.length / 1.4)));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + sliceRad / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = `bold ${fs}px system-ui,sans-serif`;
      const label = item.length > 10 ? item.slice(0, 9) + "…" : item;
      ctx.fillText(label, r - 7, 4);
      ctx.restore();
    });

    // Center circle
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, 2 * Math.PI);
    ctx.fillStyle = "#0a0a12";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Pointer triangle at top
    ctx.beginPath();
    ctx.moveTo(cx - 8, 1);
    ctx.lineTo(cx + 8, 1);
    ctx.lineTo(cx, 17);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 5;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }, []);

  // Setup canvas DPR when entering wheel mode
  useEffect(() => {
    if (mode !== "wheel") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = 160 * dpr;
    canvas.height = 160 * dpr;
    canvas.style.width  = "160px";
    canvas.style.height = "160px";
    drawWheel(wheelAngle, wheelItems);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode === "wheel") drawWheel(wheelAngle, wheelItems);
  }, [wheelItems, wheelAngle, mode, drawWheel]);

  // ── Spin wheel ───────────────────────────────────────────────────────────────
  const spinWheel = useCallback(() => {
    if (wheelSpinning || wheelItems.length < 2) return;
    setWheelSpinning(true);
    setWheelResult(null);

    const items     = wheelItems; // snapshot
    const totalDeg  = (5 + Math.floor(Math.random() * 3)) * 360 + Math.random() * 360;
    const duration  = 3500;
    const startAngle = wheelAngle;
    const startTime  = performance.now();

    const frame = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      const current = startAngle + totalDeg * eased;
      setWheelAngle(current);
      drawWheel(current, items);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        const rot          = current % 360;
        const pointerAngle = ((270 - rot) % 360 + 360) % 360;
        const sliceDeg     = 360 / items.length;
        const winnerIdx    = Math.floor(pointerAngle / sliceDeg) % items.length;
        const winner       = items[winnerIdx];
        setWheelResult(winner);
        setWheelSpinning(false);
        showToast(`🎯 ${winner}`, true);
      }
    };

    rafRef.current = requestAnimationFrame(frame);
  }, [wheelSpinning, wheelItems, wheelAngle, drawWheel, showToast]);

  const addItem = () => {
    const t = wheelInput.trim();
    if (!t || wheelItems.includes(t)) return;
    setWheelItems(prev => [...prev, t]);
    setWheelInput("");
    setWheelResult(null);
  };

  const removeItem = (idx: number) => {
    setWheelItems(prev => prev.filter((_, i) => i !== idx));
    setWheelResult(null);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="decision-drawer">
      <div className="decision-eyebrow-row">
        <p className="decision-eyebrow">Decision Maker</p>
        {mode !== "menu" && (
          <button className="decision-back-btn" onPointerUp={() => goTo("menu")}>← Back</button>
        )}
      </div>

      {/* ── Menu ── */}
      {mode === "menu" && (
        <div className="decision-choices">
          <button className="decision-choice" onPointerUp={() => goTo("coin")}>
            <span className="decision-choice-icon">🪙</span>
            <span className="decision-choice-label">Coin Flip</span>
          </button>
          <button className="decision-choice" onPointerUp={() => goTo("dice")}>
            <span className="decision-choice-icon">🎲</span>
            <span className="decision-choice-label">Roll Dice</span>
          </button>
          <button className="decision-choice decision-choice--wide" onPointerUp={() => goTo("wheel")}>
            <span className="decision-choice-icon">🎡</span>
            <span className="decision-choice-label">Spin Wheel</span>
          </button>
        </div>
      )}

      {/* ── Coin ── */}
      {mode === "coin" && (
        <div className="decision-coin-area">
          <div className="coin-viewport">
            <div className="coin" style={{ transform: `rotateY(${coinRotation}deg)` }}>
              <div className="coin-face coin-front">
                <span className="coin-symbol">♛</span>
              </div>
              <div className="coin-face coin-back">
                <span className="coin-symbol">★</span>
              </div>
            </div>
          </div>
          {coinFace && !coinFlipping && (
            <p className="decision-result">{coinFace === "H" ? "Heads!" : "Tails!"}</p>
          )}
          <button className="decision-spin-btn" onPointerUp={doFlip} disabled={coinFlipping}>
            {coinFlipping ? "Flipping…" : coinFace ? "Flip Again" : "Flip!"}
          </button>
        </div>
      )}

      {/* ── Dice ── */}
      {mode === "dice" && (
        <div className="decision-dice-area">
          <div className="dice-perspective">
            {!diceRolled && !diceRolling ? (
              <div className="dice-box dice-idle">🎲</div>
            ) : (
              <DiceFace value={diceDisplay} rolling={diceRolling} />
            )}
          </div>
          <button className="decision-spin-btn" onPointerUp={doRoll} disabled={diceRolling}>
            {diceRolling ? "Rolling…" : diceRolled ? "Roll Again" : "Roll!"}
          </button>
        </div>
      )}

      {/* ── Wheel ── */}
      {mode === "wheel" && (
        <div className="decision-wheel-area">
          <div className="wheel-canvas-wrap">
            <canvas ref={canvasRef} />
          </div>
          {wheelResult && (
            <p className="decision-result">🎯 {wheelResult}</p>
          )}
          <button
            className="decision-spin-btn"
            onPointerUp={spinWheel}
            disabled={wheelSpinning || wheelItems.length < 2}
          >
            {wheelSpinning ? "Spinning…" : "Spin!"}
          </button>
          <div className="wheel-items">
            {wheelItems.map((item, i) => (
              <div key={i} className="wheel-item-row">
                <span className="wheel-dot" style={{ background: WHEEL_COLORS[i % WHEEL_COLORS.length] }} />
                <span className="wheel-item-name">{item}</span>
                <button className="wheel-remove-btn" onPointerUp={() => removeItem(i)}>✕</button>
              </div>
            ))}
          </div>
          <div className="wheel-add-row">
            <input
              className="settings-input"
              placeholder="Add option…"
              value={wheelInput}
              onChange={e => setWheelInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addItem()}
            />
            <button className="settings-add-btn" onPointerUp={addItem}>+</button>
          </div>
        </div>
      )}
    </div>
  );
}
