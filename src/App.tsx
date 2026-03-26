import React, { useState, useEffect, useRef, useCallback } from "react";
import type { GameConfig, GameState, AppSettings } from "./types";
import { ArrowRight, Check, X } from "tabler-icons-react";

const STORAGE_KEY = "barry40_session";

interface SessionSnapshot {
  gameState: GameState;
  qIndex: number;
  bank: number; // sub-screen bank (cash builder)
  timerSeconds: number;
  showAnswer?: boolean;
  typedAnswer?: string;
  selectedOpt?: string;
  chaserOpt?: string;
  showResult?: boolean;
  isPlayerTurn?: boolean;
  isPartyChaserTurn?: boolean;
  chaserSelected?: boolean;
  chaserCorrect?: boolean;
}

function saveSession(snap: SessionSnapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch {
    // ignore
  }
}

function loadSession(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as SessionSnapshot;
    // Validate: must have config with settings (old/malformed sessions won't)
    if (!snap?.gameState?.config?.settings) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return snap;
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

const eur = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

// -- Custom Timer Hook --
function useTimer(
  initialSeconds: number,
  onExpire: () => void,
  isActive: boolean,
) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const onExpireRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isActive && seconds > 0) {
      interval = setInterval(() => {
        setSeconds((s) => {
          if (s <= 1) {
            clearInterval(interval);
            if (onExpireRef.current) onExpireRef.current();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, seconds]);

  return { seconds, setSeconds };
}

// -- Global Timer Border Component --
function TimerBorder({
  currentSeconds,
  totalSeconds,
}: {
  currentSeconds: number;
  totalSeconds: number;
}) {
  const percentage = totalSeconds > 0 ? currentSeconds / totalSeconds : 0;
  const hue = percentage * 120; // 120: green, 0: red
  const color = `hsl(${hue}, 100%, 50%)`;

  const redBlur = 2 + (1 - percentage) * 15;
  const orangeBlur = 5 + (1 - percentage) * 25;
  const filter =
    percentage < 0.3
      ? `drop-shadow(0 0 ${redBlur}px red) drop-shadow(0 0 ${orangeBlur}px orange)`
      : `drop-shadow(0 0 5px ${color})`;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100dvw",
        height: "100dvh",
        pointerEvents: "none",
        zIndex: 9999,
        overflow: "visible",
      }}
    >
      <rect
        x="0"
        y="0"
        width="100"
        height="100"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength="100"
        strokeDasharray="100"
        strokeDashoffset={100 - percentage * 100}
        style={{
          transition: "stroke-dashoffset 1s linear, stroke 1s linear",
          filter,
        }}
      />
    </svg>
  );
}

// -- Shake-to-Pause Hook --
function useShakeToPause(enabled: boolean, onShake: () => void) {
  const lastShake = useRef(0);
  const onShakeRef = useRef(onShake);

  useEffect(() => {
    onShakeRef.current = onShake;
  }, [onShake]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof DeviceMotionEvent === "undefined") return;

    const THRESHOLD = 15; // m/s²
    const COOLDOWN = 2000; // ms between triggers

    const handleMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const { x, y, z } = acc;
      if (x === null || y === null || z === null) return;
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();
      if (magnitude > THRESHOLD && now - lastShake.current > COOLDOWN) {
        lastShake.current = now;
        onShakeRef.current();
      }
    };

    const DM = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof DM.requestPermission === "function") {
      // iOS 13+: must request inside a user gesture — hook onto first touchend
      const requestOnGesture = () => {
        DM.requestPermission!()
          .then((perm) => {
            if (perm === "granted") window.addEventListener("devicemotion", handleMotion);
          })
          .catch(() => {});
      };
      window.addEventListener("touchend", requestOnGesture, { once: true });
      return () => {
        window.removeEventListener("touchend", requestOnGesture);
        window.removeEventListener("devicemotion", handleMotion);
      };
    }

    window.addEventListener("devicemotion", handleMotion);
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [enabled]);
}

// -- Pause Modal (shake-triggered) --
function PauseModal({ onResume, onQuit }: { onResume: () => void; onQuit: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
      }}
    >
      <div
        style={{
          background: "#1e1e2e",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "16px",
          padding: "2.5rem",
          maxWidth: "420px",
          width: "90%",
          textAlign: "center",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⏸️</div>
        <h2 style={{ marginBottom: "0.5rem" }}>Game Paused</h2>
        <p style={{ opacity: 0.7, marginBottom: "2rem" }}>Shake detected. Ready to continue?</p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onResume}>
            Resume
          </button>
          <button
            className="btn"
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
            onClick={onQuit}
          >
            Quit game
          </button>
        </div>
      </div>
    </div>
  );
}

// -- Resume Confirmation Modal --
function ResumeModal({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
      }}
    >
      <div
        style={{
          background: "#1e1e2e",
          border: "1px solid var(--panel-border, rgba(255,255,255,0.1))",
          borderRadius: "16px",
          padding: "2.5rem",
          maxWidth: "420px",
          width: "90%",
          textAlign: "center",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⏸️</div>
        <h2 style={{ marginBottom: "0.5rem" }}>In the middle of a question</h2>
        <p style={{ opacity: 0.7, marginBottom: "2rem" }}>
          You have a game in progress. Would you like to continue where you left off?
        </p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onYes}>
            Continue now
          </button>
          <button
            className="btn"
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
            onClick={onNo}
          >
            Start fresh
          </button>
        </div>
      </div>
    </div>
  );
}

