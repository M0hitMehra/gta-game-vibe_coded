"use client";

import type { SettingKey, HudSnapshot } from "@/game/types";

type HudProps = {
  hud: HudSnapshot;
  onTogglePause: () => void;
  onCycleSetting: (key: SettingKey) => void;
  onPurchaseItem?: (itemIndex: number) => void;
};

const dotColor = {
  player: "#ff6f59",
  vehicle: "#d1e4ff",
  police: "#5bb9ff",
  npc: "rgba(255,255,255,0.55)",
  pickup: "#84f18b",
  mission: "#ffd66b"
} as const;

export function Hud({ hud, onTogglePause, onCycleSetting, onPurchaseItem }: HudProps) {
  const wantedStars = `${"*".repeat(hud.wanted)}${".".repeat(Math.max(0, 5 - hud.wanted))}`;

  return (
    <div className="hud-layer">
      <div className="hud-corner top-left">
        <div className="hud-panel stack">
          <div className="bar-row">
            <div className="hud-kicker">Health</div>
            <div className="bar-track">
              <div className="bar-fill health" style={{ width: `${hud.health}%` }} />
            </div>
          </div>
          <div className="bar-row">
            <div className="hud-kicker">Armor</div>
            <div className="bar-track">
              <div className="bar-fill armor" style={{ width: `${hud.armor}%` }} />
            </div>
          </div>
        </div>

        <div className="hud-panel minimap-panel">
          <div className="hud-kicker">City Map</div>
          <svg viewBox="0 0 100 100" className="minimap-svg" aria-label="Minimap">
            <rect x="0" y="0" width="100" height="100" className="minimap-bg" />
            {hud.minimap.dots.map((dot, index) => {
              if (dot.kind === "player") {
                return (
                  <g
                    key={`player-${index}`}
                    transform={`translate(${dot.x}, ${dot.y}) rotate(${((dot.heading ?? 0) * 180) / Math.PI})`}
                  >
                    <path d="M 0 -4 L 3.5 3 L 0 1.5 L -3.5 3 Z" fill={dotColor.player} />
                  </g>
                );
              }

              return (
                <circle
                  key={`${dot.kind}-${index}`}
                  cx={dot.x}
                  cy={dot.y}
                  r={dot.kind === "mission" ? 2.2 : dot.kind === "police" ? 1.8 : 1.3}
                  fill={dotColor[dot.kind]}
                />
              );
            })}
          </svg>
          <div className="minimap-legend">Harbor north, civic strip south, missions in gold.</div>
        </div>
      </div>

      <div className="center-strap">
        <div className="hud-pill">
          <span className="hud-kicker">City Time</span>
          <span className="hud-value" style={{ marginLeft: 10 }}>
            {hud.timeLabel}
          </span>
        </div>
        <div className="mission-banner">
          <div className="mission-title">{hud.missionTitle}</div>
          <div className="mission-copy">{hud.missionText}</div>
        </div>
      </div>

      <div className="hud-corner top-right">
        <div className="hud-pill cash">${hud.cash.toLocaleString()}</div>
        <div className="hud-pill wanted-stars">{wantedStars}</div>
        {hud.digitalFootprint > 0 ? (
          <div className="hud-pill" style={{ background: "rgba(255,20,60,0.35)", borderColor: "#ff143c" }}>
            📱 {hud.digitalFootprint}%
          </div>
        ) : null}
      </div>

      <div className="hud-corner bottom-left">
        <div className="hud-panel">
          <div className="hud-kicker">Weapon</div>
          <div className="hud-value">
            {hud.weapon} <span style={{ color: "var(--warn)" }}>| {hud.ammo}</span>
          </div>
          <div className="hud-kicker" style={{ marginTop: 8 }}>
            Speed
          </div>
          <div className="hud-value">{hud.inVehicle ? `${hud.speed} MPH` : "On Foot"}</div>
          <div className="hud-kicker" style={{ marginTop: 8 }}>
            Interaction
          </div>
          <div className="hud-value" style={{ fontSize: "0.82rem", lineHeight: 1.55 }}>
            {hud.pickupHint}
          </div>
        </div>
      </div>

      <div className="hud-corner bottom-right">
        <div className="hud-panel">
          <div className="hud-kicker">District</div>
          <div className="hud-value">{hud.district}</div>
          <div className="hud-kicker" style={{ marginTop: 8 }}>
            Systems
          </div>
          <div className="hud-value" style={{ fontSize: "0.8rem", lineHeight: 1.6 }}>
            {hud.debug}
          </div>
        </div>
      </div>

      {/* Interaction prompt */}
      {hud.interactionPrompt ? (
        <div className="interaction-prompt">
          {hud.interactionPrompt}
        </div>
      ) : null}

      {hud.notification ? (
        <div className={`notification ${hud.notification.tone}`}>{hud.notification.message}</div>
      ) : null}

      {hud.statusOverlay ? (
        <div className="status-overlay">
          <div className="status-card">
            <div className="status-title">{hud.statusOverlay.title}</div>
            <div className="status-message">{hud.statusOverlay.message}</div>
            <div className="status-countdown">
              Respawning in {hud.statusOverlay.countdown}s
            </div>
          </div>
        </div>
      ) : null}

      {hud.isAiming ? (
        <div className="crosshair">
          <span />
        </div>
      ) : null}

      {/* Shop Menu Overlay */}
      {hud.shopMenu.open ? (
        <div className="shop-overlay">
          <div className="shop-card">
            <div className="shop-header">
              <div className="shop-icon">
                {hud.shopMenu.shopType === "convenience" ? "🏪" : hud.shopMenu.shopType === "burger" ? "🍔" : "👕"}
              </div>
              <h2 className="shop-title">{hud.shopMenu.shopName}</h2>
              <div className="shop-cash">Your Cash: ${hud.cash.toLocaleString()}</div>
            </div>
            <div className="shop-items">
              {hud.shopMenu.items.map((item, index) => (
                <button
                  key={item.name}
                  className="shop-item-button"
                  onClick={() => onPurchaseItem?.(index)}
                  disabled={hud.cash < item.price}
                >
                  <div className="shop-item-info">
                    <div className="shop-item-name">{item.name}</div>
                    <div className="shop-item-effect">
                      {item.effect === "health" ? `❤️ +${item.value} HP` : `🛡️ +${item.value} Armor`}
                    </div>
                  </div>
                  <div className={`shop-item-price ${hud.cash < item.price ? "insufficient" : ""}`}>
                    ${item.price}
                  </div>
                </button>
              ))}
            </div>
            <div className="shop-footer">
              Press <strong>E</strong> to leave
            </div>
          </div>
        </div>
      ) : null}

      {hud.pauseMenu.open ? (
        <div className="pause-overlay">
          <div className="pause-card">
            <div className="eyebrow">Paused</div>
            <h2 className="pause-title">City Control Menu</h2>
            <p className="subtitle">
              Tune the sandbox, review the active cheat list, then jump back in.
            </p>

            <div className="pause-actions">
              <button className="primary-button" onClick={onTogglePause}>
                Resume
              </button>
            </div>

            <div className="settings-grid">
              <button className="setting-button" onClick={() => onCycleSetting("mouseSensitivity")}>
                <strong>Mouse Sensitivity</strong>
                <span>{hud.pauseMenu.settings.mouseSensitivity}</span>
              </button>
              <button className="setting-button" onClick={() => onCycleSetting("trafficDensity")}>
                <strong>Traffic Density</strong>
                <span>{hud.pauseMenu.settings.trafficDensity}</span>
              </button>
              <button className="setting-button" onClick={() => onCycleSetting("crowdDensity")}>
                <strong>Crowd Density</strong>
                <span>{hud.pauseMenu.settings.crowdDensity}</span>
              </button>
              <button className="setting-button" onClick={() => onCycleSetting("showDebug")}>
                <strong>Debug Overlay</strong>
                <span>{hud.pauseMenu.settings.showDebug}</span>
              </button>
            </div>

            <div className="cheat-panel">
              <div className="hud-kicker">Cheat Codes</div>
              <div className="cheat-list">
                {hud.pauseMenu.cheats.map((cheat) => (
                  <div key={cheat}>{cheat}</div>
                ))}
              </div>
              {hud.pauseMenu.recentCheat ? (
                <div className="recent-cheat">Last cheat: {hud.pauseMenu.recentCheat}</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
