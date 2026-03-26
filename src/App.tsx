import React, { useState, useEffect, useRef } from 'react';
import type { GameConfig, GameState } from './types';

// -- Custom Timer Hook --
function useTimer(initialSeconds: number, onExpire: () => void, isActive: boolean) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const onExpireRef = useRef(onExpire);
  
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isActive && seconds > 0) {
      interval = setInterval(() => {
        setSeconds((s) => {
          if (s <= 1) {
            clearInterval(interval);
            onExpireRef.current();
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

// -- Main App Component --
function App() {
  const [gameState, setGameState] = useState<GameState>({
    phase: 'MENU',
    bank: 0,
    config: null,
    playerPos: 3, // Start 3 steps down
    chaserPos: 0, // Starts at 0
  });

  const [error, setError] = useState('');

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const quizUrl = urlParams.get('quiz') || '/default_questions.json';
    
    fetch(quizUrl)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then((data: GameConfig) => {
        setGameState(s => ({ ...s, config: data }));
      })
      .catch((e) => setError('Failed to load quiz config. ' + e.message));
  }, []);

  if (error) {
    return (
      <div className="glass-panel">
        <h1>Error</h1>
        <p className="text-center">{error}</p>
      </div>
    );
  }

  if (!gameState.config) {
    return (
      <div className="glass-panel">
        <h1>Loading Quiz...</h1>
      </div>
    );
  }

  // --- Phase Handlers ---
  const startGame = () => setGameState(s => ({ ...s, phase: 'CASH_BUILDER', bank: 0 }));
  const onCashBuilderComplete = (earned: number) => setGameState(s => ({ ...s, phase: 'CHASE_SETUP', bank: earned }));
  const startChase = () => setGameState(s => ({ ...s, phase: 'THE_CHASE', playerPos: 3, chaserPos: 0 }));
  const endGame = (win: boolean) => setGameState(s => ({ ...s, phase: win ? 'END_WIN' : 'END_LOSE' }));
  const restart = () => setGameState(s => ({ ...s, phase: 'MENU', bank: 0, playerPos: 3, chaserPos: 0 }));

  return (
    <>
      {gameState.phase === 'MENU' && <MenuScreen onStart={startGame} config={gameState.config} />}
      {gameState.phase === 'CASH_BUILDER' && <CashBuilderScreen config={gameState.config} onComplete={onCashBuilderComplete} />}
      {gameState.phase === 'CHASE_SETUP' && <ChaseSetupScreen bank={gameState.bank} onStart={startChase} />}
      {gameState.phase === 'THE_CHASE' && <TheChaseScreen config={gameState.config} bank={gameState.bank} gameState={gameState} setGameState={setGameState} onEnd={endGame} />}
      {gameState.phase.startsWith('END_') && <EndScreen win={gameState.phase === 'END_WIN'} bank={gameState.bank} onRestart={restart} />}
    </>
  );
}

// -- Sub Components --

function MenuScreen({ onStart, config }: { onStart: () => void, config: GameConfig }) {
  return (
    <div className="glass-panel">
      <h1>The Chase</h1>
      <p className="text-center">Welcome! Ready to face the Chaser?</p>
      
      <div style={{ marginTop: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '12px' }}>
        <h3>Settings <span style={{fontSize:'0.9rem', color:'var(--text-muted)'}}>(Loaded from JSON)</span></h3>
        <p>Mode: {config.settings.partyMode ? 'Party Mode (Host controls)' : 'Typing Mode'}</p>
        <p>Cash Builder: {config.settings.cashBuilderTimeSeconds}s</p>
        <p>Chase Timer: {config.settings.chaseTimePerQuestionSeconds}s per question</p>
      </div>

      <button className="btn btn-primary" onClick={onStart} style={{ marginTop: '1rem' }}>
        Start Cash Builder
      </button>
    </div>
  );
}

function CashBuilderScreen({ config, onComplete }: { config: GameConfig, onComplete: (bank: number) => void }) {
  const [qIndex, setQIndex] = useState(0);
  const [bank, setBank] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [showAnswer, setShowAnswer] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { seconds } = useTimer(config.settings.cashBuilderTimeSeconds, () => {
    setIsActive(false);
    setTimeout(() => onComplete(bank), 2000); // Wait 2s before transitioning
  }, isActive);

  const questions = config.cashBuilder;
  const currentQ = questions[qIndex] || { question: "No more questions!", answer: "" };
  const isPartyMode = config.settings.partyMode;

  useEffect(() => {
    if (isActive && !isPartyMode && inputRef.current) inputRef.current.focus();
  }, [isActive, isPartyMode, showAnswer]);

  const handleCorrect = () => {
    setBank(b => b + 1000);
    nextQuestion();
  };

  const handleWrong = () => {
    nextQuestion();
  };

  const nextQuestion = () => {
    if (qIndex + 1 < questions.length) {
      setQIndex(i => i + 1);
      setShowAnswer(false);
      setTypedAnswer('');
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

  const isExactMatch = typedAnswer.trim().toLowerCase() === currentQ.answer.toLowerCase();

  return (
    <div className="glass-panel">
      <div className="header-row">
        <div className={`timer ${seconds <= 10 ? 'danger' : ''}`}>⏱ {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, '0')}</div>
        <div className="bank"><span>Bank</span>£{bank.toLocaleString()}</div>
      </div>

      {seconds > 0 ? (
        <div className="chase-questions text-center">
          <h2 style={{ fontSize: '2rem', marginBottom: '2rem' }}>{currentQ.question}</h2>

          {isPartyMode ? (
            // PARTY MODE UI
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
              {!showAnswer ? (
                <button className="btn btn-warning" onClick={() => setShowAnswer(true)} style={{ width: '100%' }}>Reveal Answer</button>
              ) : (
                <>
                  <h3 style={{ color: 'var(--accent-primary)', fontSize: '1.5rem', marginBottom: '1rem' }}>Answer: {currentQ.answer}</h3>
                  <div className="flex-row" style={{ width: '100%', justifyContent: 'center' }}>
                    <button className="btn btn-success flex-1" onClick={handleCorrect}>✅ Correct</button>
                    <button className="btn btn-danger flex-1" onClick={handleWrong}>❌ Wrong</button>
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
                    onChange={e => setTypedAnswer(e.target.value)}
                    disabled={!isActive}
                  />
                  <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem', width: '100%' }} disabled={!typedAnswer.trim()}>Submit</button>
                </form>
              ) : (
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '12px' }}>
                  <p style={{marginBottom: '0.5rem'}}>You answered: <strong>{typedAnswer}</strong></p>
                  <p>Correct answer: <strong style={{color: 'var(--success)'}}>{currentQ.answer}</strong></p>
                  
                  {isExactMatch ? (
                    <div style={{marginTop: '1rem'}}>
                      <h3 style={{color: 'var(--success)'}}>Perfect Match!</h3>
                      <button className="btn btn-primary" style={{width: '100%', marginTop: '0.5rem'}} onClick={handleCorrect}>Next ➔</button>
                    </div>
                  ) : (
                    <div style={{marginTop: '1rem'}}>
                      <h3 style={{color: 'var(--danger)', marginBottom: '1rem'}}>Incorrect</h3>
                      <div className="flex-row">
                        <button className="btn btn-success flex-1" onClick={handleCorrect}>Actually, I was right</button>
                        <button className="btn btn-danger flex-1" onClick={handleWrong}>Accept Wrong</button>
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
          <h2 style={{ color: 'var(--danger)' }}>Time's Up!</h2>
          <p>Total Bank: £{bank.toLocaleString()}</p>
        </div>
      )}
    </div>
  );
}

function ChaseSetupScreen({ bank, onStart }: { bank: number, onStart: () => void }) {
  return (
    <div className="glass-panel text-center">
      <h2>The Chase Is On</h2>
      <p>You have brought <strong>£{bank.toLocaleString()}</strong> to the table.</p>
      <p>The Chaser is ready.</p>
      <button className="btn btn-primary mt-4" style={{width: '100%'}} onClick={onStart}>Face The Chaser</button>
    </div>
  );
}

function TheChaseScreen({ config, bank, gameState, setGameState, onEnd }: { config: GameConfig, bank: number, gameState: GameState, setGameState: React.Dispatch<React.SetStateAction<GameState>>, onEnd: (w:boolean)=>void }) {
  const [qIndex, setQIndex] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState('');
  const [chaserSelected, setChaserSelected] = useState(false);
  const [chaserCorrect, setChaserCorrect] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);

  const handleLockIn = (opt: string) => {
    setSelectedOpt(opt);
    setIsPlayerTurn(false);
    
    // Simulate Chaser Turn (Immediate)
    const accuracy = config.settings.chaserAccuracyPercentage;
    const chaserGotsItRight = Math.random() * 100 <= accuracy;
    setChaserCorrect(chaserGotsItRight);
    setChaserSelected(true);
    
    // Show results
    setTimeout(() => {
      setShowResult(true);
    }, 1000);
  };

  const { seconds, setSeconds } = useTimer(config.settings.chaseTimePerQuestionSeconds, () => {
    if (isPlayerTurn) handleLockIn(''); // time out
  }, !showResult);

  const questions = config.theChase;
  const currentQ = questions[qIndex];
  const boardSteps = 7;
  const WIN_POS = boardSteps;

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

    setGameState(s => ({ ...s, playerPos: newPPos, chaserPos: newCPos }));
    
    // Reset for next Q
    setSelectedOpt('');
    setChaserSelected(false);
    setShowResult(false);
    setIsPlayerTurn(true);
    setQIndex(i => i + 1);
    setSeconds(config.settings.chaseTimePerQuestionSeconds);
  };

  return (
    <div className="glass-panel">
       <div className="header-row" style={{marginBottom: '1rem'}}>
        <div className={`timer ${seconds <= 5 && !showResult ? 'danger' : ''}`}>⏱ {showResult ? '-' : seconds}</div>
        <div className="bank"><span>Playing For</span>£{bank.toLocaleString()}</div>
      </div>

      <div className="chase-container">
        <div className="chase-board">
          {Array.from({length: boardSteps + 1}).map((_, i) => {
               const isChaser = gameState.chaserPos === i;
               const isPlayer = gameState.playerPos === i;
               const isHome = i === WIN_POS;
               let cls = 'board-step';
               if (isChaser) cls += ' chaser-pos';
               if (isPlayer) cls += ' player-pos';
               if (isHome) cls += ' home';
               
               return (
                 <div key={i} className={cls}>
                    {isChaser && 'C'}
                    {isPlayer && !isChaser && 'P'}
                    {isHome && !isPlayer && !isChaser && 'H'}
                 </div>
               )
          })}
        </div>
        
        <div className="chase-questions">
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>{currentQ.question}</h2>
          
          <div className="options-grid">
            {currentQ.options.map((opt, i) => {
              let btnCls = 'btn option-btn ';
              if (showResult) {
                if (opt === currentQ.correct) btnCls += 'correct ';
                else if (opt === selectedOpt) btnCls += 'wrong ';
              } else {
                if (opt === selectedOpt) btnCls += 'selected ';
              }

              return (
                <button 
                  key={i} 
                  className={btnCls} 
                  onClick={() => handleLockIn(opt)}
                  disabled={!isPlayerTurn}
                >
                  <span style={{color:'var(--accent-primary)', marginRight:'10px', fontWeight:'800'}}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  {opt}
                </button>
              )
            })}
          </div>

          <div style={{marginTop: '2rem', textAlign: 'center', minHeight: '80px'}}>
             {chaserSelected && !showResult && <p className="animate-enter" style={{color: 'var(--danger)', fontWeight:'bold'}}>The Chaser has locked in.</p>}
             {showResult && (
               <div className="animate-enter" style={{background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '12px'}}>
                 <p>You answered: <strong className={selectedOpt===currentQ.correct ? 'success' : 'danger'}>{selectedOpt || 'Time Out'}</strong></p>
                 <p>Chaser was: <strong className={chaserCorrect ? 'success' : 'danger'}>{chaserCorrect ? 'Correct' : 'Wrong'}</strong></p>
                 <button className="btn btn-primary mt-4 text-center" style={{width:'100%'}} onClick={handleNextPhase}>Continue</button>
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  )
}

function EndScreen({ win, bank, onRestart }: { win: boolean, bank: number, onRestart: ()=>void }) {
  return (
    <div className="glass-panel text-center">
      {win ? (
        <>
          <h1 style={{color: 'var(--success)', filter: 'drop-shadow(0 0 10px rgba(16,185,129,0.5))'}}>You Outran The Chaser!</h1>
          <h2 style={{fontSize: '3rem', margin: '2rem 0'}}>£{bank.toLocaleString()}</h2>
          <p>Congratulations on an incredible victory.</p>
        </>
      ) : (
        <>
          <h1 style={{color: 'var(--danger)', filter: 'drop-shadow(0 0 10px rgba(239,68,68,0.5))', background: 'none', WebkitTextFillColor: 'var(--danger)'}}>Caught!</h1>
          <p style={{fontSize: '1.25rem', marginTop: '1rem'}}>The Chaser caught you. You leave with nothing.</p>
        </>
      )}
      <button className="btn btn-primary mt-4" style={{width: '100%'}} onClick={onRestart}>Play Again</button>
    </div>
  )
}

export default App;
