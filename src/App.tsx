import React, { useState, useEffect, useRef } from "react";
import type { GameConfig, GameState, AppSettings } from "./types";

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

// -- Main App Component --
function App() {
  const [gameState, setGameState] = useState<GameState>({
    phase: "MENU",
    bank: 0,
    config: null,
    playerPos: 3, // Start 3 steps down
    chaserPos: 0, // Starts at 0
  });

  const [error, setError] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [jsonUrl, setJsonUrl] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("quiz") || "/default_questions.json";
  });

  useEffect(() => {
    fetch("/settings.json")
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
        setGameState((prev) => ({
          ...prev,
          config: data,
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

  if (error && !gameState.config) {
    return (
      <div className="glass-panel">
        <h1 style={{ color: "var(--danger)" }}>Error loading questions</h1>
        <p className="text-center">{error}</p>
        <button
          className="btn btn-primary"
          onClick={() => (window.location.href = "/")}
        >
          Retry Default
        </button>
      </div>
    );
  }

  if (!gameState.config || !appSettings) {
    return (
      <div className="glass-panel">
        <h1>Loading...</h1>
      </div>
    );
  }

  // --- Helper to shuffle arrays ---
  const shuffleArray = <T,>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  // --- Phase Handlers ---
  const startGame = (customSettings: GameConfig["settings"]) => {
    setGameState((s) => {
      // Shuffle both question sets on new game start
      const randomizedBuilder = s.config
        ? shuffleArray(s.config.cashBuilder)
        : [];
      const randomizedTheChase = s.config
        ? shuffleArray(s.config.theChase)
        : [];

      return {
        ...s,
        phase: "CASH_BUILDER",
        bank: 0,
        config: {
          ...s.config!,
          cashBuilder: randomizedBuilder,
          theChase: randomizedTheChase,
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
    setGameState((s) => ({ ...s, phase: win ? "END_WIN" : "END_LOSE" }));
  const restart = () =>
    setGameState((s) => ({
      ...s,
      phase: "MENU",
      bank: 0,
      playerPos: 3,
      chaserPos: 0,
    }));

  return (
    <>
      {gameState.phase === "MENU" && gameState.config && (
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
      {gameState.phase === "CASH_BUILDER" && (
        <CashBuilderScreen
          config={gameState.config}
          onComplete={onCashBuilderComplete}
        />
      )}
      {gameState.phase === "CHASE_SETUP" && (
        <ChaseSetupScreen
          config={gameState.config}
          bank={gameState.bank}
          onStart={startChase}
        />
      )}
      {gameState.phase === "THE_CHASE" && (
        <TheChaseScreen
          config={gameState.config}
          bank={gameState.bank}
          gameState={gameState}
          setGameState={setGameState}
          onEnd={endGame}
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
        Start Game ➔
      </button>
    </div>
  );
}

function CashBuilderScreen({
  config,
  onComplete,
}: {
  config: GameConfig;
  onComplete: (bank: number) => void;
}) {
  const [qIndex, setQIndex] = useState(0);
  const [bank, setBank] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [showAnswer, setShowAnswer] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { seconds } = useTimer(
    config.settings.cashBuilderTimeSeconds,
    () => {
      setIsActive(false);
      setTimeout(() => onComplete(bank), 2000); // Wait 2s before transitioning
    },
    isActive,
  );

  const questions = config.cashBuilder;
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
    if (qIndex + 1 < questions.length) {
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
                        ✅ Correct
                      </button>
                      <button
                        className="btn btn-danger flex-1"
                        onClick={handleWrong}
                      >
                        ❌ Wrong
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
                          Next ➔
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

  const offers = [
    {
      label: "High",
      bank: bank * 3,
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
      bank: Math.max(1, Math.floor(bank * 0.4)),
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
}: {
  config: GameConfig;
  bank: number;
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  onEnd: (w: boolean) => void;
}) {
  const [qIndex, setQIndex] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState("");
  const [chaserSelected, setChaserSelected] = useState(false);
  const [chaserCorrect, setChaserCorrect] = useState(false);
  const [chaserOpt, setChaserOpt] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [isPartyChaserTurn, setIsPartyChaserTurn] = useState(false);

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

  const { seconds, setSeconds } = useTimer(
    config.settings.chaseTimePerQuestionSeconds,
    () => {
      if (onExpireRef.current) onExpireRef.current();
    },
    !showResult && (isPlayerTurn || isPartyChaserTurn),
  );

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
