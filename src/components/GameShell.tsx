"use client";

import { useEffect, useRef, useState } from "react";
import { Hud } from "@/components/Hud";
import { GameEngine } from "@/game/GameEngine";
import type { CharacterVariantId, HudSnapshot } from "@/game/types";

const characterChoices: {
  id: CharacterVariantId;
  name: string;
  vibe: string;
  description: string;
}[] = [
    {
      id: "street",
      name: "Street Enforcer",
      vibe: "Gun-ready brawler",
      description: "Uses the richest combat-ready animation set: aiming, shooting, punches, kicks, hits, and death."
    },
    {
      id: "soldier",
      name: "Frontline Runner",
      vibe: "Fast tactical silhouette",
      description: "A distinct imported GLB soldier from the web, great for sprinting and patrol-style movement."
    },
    {
      id: "xbot",
      name: "Night Sneak",
      vibe: "Stealthy urban drifter",
      description: "An imported GLB with sneak and sad/scared-style poses for more personality in the city."
    }
  ];

const initialHud: HudSnapshot = {
  health: 100,
  armor: 65,
  cash: 500,
  wanted: 0,
  weapon: "Pistol",
  ammo: "40",
  speed: 0,
  missionTitle: "Sandbox Rebuild",
  missionText: "A richer open-world prototype with traffic, drivers, carjacking, cheats, and a minimap.",
  district: "Neon Central",
  timeLabel: "12:00",
  pickupHint: "Press F near a parked car or occupied ride to enter or hijack it.",
  debug: "Renderer idle",
  inVehicle: false,
  isAiming: false,
  statusOverlay: null,
  notification: null,
  digitalFootprint: 0,
  shopMenu: {
    open: false,
    shopName: "",
    shopType: null,
    items: []
  },
  interactionPrompt: null,
  minimap: {
    dots: [],
    playerHeading: 0
  },
  pauseMenu: {
    open: false,
    settings: {
      mouseSensitivity: "1x",
      trafficDensity: "Standard",
      crowdDensity: "Standard",
      showDebug: "On"
    },
    recentCheat: null,
    cheats: []
  }
};

export function GameShell() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [started, setStarted] = useState(false);
  const [hud, setHud] = useState(initialHud);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingLabel, setLoadingLabel] = useState("Initializing...");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterVariantId>("street");

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const engine = new GameEngine({
      canvas: canvasRef.current,
      playerCharacter: selectedCharacter,
      onHudChange: setHud,
      onLoadProgress: (progress: number, label: string) => {
        setLoadingProgress(progress);
        setLoadingLabel(label);
      }
    });

    engineRef.current = engine;

    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, [selectedCharacter]);

  const handleStart = async () => {
    if (!engineRef.current) {
      return;
    }

    setIsLoading(true);
    setLoadingProgress(0);
    setLoadingLabel("Loading 3D models...");

    await engineRef.current.start();
    setStarted(true);
    setIsLoading(false);
  };

  return (
    <main className="game-shell">
      <canvas ref={canvasRef} className="game-canvas" />
      <Hud
        hud={hud}
        onTogglePause={() => engineRef.current?.togglePause()}
        onCycleSetting={(key) => engineRef.current?.cycleSetting(key)}
        onPurchaseItem={(index) => engineRef.current?.purchaseShopItem(index)}
      />

      {!started ? (
        <div className="overlay">
          {isLoading ? (
            <div className="loading-screen">
              <div className="loading-logo">
                <div className="loading-logo-glow"></div>
                <h1 className="loading-title">Golden Coast Syndicate</h1>
                <p className="loading-subtitle">Loading the open world...</p>
              </div>
              <div className="loading-bar-container">
                <div className="loading-bar-track">
                  <div
                    className="loading-bar-fill"
                    style={{ width: `${loadingProgress}%` }}
                  ></div>
                </div>
                <div className="loading-bar-info">
                  <span className="loading-label">{loadingLabel}</span>
                  <span className="loading-percent">{Math.round(loadingProgress)}%</span>
                </div>
              </div>
              <div className="loading-tips">
                <div className="loading-tip-icon">💡</div>
                <p className="loading-tip-text">
                  Press <kbd>F</kbd> near vehicles to hijack them. Right-click to aim. Use cheat codes for a wild ride.
                </p>
              </div>
            </div>
          ) : (
            <div className="overlay-card">
              <div className="eyebrow">Vice City Mood / Mafia Weight / Saints Row Chaos</div>
              <h1 className="title">Golden Coast Syndicate</h1>
              <p className="subtitle">
                The new build leans into a richer sandbox loop: bikes and cars with visible wheels,
                police interceptors, active pedestrians, driver ownership, carjacking, aiming, cheat codes,
                a minimap, and a pause/settings layer.
              </p>

              <div className="chip-row">
                <div className="chip">Right-Click Aim</div>
                <div className="chip">Road Traffic</div>
                <div className="chip">Drivers + Carjacking</div>
                <div className="chip">Pause + Settings</div>
                <div className="chip">Cheat Codes</div>
              </div>

              <div className="character-picker">
                <div className="character-picker-copy">
                  <div className="eyebrow">Choose Your Character</div>
                  <p className="subtitle">
                    Your selected character becomes player-exclusive. Ambient civilians will be drawn from the remaining character pool so your hero does not show up as a random NPC.
                  </p>
                </div>
                <div className="character-card-grid">
                  {characterChoices.map((choice) => (
                    <button
                      key={choice.id}
                      type="button"
                      className={`character-card ${selectedCharacter === choice.id ? "active" : ""}`}
                      onClick={() => setSelectedCharacter(choice.id)}
                    >
                      <div className="character-vibe">{choice.vibe}</div>
                      <div className="character-name">{choice.name}</div>
                      <div className="character-desc">{choice.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="action-row">
                <button className="primary-button" onClick={handleStart}>
                  Launch Overhaul
                </button>
                <button className="secondary-button" type="button">
                  WASD Move | RMB Aim | LMB Fire | F Hijack | ESC Pause
                </button>
              </div>

              <div className="guide-grid">
                <div className="guide-card">
                  <strong>Traffic</strong>
                  <span>Cars and bikes now stay on route loops, carry drivers, and can be hijacked or entered if parked.</span>
                </div>
                <div className="guide-card">
                  <strong>Reactions</strong>
                  <span>Pedestrians now read the player differently: some freeze, some flee, some fight back, cops pursue.</span>
                </div>
                <div className="guide-card">
                  <strong>Combat</strong>
                  <span>Right-click shoulder aiming, pooled bullets, police return fire, and heavier wanted escalation.</span>
                </div>
                <div className="guide-card">
                  <strong>Controls</strong>
                  <span>Pause with ESC, use the map, cycle settings, and type classic-inspired cheats directly from gameplay.</span>
                </div>
              </div>

              <div className="footer-note">
                This is still intentionally light on raw graphics, but it now behaves much more like an actual open-world game loop.
              </div>
            </div>
          )}
        </div>
      ) : null}
    </main>
  );
}