// -- Main App Component --
function App() {
  const savedSession = useRef<SessionSnapshot | null>(loadSession());
  const [showResumeModal, setShowResumeModal] = useState<boolean>(() => {
    const s = savedSession.current;
    if (!s) return false;
    const activePhases = ["CASH_BUILDER", "THE_CHASE"];
    return activePhases.includes(s.gameState.phase) && s.timerSeconds > 0;
  });
  const [sessionToRestore, setSessionToRestore] = useState<SessionSnapshot | null>(
    () => savedSession.current
  );

  const [gameState, setGameState] = useState<GameState>(() => {
    const s = savedSession.current;
    if (s) return s.gameState;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("loser")) {
      const amount = parseInt(urlParams.get("loser") || "") || 800;
      return { phase: "LAST_CHANCE", bank: amount, config: null, playerPos: 3, chaserPos: 0 };
    }
    return {
      phase: "MENU",
      bank: 0,
      config: null,
      playerPos: 3,
      chaserPos: 0,
    };
  });

  const [showPauseModal, setShowPauseModal] = useState(false);

  const activeGamePhases = ["CASH_BUILDER", "THE_CHASE"];
  useShakeToPause(
    activeGamePhases.includes(gameState.phase) && !showResumeModal,
    useCallback(() => setShowPauseModal(true), []),
  );

  const handlePauseResume = useCallback(() => setShowPauseModal(false), []);
  const handlePauseQuit = useCallback(() => {
    clearSession();
    setShowPauseModal(false);
    setGameState((prev) => ({ phase: "MENU", bank: 0, config: prev.config, playerPos: 3, chaserPos: 0 }));
  }, []);

  const [error, setError] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [jsonUrl, setJsonUrl] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("quiz") || `${import.meta.env.BASE_URL}default_questions.json`;
  });

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}settings.json`)
      .then((res) => res.json())
      .then((data) => setAppSettings(data))
      .catch((err) => console.error("Failed to load settings.json", err));
  }, []);

  const loadConfig = (url: string) => {
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data: GameConfig) => {
        const randomizedBuilder = [...data.cashBuilder];
        const randomizedTheChase = [...data.theChase];
        for (let i = randomizedBuilder.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [randomizedBuilder[i], randomizedBuilder[j]] = [randomizedBuilder[j], randomizedBuilder[i]];
        }
        for (let i = randomizedTheChase.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [randomizedTheChase[i], randomizedTheChase[j]] = [randomizedTheChase[j], randomizedTheChase[i]];
        }
        setGameState((prev) => ({
          ...prev,
          config: {
            ...data,
            cashBuilder: randomizedBuilder,
            theChase: randomizedTheChase,
            // Preserve existing settings if we're mid-game (e.g. restoring from localStorage)
            // The raw JSON doesn't have merged settings; startGame puts them there.
            settings: prev.config?.settings ?? data.settings,
          },
        }));
        setError("");
        setJsonUrl(url);

        const count =
          (data.cashBuilder?.length || 0) + (data.theChase?.length || 0);
        setToastMsg(`${count} questions loaded`);
        setTimeout(() => setToastMsg(""), 3000);
      })
      .catch((err) => {
        console.error(err);
        setError(`Could not load quiz from ${url}`);
      });
  };

  useEffect(() => {
    loadConfig(jsonUrl);
  }, [jsonUrl]);

  // Use a ref so onSaveSession always has access to the latest gameState
  // without causing the callback to be recreated on every render.
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  });

  const onSaveSession = useCallback(
    (snap: Omit<SessionSnapshot, "gameState">) => {
      saveSession({ ...snap, gameState: gameStateRef.current });
    },
    [] // stable — reads from ref
  );

  // Keep session up to date when gameState changes (for phases that don't re-save themselves)
  useEffect(() => {
    const phase = gameState.phase;
    if (phase === "CHASE_SETUP" || phase === "MENU" || phase.startsWith("END_")) {
      if (phase === "MENU" || phase.startsWith("END_")) {
        clearSession();
      } else {
        saveSession({
          gameState,
          qIndex: 0,
          bank: gameState.bank,
          timerSeconds: 0,
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.phase]);

  if (error && !gameState.config) {
    return (
      <div className="glass-panel">
        <h1 style={{ color: "var(--danger)" }}>Error loading questions</h1>
        <p className="text-center">{error}</p>
        <button
          className="btn btn-primary"
          onClick={() => (window.location.href = import.meta.env.BASE_URL)}
        >
          Retry Default
        </button>
      </div>
    );
  }

  if ((!gameState.config || !appSettings) && gameState.phase !== "LAST_CHANCE") {
    return (
      <div className="glass-panel">
        <h1>Loading...</h1>
      </div>
    );
  }

  // --- Phase Handlers ---
  const startGame = (customSettings: GameConfig["settings"]) => {
    setGameState((s) => {
      return {
        ...s,
        phase: "CASH_BUILDER",
        bank: 0,
        config: {
          ...s.config!,
          settings: { ...s.config!.settings, ...customSettings },
        },
      };
    });
  };

  const onCashBuilderComplete = (earned: number) =>
    setGameState((s) => ({ ...s, phase: "CHASE_SETUP", bank: earned }));
  const startChase = (offer: {
    bank: number;
    playerPos: number;
    activeAccuracy: number;
  }) =>
    setGameState((s) => ({
      ...s,
      phase: "THE_CHASE",
      bank: offer.bank,
      playerPos: offer.playerPos,
      chaserPos: 0,
      activeAccuracy: offer.activeAccuracy,
    }));
  const endGame = (win: boolean) =>
    setGameState((s) => ({ ...s, phase: win ? "END_WIN" : "LAST_CHANCE" }));
  const restart = () => {
    clearSession();
    setSessionToRestore(null);
    setGameState((s) => ({
      ...s,
      phase: "MENU",
      bank: 0,
      playerPos: 3,
      chaserPos: 0,
    }));
  };

  const handleResumeYes = () => {
    setShowResumeModal(false);
    // session stays in sessionToRestore; screens will pick it up
  };

  const handleResumeNo = () => {
    clearSession();
    setSessionToRestore(null);
    setShowResumeModal(false);
    setGameState({
      phase: "MENU",
      bank: 0,
      config: gameState.config,
      playerPos: 3,
      chaserPos: 0,
    });
  };

  return (
    <>
      {showResumeModal && (
        <ResumeModal onYes={handleResumeYes} onNo={handleResumeNo} />
      )}
      {showPauseModal && (
        <PauseModal onResume={handlePauseResume} onQuit={handlePauseQuit} />
      )}
      {gameState.phase === "MENU" && gameState.config && appSettings && (
        <MenuScreen
          key={`${jsonUrl}-${JSON.stringify(gameState.config.settings)}`}
          onStart={startGame}
          config={gameState.config}
          defaultUrl={jsonUrl}
          onLoadUrl={loadConfig}
          loadError={error}
          appSettings={appSettings}
        />
      )}
      {gameState.phase === "CASH_BUILDER" && !showResumeModal && gameState.config && (
        <CashBuilderScreen
          config={gameState.config}
          onComplete={onCashBuilderComplete}
          onSaveSession={onSaveSession}
          restoredSession={sessionToRestore}
          isPaused={showPauseModal}
        />
      )}
      {gameState.phase === "CHASE_SETUP" && gameState.config && (
        <ChaseSetupScreen
          config={gameState.config}
          bank={gameState.bank}
          onStart={startChase}
        />
      )}
      {gameState.phase === "THE_CHASE" && !showResumeModal && gameState.config && (
        <TheChaseScreen
          config={gameState.config}
          bank={gameState.bank}
          gameState={gameState}
          setGameState={setGameState}
          onEnd={endGame}
          onSaveSession={onSaveSession}
          restoredSession={sessionToRestore}
          isPaused={showPauseModal}
        />
      )}
      {gameState.phase === "LAST_CHANCE" && (
        <LastChanceScreen
          bank={gameState.bank}
          lowerPct={gameState.config?.settings?.lastChanceLowerPct ?? appSettings?.defaultLastChanceLowerPct ?? 15}
          upperPct={gameState.config?.settings?.lastChanceUpperPct ?? appSettings?.defaultLastChanceUpperPct ?? 25}
          onRestart={restart}
        />
      )}
      {gameState.phase.startsWith("END_") && (
        <EndScreen
          win={gameState.phase === "END_WIN"}
          bank={gameState.bank}
          onRestart={restart}
        />
      )}
      {/* Toast Notification */}
      {toastMsg && (
        <div
          style={{
            position: "fixed",
            bottom: "2rem",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--success)",
            color: "white",
            padding: "0.75rem 1.5rem",
            borderRadius: "0.5rem",
            boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
            zIndex: 10000,
          }}
        >
          ✅ {toastMsg}
        </div>
      )}
    </>
  );
}

// -- Sub Components --

function MenuScreen({
  onStart,
  config,
  defaultUrl,
  onLoadUrl,
  loadError,
  appSettings,
}: {
  onStart: (s: GameConfig["settings"]) => void;
  config: GameConfig;
  defaultUrl: string;
  onLoadUrl: (url: string) => void;
  loadError: string;
  appSettings: AppSettings;
}) {
  const [customSettings, setCustomSettings] = useState(() => ({
    cashBuilderMaxQuestions:
      config.settings?.cashBuilderMaxQuestions ??
      appSettings.defaultCashBuilderMaxQuestions,
    cashBuilderTimeSeconds:
      config.settings?.cashBuilderTimeSeconds ??
      appSettings.defaultCashBuilderTimeSeconds,
    chaseTimePerQuestionSeconds:
      config.settings?.chaseTimePerQuestionSeconds ??
      appSettings.defaultChaseTimePerQuestionSeconds,
    partyMode: config.settings?.partyMode ?? appSettings.defaultPartyMode,
    chaserAccuracyPercentage:
      config.settings?.chaserAccuracyPercentage ??
      appSettings.defaultChaserAccuracyPercentage,
    cashPerCorrectAnswer:
      config.settings?.cashPerCorrectAnswer ??
      appSettings.defaultCashPerCorrectAnswer,
    chaserRoundLength:
      config.settings?.chaserRoundLength ??
      appSettings.defaultChaserRoundLength,
    lastChanceLowerPct:
      config.settings?.lastChanceLowerPct ??
      appSettings.defaultLastChanceLowerPct,
    lastChanceUpperPct:
      config.settings?.lastChanceUpperPct ??
      appSettings.defaultLastChanceUpperPct,
    highOfferMultiplier:
      config.settings?.highOfferMultiplier ??
      appSettings.defaultHighOfferMultiplier,
    lowOfferMultiplier:
      config.settings?.lowOfferMultiplier ??
      appSettings.defaultLowOfferMultiplier,
  }));
  const [urlInput, setUrlInput] = useState(defaultUrl);

  return (
    <div className="glass-panel">
      <h1>The Triple Chase</h1>
      <p className="text-center">Welcome! Configure your game below.</p>

      <div
        style={{
          marginTop: "1rem",
          background: "rgba(0,0,0,0.2)",
          padding: "1.5rem",
          borderRadius: "12px",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              marginBottom: "0.5rem",
              fontWeight: "bold",
            }}
          >
            Load Custom Questions (JSON URL):
          </label>
          <div className="flex-row">
            <input
              type="text"
              className="input-text"
              style={{
                flex: 1,
                padding: "0.5rem",
                fontSize: "1rem",
                textAlign: "left",
              }}
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
            />
            <button
              className="btn btn-primary"
              style={{ padding: "0.5rem 1rem" }}
              onClick={() => onLoadUrl(urlInput)}
            >
              Load
            </button>
          </div>
          {loadError && (
            <p
              style={{
                color: "var(--danger)",
                fontSize: "0.9rem",
                marginTop: "0.5rem",
              }}
            >
              {loadError}
            </p>
          )}
        </div>

        <div
          style={{
            borderTop: "1px solid var(--panel-border)",
            paddingTop: "1.25rem",
          }}
        >
          <label
            style={{
              display: "block",
              marginBottom: "0.5rem",
              fontWeight: "bold",
            }}
          >
            Game Rules:
          </label>
          <div
            className="flex-row"
            style={{ alignItems: "center", marginBottom: "0.75rem" }}
          >
            <label style={{ flex: 2 }}>Cash Builder Timer (s):</label>
            <input
              type="number"
              className="input-text"
              style={{ flex: 1, padding: "0.5rem", fontSize: "1.1rem" }}
              value={customSettings.cashBuilderTimeSeconds}
              onChange={(e) =>
                setCustomSettings((s) => ({
                  ...s,
                  cashBuilderTimeSeconds: parseInt(e.target.value),
                }))
              }
            />
          </div>

          <div
            className="flex-row"
            style={{ alignItems: "center", marginBottom: "0.75rem" }}
          >
            <label style={{ flex: 2 }}>Chase Question Timer (s):</label>
            <input
              type="number"
              className="input-text"
              style={{ flex: 1, padding: "0.5rem", fontSize: "1.1rem" }}
              value={customSettings.chaseTimePerQuestionSeconds}
              onChange={(e) =>
                setCustomSettings((s) => ({
                  ...s,
                  chaseTimePerQuestionSeconds: parseInt(e.target.value),
                }))
              }
            />
          </div>

          <div
            className="flex-row"
            style={{ alignItems: "center", marginBottom: "0.75rem" }}
          >
            <label style={{ flex: 2 }}>Cash Per Right Answer (€):</label>
            <input
              type="number"
              className="input-text"
              style={{ flex: 1, padding: "0.5rem", fontSize: "1.1rem" }}
              value={customSettings.cashPerCorrectAnswer}
              onChange={(e) =>
                setCustomSettings((s) => ({
                  ...s,
                  cashPerCorrectAnswer:
                    parseInt(e.target.value) ||
                    appSettings.defaultCashPerCorrectAnswer,
                }))
              }
            />
          </div>

          <div
            className="flex-row"
            style={{ alignItems: "center", marginBottom: "0.75rem" }}
          >
            <label style={{ flex: 2 }}>Chaser Round Length (Steps):</label>
            <input
              type="number"
              className="input-text"
              style={{ flex: 1, padding: "0.5rem", fontSize: "1.1rem" }}
              value={customSettings.chaserRoundLength}
              onChange={(e) =>
                setCustomSettings((s) => ({
                  ...s,
                  chaserRoundLength:
                    parseInt(e.target.value) ||
                    appSettings.defaultChaserRoundLength,
                }))
              }
            />
          </div>

          <div className="flex-row" style={{ alignItems: "center" }}>
            <label style={{ flex: 2 }}>Party Mode (Host grading):</label>
            <input
              type="checkbox"
              style={{ width: "24px", height: "24px", marginRight: "1rem" }}
              checked={customSettings.partyMode}
              onChange={(e) =>
                setCustomSettings((s) => ({
                  ...s,
                  partyMode: e.target.checked,
                }))
              }
            />
          </div>
        </div>
      </div>

      <button
        className="btn btn-primary"
        onClick={() => onStart(customSettings)}
        style={{ marginTop: "1rem" }}
      >
        <span className="flex-row" style={{ justifyContent: "center", alignItems: "center" }}>
          Start Game
          <ArrowRight size={18} />
        </span>
      </button>
    </div>
  );
}

function CashBuilderScreen({
  config,
  onComplete,
  onSaveSession,
  restoredSession,
  isPaused = false,
}: {
  config: GameConfig;
  onComplete: (bank: number) => void;
  onSaveSession: (snap: Omit<SessionSnapshot, "gameState">) => void;
  restoredSession: SessionSnapshot | null;
  isPaused?: boolean;
}) {
  const questions = config.cashBuilder;
  const poolLen = questions.length;
  const rawCap = config.settings.cashBuilderMaxQuestions ?? poolLen;
  const maxQuestions =
    poolLen === 0 ? 0 : Math.min(poolLen, Math.max(1, rawCap));

  const [qIndex, setQIndex] = useState(() => {
    const r = restoredSession?.qIndex ?? 0;
    if (maxQuestions <= 0) return 0;
    return Math.min(r, maxQuestions - 1);
  });
  const [bank, setBank] = useState(() => restoredSession?.bank ?? 0);
  const [isActive, setIsActive] = useState(true);
  const [showAnswer, setShowAnswer] = useState(() => restoredSession?.showAnswer ?? false);
  const [typedAnswer, setTypedAnswer] = useState(() => restoredSession?.typedAnswer ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  const restoredSeconds = restoredSession?.timerSeconds ?? config.settings.cashBuilderTimeSeconds;
  const { seconds } = useTimer(
    restoredSeconds,
    () => {
      setIsActive(false);
      setTimeout(() => onComplete(bank), 2000); // Wait 2s before transitioning
    },
    isActive && !isPaused,
  );

  // Save session continuously
  useEffect(() => {
    if (!isActive) return;
    onSaveSession({
      qIndex,
      bank,
      timerSeconds: seconds,
      showAnswer,
      typedAnswer,
    });
  }, [qIndex, bank, seconds, showAnswer, typedAnswer, isActive, onSaveSession]);

  const currentQ = questions[qIndex] || {
    question: "No more questions!",
    answer: "",
  };
  const isPartyMode = config.settings.partyMode;

  useEffect(() => {
    if (isActive && !isPartyMode && inputRef.current) inputRef.current.focus();
  }, [isActive, isPartyMode, showAnswer]);

  const handleCorrect = () => {
    const cashValue = config.settings.cashPerCorrectAnswer ?? 1000;
    setBank((b) => b + cashValue);
    nextQuestion();
  };

  const handleWrong = () => {
    nextQuestion();
  };

  const nextQuestion = () => {
    if (maxQuestions > 0 && qIndex + 1 < maxQuestions) {
      setQIndex((i) => i + 1);
      setShowAnswer(false);
      setTypedAnswer("");
      if (isPartyMode) setIsActive(true);
    } else {
      setIsActive(false);
      onComplete(bank);
    }
  };

  const handleTypeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedAnswer.trim()) return;
    setShowAnswer(true);
  };

  const isExactMatch =
    typedAnswer.trim().toLowerCase() === currentQ.answer.toLowerCase();

  return (
    <>
      <TimerBorder
        currentSeconds={seconds}
        totalSeconds={config.settings.cashBuilderTimeSeconds}
      />
      <div className="glass-panel">
        <div className="header-row">
          <div className={`timer ${seconds <= 10 ? "danger" : ""}`}>
            ⏱ {Math.floor(seconds / 60)}:
            {(seconds % 60).toString().padStart(2, "0")}
          </div>
          <div className="bank">
            <span>Bank</span>
            {eur.format(bank)}
          </div>
        </div>
        {maxQuestions > 0 && (
          <p
            style={{
              textAlign: "center",
              marginTop: "0.5rem",
              marginBottom: 0,
              opacity: 0.85,
              fontSize: "1rem",
            }}
          >
            Question {qIndex + 1} / {maxQuestions}
          </p>
        )}

        {seconds > 0 ? (
          <div className="chase-questions text-center">
            <h2 style={{ fontSize: "2rem", marginBottom: "2rem" }}>
              {currentQ.question}
            </h2>

            {isPartyMode ? (
              // PARTY MODE UI
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                  alignItems: "center",
                }}
              >
                {!showAnswer ? (
                  <button
                    className="btn btn-warning"
                    onClick={() => {
                      setShowAnswer(true);
                      setIsActive(false);
                    }}
                    style={{ width: "100%" }}
                  >
                    Reveal Answer
                  </button>
                ) : (
                  <>
                    <h3
                      style={{
                        color: "var(--accent-primary)",
                        fontSize: "1.5rem",
                        marginBottom: "1rem",
                      }}
                    >
                      Answer: {currentQ.answer}
                    </h3>
                    <div
                      className="flex-row"
                      style={{ width: "100%", justifyContent: "center" }}
                    >
                      <button
                        className="btn btn-success flex-1"
                        onClick={handleCorrect}
                      >
                        <span className="flex-row" style={{ justifyContent: "center", alignItems: "center" }}>
                          <Check size={18} />
                          Correct
                        </span>
                      </button>
                      <button
                        className="btn btn-danger flex-1"
                        onClick={handleWrong}
                      >
                        <span className="flex-row" style={{ justifyContent: "center", alignItems: "center" }}>
                          <X size={18} />
                          Wrong
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              // TYPING MODE UI
              <div>
                {!showAnswer ? (
                  <form onSubmit={handleTypeSubmit}>
                    <input
                      ref={inputRef}
                      type="text"
                      className="input-text"
                      placeholder="Type your answer..."
                      value={typedAnswer}
                      onChange={(e) => setTypedAnswer(e.target.value)}
                      disabled={!isActive}
                    />
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ marginTop: "1rem", width: "100%" }}
                      disabled={!typedAnswer.trim()}
                    >
                      Submit
                    </button>
                  </form>
                ) : (
                  <div
                    style={{
                      background: "rgba(0,0,0,0.3)",
                      padding: "1.5rem",
                      borderRadius: "12px",
                    }}
                  >
                    <p style={{ marginBottom: "0.5rem" }}>
                      You answered: <strong>{typedAnswer}</strong>
                    </p>
                    <p>
                      Correct answer:{" "}
                      <strong style={{ color: "var(--success)" }}>
                        {currentQ.answer}
                      </strong>
                    </p>

                    {isExactMatch ? (
                      <div style={{ marginTop: "1rem" }}>
                        <h3 style={{ color: "var(--success)" }}>
                          Perfect Match!
                        </h3>
                        <button
                          className="btn btn-primary"
                          style={{ width: "100%", marginTop: "0.5rem" }}
                          onClick={handleCorrect}
                        >
                          <span className="flex-row" style={{ justifyContent: "center", alignItems: "center" }}>
                            Next
                            <ArrowRight size={18} />
                          </span>
                        </button>
                      </div>
                    ) : (
                      <div style={{ marginTop: "1rem" }}>
                        <h3
                          style={{
                            color: "var(--danger)",
                            marginBottom: "1rem",
                          }}
                        >
                          Incorrect
                        </h3>
                        <div className="flex-row">
                          <button
                            className="btn btn-success flex-1"
                            onClick={handleCorrect}
                          >
                            Actually, I was right
                          </button>
                          <button
                            className="btn btn-danger flex-1"
                            onClick={handleWrong}
                          >
                            Accept Wrong
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center">
            <h2 style={{ color: "var(--danger)" }}>Time's Up!</h2>
            <p>Total Bank: {eur.format(bank)}</p>
          </div>
        )}
      </div>
    </>
  );
}

function ChaseSetupScreen({
  config,
  bank,
  onStart,
}: {
  config: GameConfig;
  bank: number;
  onStart: (offer: {
    bank: number;
    playerPos: number;
    activeAccuracy: number;
  }) => void;
}) {
  const roundLength = config.settings.chaserRoundLength ?? 5;
  const defaultPlayerPos = Math.max(2, Math.floor(roundLength / 3));
  const baseAccuracy = config.settings.chaserAccuracyPercentage;

  const highMultiplier = config.settings.highOfferMultiplier ?? 3;
  const lowMultiplier = config.settings.lowOfferMultiplier ?? 0.4;

  const offers = [
    {
      label: "High",
      bank: bank * highMultiplier,
      playerPos: Math.max(1, defaultPlayerPos - 1),
      activeAccuracy: Math.min(100, baseAccuracy + 5),
      color: "var(--danger)",
    },
    {
      label: "Middle",
      bank: bank,
      playerPos: defaultPlayerPos,
      activeAccuracy: baseAccuracy,
      color: "var(--accent-primary)",
      primary: true,
    },
    {
      label: "Low",
      bank: Math.max(1, Math.floor(bank * lowMultiplier)),
      playerPos: Math.min(roundLength - 1, defaultPlayerPos + 1),
      activeAccuracy: Math.max(0, baseAccuracy - 5),
      color: "var(--success)",
    },
  ];

  return (
    <div
      className="glass-panel text-center"
      style={{ maxWidth: "600px", margin: "0 auto" }}
    >
      <h2>The Offers</h2>
      <p>
        You have brought <strong>{eur.format(bank)}</strong> to the table.
      </p>
      <p>The Chaser is ready to offer you a deal.</p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          marginTop: "2rem",
        }}
      >
        {offers.map((offer, i) => (
          <button
            key={i}
            className="btn"
            style={{
              background: offer.color,
              border: offer.primary ? "4px solid white" : "none",
              color: "white",
              padding: "0.75rem",
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
            onClick={() =>
              onStart({
                bank: offer.bank,
                playerPos: offer.playerPos,
                activeAccuracy: offer.activeAccuracy,
              })
            }
          >
            <span
              style={{
                fontWeight: "bold",
                fontSize: "1.25rem",
                width: "120px",
                textAlign: "left",
              }}
            >
              {eur.format(offer.bank)}
            </span>
            <span
              style={{
                fontSize: "1rem",
                flex: 1,
                textAlign: "right",
                opacity: 0.9,
              }}
            >
              Start <strong>{offer.playerPos}</strong> space
              {offer.playerPos !== 1 ? "s" : ""} ahead
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TheChaseScreen({
  config,
  bank,
  gameState,
  setGameState,
  onEnd,
  onSaveSession,
  restoredSession,
  isPaused = false,
}: {
  config: GameConfig;
  bank: number;
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  onEnd: (w: boolean) => void;
  onSaveSession: (snap: Omit<SessionSnapshot, "gameState">) => void;
  restoredSession: SessionSnapshot | null;
  isPaused?: boolean;
}) {
  const [qIndex, setQIndex] = useState(() => restoredSession?.qIndex ?? 0);
  const [selectedOpt, setSelectedOpt] = useState(() => restoredSession?.selectedOpt ?? "");
  const [chaserSelected, setChaserSelected] = useState(() => restoredSession?.chaserSelected ?? false);
  const [chaserCorrect, setChaserCorrect] = useState(() => restoredSession?.chaserCorrect ?? false);
  const [chaserOpt, setChaserOpt] = useState(() => restoredSession?.chaserOpt ?? "");
  const [showResult, setShowResult] = useState(() => restoredSession?.showResult ?? false);
  const [isPlayerTurn, setIsPlayerTurn] = useState(() => restoredSession?.isPlayerTurn ?? true);
  const [isPartyChaserTurn, setIsPartyChaserTurn] = useState(() => restoredSession?.isPartyChaserTurn ?? false);

  const questions = config.theChase;
  const currentQ = questions[qIndex];
  const boardSteps = config.settings.chaserRoundLength ?? 5;
  const WIN_POS = boardSteps;

  const handlePartyChaserLockIn = (opt: string) => {
    setChaserOpt(opt);
    setIsPartyChaserTurn(false);

    const isCorrect = opt === currentQ?.correct;
    setChaserCorrect(isCorrect);
    setChaserSelected(true);

    setTimeout(() => {
      setShowResult(true);
    }, 1000);
  };

  const handleLockIn = (opt: string) => {
    setSelectedOpt(opt);
    setIsPlayerTurn(false);

    if (config.settings.partyMode) {
      setIsPartyChaserTurn(true);
      return true;
    } else {
      // Simulate Chaser Turn (Immediate)
      const accuracy =
        gameState.activeAccuracy ??
        config.settings.chaserAccuracyPercentage ??
        80;
      const chaserGotsItRight = Math.random() * 100 <= accuracy;
      setChaserCorrect(chaserGotsItRight);
      setChaserSelected(true);

      // Show results
      setTimeout(() => {
        setShowResult(true);
      }, 1000);
      return false;
    }
  };

  const onExpireRef = useRef<(() => void) | null>(null);

  const restoredChaseSeconds =
    restoredSession?.timerSeconds ?? config.settings.chaseTimePerQuestionSeconds;
  const { seconds, setSeconds } = useTimer(
    restoredChaseSeconds,
    () => {
      if (onExpireRef.current) onExpireRef.current();
    },
    !isPaused && !showResult && (isPlayerTurn || isPartyChaserTurn),
  );

  // Save session continuously
  useEffect(() => {
    onSaveSession({
      qIndex,
      bank,
      timerSeconds: seconds,
      selectedOpt,
      chaserOpt,
      showResult,
      isPlayerTurn,
      isPartyChaserTurn,
      chaserSelected,
      chaserCorrect,
    });
  }, [qIndex, bank, seconds, selectedOpt, chaserOpt, showResult, isPlayerTurn, isPartyChaserTurn, chaserSelected, chaserCorrect, onSaveSession]);

  useEffect(() => {
    onExpireRef.current = () => {
      if (isPlayerTurn) {
        const shouldReset = handleLockIn(""); // time out
        if (shouldReset)
          setSeconds(config.settings.chaseTimePerQuestionSeconds);
      } else if (isPartyChaserTurn) {
        handlePartyChaserLockIn("");
      }
    };
  });

  if (!currentQ) {
    // Escaped if run out of questions, or we should loop? Just win for now.
    onEnd(true);
    return null;
  }

  const handleNextPhase = () => {
    // Compute positions
    const pCorrect = selectedOpt === currentQ.correct;
    let newPPos = gameState.playerPos;
    let newCPos = gameState.chaserPos;

    if (pCorrect) newPPos += 1;
    if (chaserCorrect) newCPos += 1;

    if (newCPos >= newPPos) {
      onEnd(false); // Caught
      return;
    }
    if (newPPos >= WIN_POS) {
      onEnd(true); // Won
      return;
    }

    setGameState((s) => ({ ...s, playerPos: newPPos, chaserPos: newCPos }));

    // Reset for next Q
    setSelectedOpt("");
    setChaserOpt("");
    setChaserSelected(false);
    setShowResult(false);
    setIsPlayerTurn(true);
    setIsPartyChaserTurn(false);
    setQIndex((i) => i + 1);
    setSeconds(config.settings.chaseTimePerQuestionSeconds);
  };

  return (
    <>
      <TimerBorder
        currentSeconds={seconds}
        totalSeconds={config.settings.chaseTimePerQuestionSeconds}
      />
      <div className="glass-panel">
        <div className="header-row" style={{ marginBottom: "1rem" }}>
          <div
            className={`timer ${seconds <= 5 && !showResult ? "danger" : ""}`}
          >
            ⏱ {showResult ? "-" : seconds}
          </div>
          <div className="bank">
            <span>Playing For</span>
            {eur.format(bank)}
          </div>
        </div>

        <div className="chase-container">
          <div className="chase-board">
            {Array.from({ length: boardSteps + 1 }).map((_, i) => {
              const isChaser = gameState.chaserPos === i;
              const isPlayer = gameState.playerPos === i;
              const isHome = i === WIN_POS;
              let cls = "board-step";
              if (isChaser) cls += " chaser-pos";
              if (isPlayer) cls += " player-pos";
              if (isHome) cls += " home";

              return (
                <div key={i} className={cls}>
                  {isChaser && "C"}
                  {isPlayer && !isChaser && "P"}
                  {isHome && !isPlayer && !isChaser && "H"}
                </div>
              );
            })}
          </div>

          <div className="chase-questions">
            <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
              {currentQ.question}
            </h2>
            {config.settings.partyMode && !showResult && (
              <h3
                style={{
                  color: isPlayerTurn
                    ? "var(--accent-primary)"
                    : "var(--danger)",
                  marginBottom: "1rem",
                }}
              >
                {isPlayerTurn ? "Player's Turn" : "Chaser's Turn"}
              </h3>
            )}
            {!config.settings.partyMode && (
              <div style={{ marginBottom: "1rem" }}></div>
            )}

            <div className="options-grid">
              {currentQ.options.map((opt, i) => {
                let btnCls = "btn option-btn ";
                if (showResult) {
                  if (opt === currentQ.correct) btnCls += "correct ";
                  else if (opt === selectedOpt) btnCls += "wrong ";
                } else {
                  if (isPlayerTurn && opt === selectedOpt)
                    btnCls += "selected ";
                  if (isPartyChaserTurn && opt === chaserOpt)
                    btnCls += "selected ";
                }

                return (
                  <button
                    key={i}
                    className={btnCls}
                    onClick={() => {
                      if (isPlayerTurn) {
                        const shouldReset = handleLockIn(opt);
                        if (shouldReset)
                          setSeconds(
                            config.settings.chaseTimePerQuestionSeconds,
                          );
                      } else {
                        handlePartyChaserLockIn(opt);
                      }
                    }}
                    disabled={!isPlayerTurn && !isPartyChaserTurn}
                  >
                    <span
                      style={{
                        color: "var(--accent-primary)",
                        marginRight: "10px",
                        fontWeight: "800",
                      }}
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>

            <div
              style={{
                marginTop: "2rem",
                textAlign: "center",
                minHeight: "80px",
              }}
            >
              {chaserSelected && !showResult && (
                <p
                  className="animate-enter"
                  style={{ color: "var(--danger)", fontWeight: "bold" }}
                >
                  The Chaser has locked in.
                </p>
              )}
              {showResult && (
                <div
                  className="animate-enter"
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    padding: "1rem",
                    borderRadius: "12px",
                  }}
                >
                  <p>
                    Player answered:{" "}
                    <strong
                      className={
                        selectedOpt === currentQ.correct ? "success" : "danger"
                      }
                    >
                      {selectedOpt || "Time Out"}
                    </strong>
                  </p>
                  <p>
                    Chaser answered:{" "}
                    <strong className={chaserCorrect ? "success" : "danger"}>
                      {config.settings.partyMode
                        ? chaserOpt || "Time Out"
                        : chaserCorrect
                          ? "Correct"
                          : "Wrong"}
                    </strong>
                  </p>
                  <button
                    className="btn btn-primary mt-4 text-center"
                    style={{ width: "100%" }}
                    onClick={handleNextPhase}
                  >
                    Continue
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const ITEM_HEIGHT = 80;
const VIEWPORT_HEIGHT = 400; // 5 visible items
const WINNER_INDEX = 75;

function buildStrip(bank: number, lowerPct: number, upperPct: number): { items: number[]; prize: number } {
  const rand = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;
  const cap = bank * (upperPct / 100); // absolute ceiling
  const val = (lo: number, hi: number) =>
    Math.round((cap * (lo + Math.random() * (hi - lo))) / 10) * 10;

  const items: number[] = [];

  // 0–44: grey common (0–25% of cap)
  for (let i = 0; i < 45; i++) items.push(val(0, 0.25));
  // 45–59: blue uncommon (25–50% of cap)
  for (let i = 0; i < 15; i++) items.push(val(0.25, 0.5));
  // 60–72: purple rare (50–75% of cap)
  for (let i = 0; i < 13; i++) items.push(val(0.5, 0.75));
  // 73–74: gold epic teasers (75–92% of cap)
  for (let i = 0; i < 2; i++) items.push(val(0.75, 0.92));
  // 75: winner (lowerPct–upperPct % of bank)
  const winFrac = (lowerPct + Math.random() * (upperPct - lowerPct)) / 100;
  const prize = Math.round((bank * winFrac) / 10) * 10;
  items.push(prize); // index === WINNER_INDEX
  // 76–89: filler after winner
  for (let i = 0; i < 14; i++) {
    if (i < 5) items.push(val(0, 0.25));
    else items.push(val(0.25, 0.5));
  }

  const shuffle = (arr: number[], from: number, to: number) => {
    for (let i = to; i > from; i--) {
      const j = rand(from, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };
  shuffle(items, 0, 44);
  shuffle(items, 45, 59);
  shuffle(items, 60, 72);

  // Inject 6–9 high-value decoys (70–95% of bank) at random positions
  // before the winner section so they flash past during the fast scroll.
  const decoyCount = rand(6, 9);
  const decoyVal = () =>
    Math.round((bank * (0.70 + Math.random() * 0.25)) / 10) * 10;
  for (let i = 0; i < decoyCount; i++) {
    const pos = rand(0, 71); // anywhere before the teaser zone
    items[pos] = decoyVal();
  }

  return { items, prize };
}

function rarityColor(value: number, cap: number): string {
  const r = value / cap;
  if (r >= 0.90) return "#ef4444"; // red — winner range
  if (r >= 0.75) return "#f59e0b"; // gold
  if (r >= 0.50) return "#8b5cf6"; // purple
  if (r >= 0.25) return "#3b82f6"; // blue
  return "#64748b";                // grey
}

function LastChanceScreen({
  bank,
  lowerPct,
  upperPct,
  onRestart,
}: {
  bank: number;
  lowerPct: number;
  upperPct: number;
  onRestart: () => void;
}) {
  const [spinPhase, setSpinPhase] = useState<"ready" | "spinning" | "done">("ready");
  const [stripData, setStripData] = useState(() => buildStrip(bank, lowerPct, upperPct));
  const cap = bank * (upperPct / 100);
  const [translateY, setTranslateY] = useState(0);
  const [transitioning, setTransitioning] = useState(false);

  const finalY =
    -(WINNER_INDEX * ITEM_HEIGHT) + (VIEWPORT_HEIGHT / 2 - ITEM_HEIGHT / 2);

  const doSpin = (data: ReturnType<typeof buildStrip>) => {
    setStripData(data);
    setSpinPhase("spinning");
    setTranslateY(0);
    setTransitioning(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTranslateY(finalY);
        setTransitioning(true);
      });
    });
    setTimeout(() => setSpinPhase("done"), 5500);
  };

  const spin = () => {
    if (spinPhase !== "ready") return;
    doSpin(stripData);
  };

  const spinAgain = () => doSpin(buildStrip(bank, lowerPct, upperPct));

  return (
    <div className="glass-panel text-center">
      <h1
        style={{
          background: "none",
          WebkitTextFillColor: "var(--danger)",
          filter: "drop-shadow(0 0 12px rgba(239,68,68,0.6))",
        }}
      >
        Last Chance!
      </h1>
      <p style={{ fontSize: "1.1rem" }}>
        The chaser caught you — spin for one final shot.
      </p>

      <div className="roulette-viewport">
        <div
          className="roulette-strip"
          style={{
            transform: `translateY(${translateY}px)`,
            transition: transitioning
              ? "transform 5s cubic-bezier(0.05, 0, 0.15, 1)"
              : "none",
          }}
        >
          {stripData.items.map((val, i) => {
            const isWinner = i === WINNER_INDEX && spinPhase === "done";
            return (
              <div
                key={i}
                className={`roulette-item${isWinner ? " winner-glow" : ""}`}
                style={{ color: rarityColor(val, cap) }}
              >
                {eur.format(val)}
              </div>
            );
          })}
        </div>
      </div>

      {spinPhase === "ready" && (
        <button
          className="btn btn-primary"
          style={{ width: "100%", fontSize: "1.25rem", padding: "1rem" }}
          onClick={spin}
        >
          Spin
        </button>
      )}

      {spinPhase === "done" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", alignItems: "center" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "1rem" }}>
            Last chance prize
          </p>
          <h2
            style={{
              fontSize: "3rem",
              color: "#ef4444",
              filter: "drop-shadow(0 0 12px rgba(239,68,68,0.5))",
            }}
          >
            {eur.format(stripData.prize)}
          </h2>
          <div style={{ display: "flex", gap: "1rem", width: "100%" }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={spinAgain}
            >
              Spin Again
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={onRestart}
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EndScreen({
  win,
  bank,
  onRestart,
}: {
  win: boolean;
  bank: number;
  onRestart: () => void;
}) {
  return (
    <div className="glass-panel text-center">
      {win ? (
        <>
          <h1
            style={{
              color: "var(--success)",
              filter: "drop-shadow(0 0 10px rgba(16,185,129,0.5))",
            }}
          >
            You Outran The Chaser!
          </h1>
          <h2 style={{ fontSize: "3rem", margin: "2rem 0" }}>
            {eur.format(bank)}
          </h2>
          <p>Congratulations on an incredible victory.</p>
        </>
      ) : (
        <>
          <h1
            style={{
              color: "var(--danger)",
              filter: "drop-shadow(0 0 10px rgba(239,68,68,0.5))",
              background: "none",
              WebkitTextFillColor: "var(--danger)",
            }}
          >
            Caught!
          </h1>
          <p style={{ fontSize: "1.25rem", marginTop: "1rem" }}>
            The Chaser caught you. You leave with nothing.
          </p>
        </>
      )}
      <button
        className="btn btn-primary mt-4"
        style={{ width: "100%" }}
        onClick={onRestart}
      >
        Play Again
      </button>
    </div>
  );
}

export default App;
