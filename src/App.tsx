import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Volume2,
  VolumeX,
  Pause,
  RotateCcw,
  Utensils,
  Check,
  Flame,
  HandPlatter,
  Mic,
  ChevronDown,
  ChevronUp,
  BookOpen,
} from 'lucide-react';
import {
  INGREDIENTS,
  RECIPES,
} from './game/recipes';
import {
  addIngredientToInventory,
  cookCurrentDish,
  createInitialGameState,
  getAllStations,
  hasAllRecipeIngredients,
  InteractableStation,
  KitchenGameState,
  recordPronunciationFailure,
  serveDishToCustomer,
} from './game/gameState';
import {
  KitchenCanvas,
  ScreenAnchorPositions,
} from './components/KitchenCanvas';
import {
  PronunciationChallenge,
  PronunciationModal,
} from './components/PronunciationModal';
import { soundFX } from './game/sound';

export default function App() {
  const isAutostart = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1';
  }, []);

  const [gameState, setGameState] = useState<KitchenGameState>(() =>
    createInitialGameState(isAutostart)
  );
  const [activeChallenge, setActiveChallenge] =
    useState<PronunciationChallenge | null>(null);
  const [toastBanner, setToastBanner] = useState<{
    text: string;
    subText?: string;
    tone: 'success' | 'info' | 'warning';
  } | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isDockCollapsed, setIsDockCollapsed] = useState(false);
  const [showRecipeGuide, setShowRecipeGuide] = useState(false);

  const [anchors, setAnchors] = useState<ScreenAnchorPositions>({
    customerBubble: { x: 360, y: 420, visible: true },
    nearbyStationPrompt: { x: 0, y: 0, station: null },
    stationLabels: [],
  });

  // Mirror game state to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = gameState.screen;
  }, [gameState.screen]);

  const showToast = useCallback(
    (
      text: string,
      subText?: string,
      tone: 'success' | 'info' | 'warning' = 'info'
    ) => {
      setToastBanner({ text, subText, tone });
    },
    []
  );

  useEffect(() => {
    if (!toastBanner) return;
    const timer = window.setTimeout(() => setToastBanner(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toastBanner]);

  const startGame = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    soundFX.playPop();
    setGameState((prev) =>
      prev.screen === 'gameover'
        ? createInitialGameState(true)
        : { ...prev, screen: 'playing' }
    );
  }, []);

  const restartGame = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    soundFX.playPop();
    setActiveChallenge(null);
    setGameState(createInitialGameState(true));
    showToast('New Kitchen Shift Started!', 'Collect ingredients in English.', 'info');
  }, [showToast]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      soundFX.muted = next;
      return next;
    });
  }, []);

  const togglePause = useCallback(() => {
    setGameState((prev) => {
      if (prev.screen === 'playing') return { ...prev, screen: 'paused' };
      if (prev.screen === 'paused') return { ...prev, screen: 'playing' };
      return prev;
    });
  }, []);

  // Global keyboard shortcuts for Title Start, Pause, Mute, and Dock Collapse
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)
      ) {
        return;
      }

      if (gameState.screen === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          startGame();
        }
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (activeChallenge) {
          setActiveChallenge(null);
        } else {
          togglePause();
        }
      } else if (e.code === 'KeyM') {
        toggleMute();
      } else if (e.code === 'KeyR' && !activeChallenge) {
        restartGame();
      } else if (e.code === 'KeyH' && !activeChallenge) {
        setIsDockCollapsed((c) => !c);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState.screen, activeChallenge, startGame, togglePause, toggleMute, restartGame]);

  // Handle station interaction (Ingredient crate, Stove, or Customer Table)
  const handleInteractStation = useCallback(
    (station: InteractableStation) => {
      if (station.type === 'ingredient' && station.ingredientId) {
        const ing = INGREDIENTS[station.ingredientId];
        if (!ing) return;

        setActiveChallenge({
          mode: 'ingredient',
          targetWord: ing.word,
          translationPt: ing.translationPt,
          phonetic: ing.phonetic,
          hintPt: ing.hintPt,
          accentHex: ing.accentHex,
          aliases: ing.acceptedAliases,
          ingredientId: ing.id,
        });
        return;
      }

      if (station.type === 'stove') {
        if (gameState.cookedDish) {
          showToast(
            `${gameState.currentRecipe.name} is already cooked!`,
            'Deliver it to the customer table.',
            'info'
          );
          return;
        }
        if (!hasAllRecipeIngredients(gameState)) {
          const missing = gameState.currentRecipe.ingredients
            .filter((id) => !gameState.inventory.includes(id))
            .join(', ');
          soundFX.playError();
          showToast(
            `Missing ingredients: ${missing}`,
            'Collect all recipe ingredients first!',
            'warning'
          );
          return;
        }

        // Open pronunciation modal to pronounce the dish name while cooking, or cook!
        setActiveChallenge({
          mode: 'cook',
          targetWord: gameState.currentRecipe.name,
          translationPt: gameState.currentRecipe.translationPt,
          phonetic: gameState.currentRecipe.phonetic,
          hintPt: `Pronuncie "${gameState.currentRecipe.name}" para finalizar o preparo no fogão!`,
          accentHex: '#f97316',
          aliases: gameState.currentRecipe.acceptedAliases,
        });
        return;
      }

      if (station.type === 'table') {
        if (gameState.cookedDish !== gameState.currentRecipe.id) {
          soundFX.playError();
          showToast(
            hasAllRecipeIngredients(gameState)
              ? 'Cook the ingredients at the Stove first!'
              : `Collect ${gameState.currentRecipe.ingredients.join(', ')} & cook at the Stove!`,
            'The customer is waiting for their freshly cooked dish.',
            'warning'
          );
          return;
        }

        soundFX.playOrderServed();
        const servedName = gameState.currentRecipe.name;
        const rewardCoins = gameState.currentRecipe.rewardCoins;
        const rewardXp = gameState.currentRecipe.rewardXp;

        setGameState((prev) => {
          const next = serveDishToCustomer(prev);
          if (next.dishesServed >= next.targetDishesForShift) {
            return { ...next, screen: 'gameover' };
          }
          return next;
        });

        showToast(
          `Served ${servedName}! +${rewardCoins} Coins · +${rewardXp} XP`,
          'Customer is delighted! Next order incoming.',
          'success'
        );
      }
    },
    [gameState, showToast]
  );

  const handlePronunciationSuccess = useCallback(
    (challenge: PronunciationChallenge, transcript: string) => {
      setActiveChallenge(null);

      if (challenge.mode === 'ingredient' && challenge.ingredientId) {
        setGameState((prev) =>
          addIngredientToInventory(prev, challenge.ingredientId!)
        );
        showToast(
          `Added ${challenge.targetWord} (${challenge.translationPt}) to Inventory!`,
          `Heard: "${transcript}"`,
          'success'
        );
      } else if (challenge.mode === 'cook') {
        soundFX.playCookSizzle();
        setGameState((prev) => cookCurrentDish(prev));
        showToast(
          `${challenge.targetWord} Cooked!`,
          'Now deliver it to the Customer Table!',
          'success'
        );
      }
    },
    [showToast]
  );

  const handlePronunciationFailure = useCallback(() => {
    setGameState((prev) => recordPronunciationFailure(prev));
  }, []);

  const accuracyPct =
    gameState.pronunciationAttempts > 0
      ? Math.round(
          (gameState.pronunciationSuccesses / gameState.pronunciationAttempts) *
            100
        )
      : 100;

  // Clamp customer speech bubble inside safe viewport margins
  const bubbleStyle = useMemo(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const h = typeof window !== 'undefined' ? window.innerHeight : 900;
    const clampedX = Math.max(180, Math.min(w - 220, anchors.customerBubble.x));
    const clampedY = Math.max(96, Math.min(h - 210, anchors.customerBubble.y));
    return {
      left: `${Math.round(clampedX)}px`,
      top: `${Math.round(clampedY)}px`,
    };
  }, [anchors.customerBubble.x, anchors.customerBubble.y]);

  return (
    <main className="relative h-screen w-screen overflow-hidden select-none">
      {/* 1. Isolated Full-Viewport 3D Isometric WebGL Scene */}
      <KitchenCanvas
        gameState={gameState}
        isModalOpen={activeChallenge !== null || showRecipeGuide}
        onInteractStation={handleInteractStation}
        onScreenAnchorsUpdate={setAnchors}
      />

      {/* 2. TITLE SCREEN OVERLAY (Asymmetric Left-Third Composition over Live 3D Kitchen Camera Tour) */}
      {gameState.screen === 'title' && (
        <div
          className="fixed inset-0 z-30 flex items-center pointer-events-auto px-8 sm:px-16"
          style={{
            background:
              'linear-gradient(90deg, rgba(16, 14, 12, 0.88) 0%, rgba(16, 14, 12, 0.52) 38%, rgba(16, 14, 12, 0.0) 64%)',
          }}
        >
          <div className="max-w-lg">
            {/* Bespoke Inline SVG Title Emblem */}
            <svg
              viewBox="0 0 460 130"
              className="w-full max-w-md h-auto drop-shadow-lg"
              role="img"
              aria-label="English Kitchen — Isometric Voice Culinary Game"
            >
              {/* Warm Wooden / Dark Slate Plaque Crest */}
              <rect
                x="4"
                y="8"
                width="452"
                height="114"
                rx="18"
                fill="#1b1917"
                stroke="#f59e0b"
                strokeWidth="2.5"
              />
              <rect
                x="12"
                y="16"
                width="436"
                height="98"
                rx="12"
                fill="none"
                stroke="#ffffff"
                strokeOpacity="0.12"
                strokeWidth="1"
              />
              {/* Chef Toque Hat Icon on Left */}
              <g transform="translate(30, 28)">
                <circle cx="28" cy="24" r="16" fill="#fef3c7" />
                <circle cx="16" cy="28" r="12" fill="#fde68a" />
                <circle cx="40" cy="28" r="12" fill="#fde68a" />
                <rect x="12" y="34" width="32" height="18" rx="4" fill="#ffffff" />
                <rect x="12" y="46" width="32" height="5" fill="#e07a5f" />
                {/* Sound wave arcs */}
                <path
                  d="M 54 22 Q 62 32 54 42"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M 61 16 Q 72 32 61 48"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </g>
              {/* Title Typography */}
              <text
                x="114"
                y="62"
                fill="#ffffff"
                fontFamily="Plus Jakarta Sans, sans-serif"
                fontWeight="800"
                fontSize="33"
                letterSpacing="1"
              >
                ENGLISH KITCHEN
              </text>
              <text
                x="116"
                y="92"
                fill="#fbbf24"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="700"
                fontSize="13"
                letterSpacing="2.2"
              >
                VOICE-CONTROLLED 3D BISTRO
              </text>
            </svg>

            <p className="mt-5 text-base text-zinc-200 leading-relaxed max-w-md">
              Take customer orders, walk to the pantry crates, and speak
              ingredient names aloud in English to cook delicious dishes.
            </p>

            {/* Primary Start Action */}
            <div className="mt-7 flex items-center gap-4">
              <button
                type="button"
                data-start="true"
                onClick={startGame}
                className="inline-flex items-center gap-3 rounded-xl bg-amber-500 px-7 py-3.5 text-base font-extrabold text-zinc-950 shadow-lg hover:bg-amber-400 active:scale-95 transition-all whitespace-nowrap shrink-0"
              >
                <Utensils className="h-5 w-5" />
                <span>Start Kitchen Shift</span>
              </button>
            </div>
          </div>

          {/* Flat Bottom Control Hint Line */}
          <div className="fixed bottom-6 left-8 right-8 flex items-center justify-between text-xs font-medium text-zinc-300 pointer-events-none">
            <span>
              WASD / Click Floor to Move · E or Click Station to Interact · Speak in English · Esc Pause
            </span>
            <span className="font-mono-tabular text-amber-300">
              Press ENTER or SPACE to Start
            </span>
          </div>
        </div>
      )}

      {/* 3. PLAYING HUD OVERLAY (Low-Occlusion Dark Mode Floating Clusters) */}
      {gameState.screen === 'playing' && (
        <div className="fixed inset-0 z-20 pointer-events-none">
          {/* 3A. In-World Ingredient Labels Projected Above 3D Crates */}
          {anchors.stationLabels.map((lbl) => (
            <button
              key={lbl.id}
              type="button"
              onClick={() => {
                const st = getAllStations(gameState.activeTableIndex).find(
                  (s) => s.ingredientId === lbl.id
                );
                if (st) handleInteractStation(st);
              }}
              style={{
                left: `${Math.round(lbl.x)}px`,
                top: `${Math.round(lbl.y)}px`,
                backgroundColor: lbl.isCollected
                  ? 'rgba(6, 78, 59, 0.92)'
                  : lbl.isRequired
                  ? 'rgba(24, 24, 29, 0.94)'
                  : 'rgba(20, 20, 25, 0.78)',
              }}
              aria-label={`Ingredient crate ${lbl.word} (${lbl.translationPt})`}
              className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border px-2.5 py-1 text-left transition-transform hover:scale-105 ${
                lbl.isCollected
                  ? 'border-emerald-400/60 text-emerald-200'
                  : lbl.isRequired
                  ? 'border-amber-400/80 text-white shadow-md'
                  : 'border-white/15 text-zinc-300'
              }`}
            >
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="text-xs font-extrabold tracking-wide">
                  {lbl.word}
                </span>
                {lbl.isCollected && (
                  <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                )}
              </div>
              <div className="text-[10px] text-zinc-400 leading-none">
                {lbl.translationPt}
              </div>
            </button>
          ))}

          {/* 3B. Floating Customer Order Speech Bubble */}
          {anchors.customerBubble.visible && (
            <div
              style={{
                ...bubbleStyle,
                backgroundColor: 'rgba(20, 21, 27, 0.95)',
              }}
              className="pointer-events-auto absolute -translate-x-1/2 -translate-y-full rounded-2xl border border-amber-400/50 p-3.5 text-white shadow-xl max-w-xs transition-all"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-bold tracking-wider text-amber-400 uppercase">
                  Customer Order · Table {gameState.activeTableIndex + 1}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    soundFX.speakWord(gameState.currentRecipe.customerRequest)
                  }
                  aria-label="Listen to customer order in English"
                  className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200 hover:bg-white/20 whitespace-nowrap shrink-0"
                >
                  <Volume2 className="h-3 w-3" />
                  <span>Listen</span>
                </button>
              </div>

              <p className="mt-1.5 text-sm font-extrabold text-white">
                &ldquo;{gameState.currentRecipe.customerRequest}&rdquo;
              </p>
              <p className="text-xs text-zinc-400">
                {gameState.currentRecipe.customerRequestPt}
              </p>

              {/* Recipe Required Ingredients Inline List */}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2">
                {gameState.currentRecipe.ingredients.map((ingId) => {
                  const collected = gameState.inventory.includes(ingId);
                  return (
                    <button
                      key={ingId}
                      type="button"
                      onClick={() => {
                        const st = getAllStations(
                          gameState.activeTableIndex
                        ).find((s) => s.ingredientId === ingId);
                        if (st) handleInteractStation(st);
                      }}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                        collected
                          ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40'
                          : 'bg-white/10 text-amber-200 border border-amber-400/30 hover:bg-white/20'
                      }`}
                    >
                      {collected ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Mic className="h-3 w-3 text-amber-400" />
                      )}
                      <span>{ingId}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3C. Nearby Station Floating Prompt [E] */}
          {anchors.nearbyStationPrompt.station && !activeChallenge && (
            <div
              style={{
                left: `${Math.round(anchors.nearbyStationPrompt.x)}px`,
                top: `${Math.round(anchors.nearbyStationPrompt.y)}px`,
                backgroundColor: 'rgba(17, 24, 39, 0.95)',
              }}
              className="pointer-events-auto absolute -translate-x-1/2 -translate-y-full rounded-xl border border-sky-400/60 px-3 py-1.5 text-xs font-bold text-white shadow-lg"
            >
              <button
                type="button"
                onClick={() =>
                  handleInteractStation(anchors.nearbyStationPrompt.station!)
                }
                className="flex items-center gap-2 whitespace-nowrap"
              >
                <span className="rounded bg-sky-500 px-1.5 py-0.5 font-mono text-[11px] font-extrabold text-slate-950">
                  E
                </span>
                <span>Interact: {anchors.nearbyStationPrompt.station.label}</span>
              </button>
            </div>
          )}

          {/* 3D. Top Dark Mode HUD Pill Cluster (Level, XP, Coins, Shift Progress & Utility Controls) */}
          <div className="fixed top-4 left-4 right-4 flex items-center justify-between gap-4 pointer-events-none">
            {/* Left/Center Dark Pill Cluster matching the Reference Image */}
            <div
              style={{ backgroundColor: 'rgba(20, 21, 26, 0.94)' }}
              className="pointer-events-auto flex items-center gap-5 rounded-2xl border border-white/15 px-5 py-2.5 text-white shadow-xl"
            >
              {/* Chef Level */}
              <div>
                <div className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
                  CHEF LEVEL
                </div>
                <div className="font-mono-tabular text-xl font-extrabold text-amber-400 leading-tight">
                  {Math.round(gameState.level)}
                </div>
              </div>

              <div className="h-7 w-px bg-white/10" />

              {/* XP Progress */}
              <div className="min-w-[110px]">
                <div className="flex items-center justify-between text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
                  <span>XP</span>
                  <span className="font-mono-tabular text-zinc-200">
                    {Math.round(gameState.xp)}/{Math.round(gameState.xpToNextLevel)}
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all duration-300"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (gameState.xp / gameState.xpToNextLevel) * 100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>

              <div className="h-7 w-px bg-white/10" />

              {/* Coins */}
              <div>
                <div className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
                  COINS
                </div>
                <div className="font-mono-tabular text-xl font-extrabold text-yellow-300 leading-tight">
                  {Math.round(gameState.coins)}
                </div>
              </div>

              <div className="h-7 w-px bg-white/10 hidden sm:block" />

              {/* Dishes Served */}
              <div className="hidden sm:block">
                <div className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
                  SERVED
                </div>
                <div className="font-mono-tabular text-xl font-extrabold text-sky-300 leading-tight">
                  {Math.round(gameState.dishesServed)}/
                  {Math.round(gameState.targetDishesForShift)}
                </div>
              </div>
            </div>

            {/* Toast Notification Banner (Center) */}
            {toastBanner && (
              <div
                role="status"
                style={{ backgroundColor: 'rgba(20, 21, 26, 0.96)' }}
                className={`pointer-events-auto hidden lg:flex flex-col items-center rounded-xl border px-4 py-2 text-xs shadow-xl ${
                  toastBanner.tone === 'success'
                    ? 'border-emerald-400/50 text-emerald-200'
                    : toastBanner.tone === 'warning'
                    ? 'border-amber-400/50 text-amber-200'
                    : 'border-sky-400/40 text-sky-200'
                }`}
              >
                <span className="font-bold text-sm">{toastBanner.text}</span>
                {toastBanner.subText && (
                  <span className="text-zinc-400">{toastBanner.subText}</span>
                )}
              </div>
            )}

            {/* Top-Right Utility Controls (Recipe Guide, Mute [M], Pause [P], Restart [R]) */}
            <div
              style={{ backgroundColor: 'rgba(20, 21, 26, 0.94)' }}
              className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/15 p-2 shadow-xl"
            >
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  setShowRecipeGuide((v) => !v);
                }}
                aria-label="Open Recipe Dictionary"
                className="flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-zinc-200 hover:bg-white/15 transition-colors whitespace-nowrap shrink-0"
              >
                <BookOpen className="h-4 w-4 text-amber-400" />
                <span className="hidden md:inline">Dictionary</span>
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  toggleMute();
                }}
                aria-label={isMuted ? 'Unmute audio (M)' : 'Mute audio (M)'}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/15 transition-colors"
              >
                {isMuted ? (
                  <VolumeX className="h-4 w-4 text-rose-400" />
                ) : (
                  <Volume2 className="h-4 w-4 text-emerald-400" />
                )}
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  togglePause();
                }}
                aria-label="Pause game (P)"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/15 transition-colors"
              >
                <Pause className="h-4 w-4" />
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  restartGame();
                }}
                aria-label="Restart shift (R)"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/15 transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 3E. Unified Collapsible Bottom Control Dock (<= 15% Viewport Footprint) */}
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-4xl px-4 pointer-events-none flex flex-col items-center">
            {/* Collapse / Expand Toggle Tab */}
            <button
              type="button"
              onClick={() => setIsDockCollapsed((c) => !c)}
              style={{ backgroundColor: 'rgba(20, 21, 26, 0.94)' }}
              className="pointer-events-auto mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1 text-xs font-bold text-zinc-300 hover:text-white shadow-md transition-colors whitespace-nowrap shrink-0"
            >
              {isDockCollapsed ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5 text-amber-400" />
                  <span>Show Kitchen Dock [H]</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5 text-amber-400" />
                  <span>Hide Dock [H]</span>
                </>
              )}
            </button>

            {!isDockCollapsed && (
              <div
                style={{ backgroundColor: 'rgba(20, 21, 26, 0.95)' }}
                className="pointer-events-auto w-full rounded-2xl border border-white/15 px-5 py-3 text-white shadow-2xl flex flex-wrap items-center justify-between gap-4"
              >
                {/* Step 1: Collect Recipe Ingredients via Voice */}
                <div className="flex items-center gap-3">
                  <div>
                    <div className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
                      1. SPEAK TO COLLECT ({gameState.currentRecipe.name.toUpperCase()})
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      {gameState.currentRecipe.ingredients.map((ingId) => {
                        const ing = INGREDIENTS[ingId];
                        const hasIt = gameState.inventory.includes(ingId);
                        return (
                          <button
                            key={ingId}
                            type="button"
                            onClick={() => {
                              const st = getAllStations(
                                gameState.activeTableIndex
                              ).find((s) => s.ingredientId === ingId);
                              if (st) handleInteractStation(st);
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                              hasIt
                                ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                                : 'border-amber-400/50 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                            }`}
                          >
                            {hasIt ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Mic className="h-3.5 w-3.5 text-amber-400" />
                            )}
                            <span>{ing.word}</span>
                            <span className="text-[10px] text-zinc-400 font-normal">
                              ({ing.translationPt})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Step 2 & 3: Cook at Stove & Serve Customer */}
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      const stoveSt = getAllStations(
                        gameState.activeTableIndex
                      ).find((s) => s.type === 'stove');
                      if (stoveSt) handleInteractStation(stoveSt);
                    }}
                    className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-extrabold transition-all whitespace-nowrap shrink-0 ${
                      gameState.orderPhase === 'ready_to_cook'
                        ? 'border-orange-400 bg-orange-500 text-zinc-950 shadow-lg hover:bg-orange-400'
                        : gameState.orderPhase === 'cooked'
                        ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300'
                        : 'border-white/15 bg-white/5 text-zinc-300 hover:bg-white/10'
                    }`}
                  >
                    <Flame className="h-4 w-4" />
                    <span>
                      {gameState.orderPhase === 'cooked'
                        ? '2. Dish Cooked'
                        : '2. Cook at Stove'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const tableSt = getAllStations(
                        gameState.activeTableIndex
                      ).find((s) => s.type === 'table');
                      if (tableSt) handleInteractStation(tableSt);
                    }}
                    className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-extrabold transition-all whitespace-nowrap shrink-0 ${
                      gameState.orderPhase === 'cooked'
                        ? 'border-emerald-400 bg-emerald-400 text-zinc-950 shadow-lg hover:bg-emerald-300'
                        : 'border-white/15 bg-white/5 text-zinc-300 hover:bg-white/10'
                    }`}
                  >
                    <HandPlatter className="h-4 w-4" />
                    <span>3. Serve Customer</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. PRONUNCIATION MODAL (Web Speech API en-US + Phonetic Tolerance) */}
      {activeChallenge && (
        <PronunciationModal
          challenge={activeChallenge}
          onSuccess={handlePronunciationSuccess}
          onFailure={handlePronunciationFailure}
          onClose={() => setActiveChallenge(null)}
        />
      )}

      {/* 5. ENGLISH VOCABULARY & RECIPE DICTIONARY MODAL */}
      {showRecipeGuide && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-auto"
          style={{ backgroundColor: 'rgba(10, 10, 14, 0.75)' }}
          role="dialog"
          aria-modal="true"
          aria-label="English Kitchen Vocabulary Dictionary"
        >
          <div
            style={{ backgroundColor: 'rgba(20, 21, 26, 0.98)' }}
            className="w-full max-w-2xl rounded-2xl border border-white/15 p-6 text-white shadow-2xl max-h-[82vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-xl font-extrabold">
                  English Kitchen — Vocabulary & Recipes
                </h2>
                <p className="text-xs text-zinc-400">
                  Click any word to hear its native English pronunciation
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRecipeGuide(false)}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {RECIPES.map((rec) => (
                <div
                  key={rec.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-3.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-amber-300">
                      {rec.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => soundFX.speakWord(rec.name)}
                      className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-[11px] text-zinc-200 hover:bg-white/20"
                    >
                      <Volume2 className="h-3 w-3 text-amber-400" />
                      <span>Listen</span>
                    </button>
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {rec.translationPt} · <span className="font-mono">{rec.phonetic}</span>
                  </div>
                  <div className="mt-2 text-xs text-zinc-300">
                    Ingredients: {rec.ingredients.join(' · ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 6. PAUSE MODAL */}
      {gameState.screen === 'paused' && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-auto"
          style={{ backgroundColor: 'rgba(10, 10, 14, 0.78)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-modal-title"
        >
          <div
            style={{ backgroundColor: 'rgba(20, 21, 26, 0.98)' }}
            className="w-full max-w-md rounded-2xl border border-white/15 p-6 text-center text-white shadow-2xl"
          >
            <h2 id="pause-modal-title" className="text-2xl font-extrabold">
              Kitchen Shift Paused
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Take a breather, Chef! Your dishes won&apos;t burn while paused.
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2.5 text-center">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-[10px] font-bold text-zinc-400 uppercase">
                  SERVED
                </div>
                <div className="mt-1 font-mono-tabular text-xl font-extrabold text-sky-300">
                  {Math.round(gameState.dishesServed)}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-[10px] font-bold text-zinc-400 uppercase">
                  ACCURACY
                </div>
                <div className="mt-1 font-mono-tabular text-xl font-extrabold text-emerald-300">
                  {Math.round(accuracyPct)}%
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-[10px] font-bold text-zinc-400 uppercase">
                  COINS
                </div>
                <div className="mt-1 font-mono-tabular text-xl font-extrabold text-amber-300">
                  {Math.round(gameState.coins)}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={togglePause}
                className="w-full rounded-xl bg-amber-500 py-3 text-sm font-extrabold text-zinc-950 hover:bg-amber-400 transition-colors"
              >
                Resume Shift
              </button>
              <button
                type="button"
                onClick={restartGame}
                className="w-full rounded-xl border border-white/15 bg-white/5 py-2.5 text-xs font-bold text-zinc-200 hover:bg-white/10 transition-colors"
              >
                Restart Shift
              </button>
              <button
                type="button"
                onClick={() =>
                  setGameState((prev) => ({ ...prev, screen: 'title' }))
                }
                className="w-full rounded-xl border border-white/10 bg-transparent py-2.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
              >
                Return to Title Screen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. SHIFT COMPLETE / VICTORY MODAL ('gameover') */}
      {gameState.screen === 'gameover' && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-auto"
          style={{ backgroundColor: 'rgba(10, 10, 14, 0.82)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="victory-modal-title"
        >
          <div
            style={{ backgroundColor: 'rgba(20, 21, 26, 0.98)' }}
            className="w-full max-w-md rounded-2xl border border-amber-400/40 p-6 text-center text-white shadow-2xl"
          >
            <div className="text-xs font-bold tracking-widest text-amber-400 uppercase">
              SHIFT COMPLETE · MASTER CHEF
            </div>
            <h2 id="victory-modal-title" className="mt-1 text-3xl font-extrabold">
              Service Complete!
            </h2>
            <p className="mt-1 text-xs text-zinc-300">
              Every customer left happy and you mastered English culinary pronunciation!
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2.5 text-center">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-[10px] font-bold text-zinc-400 uppercase">
                  DISHES SERVED
                </div>
                <div className="mt-1 font-mono-tabular text-xl font-extrabold text-sky-300">
                  {Math.round(gameState.dishesServed)}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-[10px] font-bold text-zinc-400 uppercase">
                  SPEECH SCORE
                </div>
                <div className="mt-1 font-mono-tabular text-xl font-extrabold text-emerald-300">
                  {Math.round(accuracyPct)}%
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-[10px] font-bold text-zinc-400 uppercase">
                  TOTAL COINS
                </div>
                <div className="mt-1 font-mono-tabular text-xl font-extrabold text-amber-300">
                  {Math.round(gameState.coins)}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <button
                type="button"
                data-start="true"
                onClick={startGame}
                className="w-full rounded-xl bg-amber-500 py-3.5 text-sm font-extrabold text-zinc-950 hover:bg-amber-400 transition-colors"
              >
                Play Next Shift
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
