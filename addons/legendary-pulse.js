(() => {
  const bridge = window.TeriashAddonsBridge || {};
  const GM_getValue = bridge.getValue || (() => null);
  const GM_setValue = bridge.setValue || (() => {});
  const unsafeWindow = window;
(() => {
  "use strict";
  const pw = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  let started = false;
  const boot = () => {
    if (started) return true;
    if (pw.Engine?.items) {
      started = true;
      document.documentElement.dataset.legendaryPulseInterface = "NI";
(() => {
  "use strict";

  const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  if (pageWindow.LegendaryPulse) {
    console.info("[Legendary Pulse] Dodatek jest już uruchomiony.");
    return;
  }

  const ID = "legendary-pulse";
  const STORAGE_KEY = "legendaryPulse.settings.v1";
  const GLOBAL_STORAGE_KEY = "legendaryPulse.globalSettings.v1";

  const COLOR_PALETTES = {
    sunset: { name: "Zachód słońca", colors: ["#ffb347", "#ff6b6b", "#d84cff", "#6a5cff"] },
    legendary: { name: "Legenda", colors: ["#ffd35a", "#ff9f1c", "#c544ff", "#6d4aff"] },
    ocean: { name: "Ocean", colors: ["#35d7ff", "#368cff", "#655cff", "#38e3c1"] },
    emerald: { name: "Szmaragd", colors: ["#72f29a", "#29cf83", "#13b9a8", "#6de7d8"] },
    fire: { name: "Ogień", colors: ["#fff06a", "#ffb12b", "#ff6038", "#e62855"] },
    arcane: { name: "Arkana", colors: ["#f35cff", "#9e5cff", "#555dff", "#37c7ff"] },
    bloodmoon: { name: "Krwawy księżyc", colors: ["#ff5c7a", "#d91f55", "#7b183d", "#f08b43"] },
    aurora: { name: "Zorza", colors: ["#55f0b1", "#4cc9f0", "#8e72ff", "#f06ee8"] }
  };

  const DEFAULTS = {
    enabled: true,
    sound: true,
    burstAnimation: true,
    screenShake: true,
    screenShakeStrength: 100,
    screenCrack: true,
    legendaryLightning: true,
    screenFlash: true,
    itemGlow: true,
    centerMessage: true,
    clanMessage: false,
    duration: 6500,
    pollInterval: 180,
    palette: "legendary",
    animateColors: true,
    staticColors: false,
    useCustomPalette: false,
    customPalette1: "#ffd35a",
    customPalette2: "#ff9f1c",
    customPalette3: "#c544ff",
    mapColor: "#ffd35a",
    lootColor: "#ffd35a",
    itemColor: "#ffd35a",
    customSound: "",
    customSoundVolume: 100,
    glowSize: 100,
    widgetX: null,
    widgetY: null,
    accent: "#ffd35a",
    accent2: "#ff9f1c",
    clanText: "Spadła legenda! {item}"
  };

  const state = {
    settings: loadSettings(),
    seen: new Set(),
    startedAt: Date.now(),
    timer: null,
    audioContext: null,
    panelVisible: false,
    lastDetectedAt: 0,
    lootEffectTimer: null,
    lootEffectDeadline: 0,
    activeGlowElements: new Set(),
    testLootTimer: null,
    currentSoundAudio: null,
    currentSoundSource: "",
    currentSoundContext: null
  };

  function normalizeColorModes() {
    if (state.settings.staticColors) {
      state.settings.animateColors = false;
    } else {
      state.settings.animateColors = true;
    }
  }

  normalizeColorModes();

  function readLocalWorldSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function loadSettings() {
    try {
      if (typeof GM_getValue === "function") {
        const globalSettings = GM_getValue(GLOBAL_STORAGE_KEY, null);

        if (globalSettings && typeof globalSettings === "object") {
          return { ...DEFAULTS, ...globalSettings };
        }

        const migrated = { ...DEFAULTS, ...readLocalWorldSettings() };

        if (typeof GM_setValue === "function") {
          GM_setValue(GLOBAL_STORAGE_KEY, migrated);
        }

        return migrated;
      }
    } catch (e) {
      console.warn("[Legendary Pulse] Nie udało się odczytać globalnych ustawień:", e);
    }

    return { ...DEFAULTS, ...readLocalWorldSettings() };
  }

  function saveSettings() {
    const data = { ...state.settings };

    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(GLOBAL_STORAGE_KEY, data);
      }
    } catch (e) {
      console.warn("[Legendary Pulse] Nie udało się zapisać globalnych ustawień:", e);
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getActivePalette() {
    return COLOR_PALETTES[state.settings.palette] || COLOR_PALETTES.legendary;
  }

  function getActivePaletteColors() {
    if (state.settings.useCustomPalette) {
      const c1 = state.settings.customPalette1 || "#ffd35a";
      const c2 = state.settings.customPalette2 || "#ff9f1c";
      const c3 = state.settings.customPalette3 || "#c544ff";
      return [c1, c2, c3, c1];
    }

    const colors = getActivePalette().colors;
    return [
      colors[0] || "#ffd35a",
      colors[1] || colors[0] || "#ff9f1c",
      colors[2] || colors[1] || colors[0] || "#c544ff",
      colors[3] || colors[2] || colors[1] || colors[0] || "#6d4aff"
    ];
  }

  function paletteButtons() {
    return Object.entries(COLOR_PALETTES).map(([id, palette]) => {
      const gradient = `linear-gradient(90deg, ${palette.colors.join(", ")})`;
      return `
        <button
          type="button"
          class="lp-palette-card ${state.settings.palette === id ? "active" : ""}"
          data-palette="${id}"
          title="${esc(palette.name)}"
        >
          <span class="lp-palette-strip" style="display:block;background:${gradient}"></span>
          <span class="lp-palette-name">${esc(palette.name)}</span>
        </button>
      `;
    }).join("");
  }

  function injectStyles() {
    if (document.getElementById(`${ID}-styles`)) return;

    const style = document.createElement("style");
    style.id = `${ID}-styles`;
    style.textContent = `
      :root {
        --lp-accent: ${getActivePaletteColors()[0]};
        --lp-accent2: ${getActivePaletteColors()[1]};

        --lp-map1: ${getActivePaletteColors()[0]};
        --lp-map2: ${getActivePaletteColors()[1]};
        --lp-map3: ${getActivePaletteColors()[2]};
        --lp-map4: ${getActivePaletteColors()[3]};

        --lp-loot1: ${getActivePaletteColors()[0]};
        --lp-loot2: ${getActivePaletteColors()[1]};
        --lp-loot3: ${getActivePaletteColors()[2]};
        --lp-loot4: ${getActivePaletteColors()[3]};

        --lp-item1: ${getActivePaletteColors()[0]};
        --lp-item2: ${getActivePaletteColors()[1]};
        --lp-item3: ${getActivePaletteColors()[2]};
        --lp-item4: ${getActivePaletteColors()[3]};
        --lp-glow-scale: ${Number(state.settings.glowSize ?? 100) / 100};
      }

      #lp-screen-flash {
        z-index: 11;
        display: block;
        background: transparent;
        pointer-events: none;
        opacity: 0;
        box-sizing: border-box;
        overflow: hidden;
        border: 0 !important;
      }

      #lp-screen-flash.active {
        animation: lp-screen-pulse 3.0s linear infinite;
        animation-delay: 0s;
      }

      .lp-loot-glow {
        position: relative !important;
        animation: lp-item-pulse 3.0s linear infinite !important;
        animation-delay: 0s !important;
      }

      .lp-loot-glow .slot {
        animation: lp-item-slot-pulse 3.0s linear infinite !important;
        animation-delay: 0s !important;
      }

      #lp-settings {
        position: fixed;
        top: 70px;
        right: 22px;
        z-index: 1000000;
        width: 285px;
        color: #eceaf7;
        background: rgba(12, 12, 20, .98);
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 11px;
        box-shadow: 0 18px 55px rgba(0,0,0,.6);
        font: 12px Arial, sans-serif;
        user-select: none;
        display: none;
        overflow: hidden;
      }

      #lp-settings.visible {
        display: block;
        animation: lp-panel-in .18s ease-out;
      }

      .lp-panel-head {
        padding: 9px 11px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: move;
        background:
          linear-gradient(100deg,
            color-mix(in srgb, var(--lp-accent2) 24%, transparent),
            color-mix(in srgb, var(--lp-accent) 14%, transparent));
        border-bottom: 1px solid rgba(255,255,255,.08);
      }

      .lp-panel-title {
        font-weight: 800;
        letter-spacing: .3px;
      }

      .lp-panel-subtitle {
        color: rgba(255,255,255,.45);
        font-size: 9px;
        margin-top: 2px;
      }

      .lp-close {
        cursor: pointer;
        border: 0;
        border-radius: 8px;
        width: 25px;
        height: 25px;
        color: #fff;
        background: rgba(255,255,255,.08);
      }

      .lp-panel-body {
        padding: 7px 9px 9px;
        max-height: calc(72vh - 48px);
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,.28) rgba(255,255,255,.04);
      }

      .lp-panel-body::-webkit-scrollbar {
        width: 7px;
      }

      .lp-panel-body::-webkit-scrollbar-track {
        background: rgba(255,255,255,.035);
        border-radius: 10px;
      }

      .lp-panel-body::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,.25);
        border-radius: 10px;
      }

      .lp-panel-body::-webkit-scrollbar-thumb:hover {
        background: rgba(255,255,255,.38);
      }

      .lp-setting {
        min-height: 31px;
        display: flex;
        gap: 10px;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(255,255,255,.055);
      }

      .lp-setting:last-of-type {
        border-bottom: none;
      }

      .lp-setting input[type="checkbox"] {
        accent-color: var(--lp-accent2);
      }

      .lp-setting input[type="text"] {
        width: 142px;
        box-sizing: border-box;
        color: #fff;
        background: #181723;
        border: 1px solid rgba(255,255,255,.11);
        border-radius: 7px;
        padding: 6px 7px;
        outline: none;
      }

      .lp-actions {
        display: flex;
        gap: 8px;
        margin-top: 11px;
      }

      .lp-btn {
        flex: 1;
        cursor: pointer;
        padding: 8px 10px;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 9px;
        color: #fff;
        font-weight: 700;
        background: linear-gradient(135deg,
          color-mix(in srgb, var(--lp-accent2) 58%, #171521),
          color-mix(in srgb, var(--lp-accent) 38%, #171521));
      }

      .lp-btn.secondary {
        background: #191822;
      }

      .lp-palette-section {
        padding: 6px 0 3px;
        border-bottom: 1px solid rgba(255,255,255,.055);
      }

      .lp-palette-title {
        margin-bottom: 5px;
        font-size: 11px;
        color: rgba(255,255,255,.78);
      }

      .lp-palette-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 7px;
      }

      .lp-palette-card {
        min-height: 36px;
        padding: 4px;
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 9px;
        color: rgba(255,255,255,.88);
        background: rgba(255,255,255,.025);
        cursor: pointer;
        transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease;
      }

      .lp-palette-card:hover {
        transform: translateY(-1px);
        border-color: rgba(255,255,255,.24);
      }

      .lp-palette-card.active {
        border-color: var(--lp-accent);
        box-shadow:
          0 0 0 1px color-mix(in srgb, var(--lp-accent2) 50%, transparent),
          0 0 12px color-mix(in srgb, var(--lp-accent) 24%, transparent);
      }

      .lp-palette-strip {
        height: 13px;
        border-radius: 5px;
        margin-bottom: 3px;
        border: 1px solid rgba(255,255,255,.12);
      }

      .lp-palette-name {
        display: block;
        font-size: 9px;
        line-height: 1.1;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .lp-custom-palette-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        margin-top: 6px;
      }

      .lp-custom-palette-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: 30px;
        padding: 3px 5px;
        border: 1px solid rgba(255,255,255,.07);
        border-radius: 7px;
        background: rgba(255,255,255,.025);
      }

      .lp-custom-palette-row span {
        font-size: 9px;
        color: rgba(255,255,255,.68);
      }

      .lp-custom-palette-row input[type="color"] {
        width: 36px;
        height: 25px;
        padding: 0;
        border: 1px solid rgba(255,255,255,.16);
        border-radius: 5px;
        background: transparent;
        cursor: pointer;
      }

      .lp-custom-palette-grid.disabled {
        opacity: .4;
        pointer-events: none;
      }

      .lp-color-mode-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        min-height: 29px;
        padding: 2px 0;
        border-bottom: 1px solid rgba(255,255,255,.055);
      }

      .lp-color-mode-row .lp-setting-label {
        color: rgba(255,255,255,.84);
      }

      .lp-static-colors-section.disabled > .lp-setting {
        opacity: 1;
        color: #eceaf7;
      }

      .lp-static-colors-section.disabled .lp-color-mode-row {
        opacity: .42;
      }

      .lp-static-colors-section.disabled .lp-color-picker {
        pointer-events: none;
      }

      .lp-color-picker {
        width: 38px;
        height: 27px;
        padding: 0;
        border: 1px solid rgba(255,255,255,.16);
        border-radius: 6px;
        background: transparent;
        cursor: pointer;
      }

      .lp-palette-section.disabled {
        opacity: .42;
      }

      .lp-palette-section.disabled .lp-palette-card {
        pointer-events: none;
      }

      .lp-loot-window-glow {
        animation: lp-loot-window-pulse 3.0s linear infinite !important;
        animation-delay: 0s !important;
        will-change: box-shadow, filter;
      }

      @keyframes lp-loot-window-pulse {
        0%, 100% {
          box-shadow:
            0 0 calc(20px * var(--lp-glow-scale)) calc(4px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot1) calc(62% * var(--lp-glow-intensity)), transparent),
            0 0 calc(45px * var(--lp-glow-scale)) calc(8px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot1) calc(24% * var(--lp-glow-intensity)), transparent) !important;
          filter:
            drop-shadow(0 0 calc(5px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot1) calc(54% * var(--lp-glow-intensity)), transparent))
            drop-shadow(0 0 calc(15px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot1) calc(22% * var(--lp-glow-intensity)), transparent));
        }
        33.333% {
          box-shadow:
            0 0 calc(38px * var(--lp-glow-scale)) calc(8px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot2) calc(82% * var(--lp-glow-intensity)), transparent),
            0 0 calc(70px * var(--lp-glow-scale)) calc(23px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot2) calc(38% * var(--lp-glow-intensity)), transparent) !important;
          filter:
            drop-shadow(0 0 calc(8px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot2) calc(72% * var(--lp-glow-intensity)), transparent))
            drop-shadow(0 0 calc(23px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot2) calc(34% * var(--lp-glow-intensity)), transparent));
        }
        66.666% {
          box-shadow:
            0 0 calc(30px * var(--lp-glow-scale)) calc(6px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot3) calc(74% * var(--lp-glow-intensity)), transparent),
            0 0 calc(56px * var(--lp-glow-scale)) calc(18px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot3) calc(32% * var(--lp-glow-intensity)), transparent) !important;
          filter:
            drop-shadow(0 0 calc(12px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot3) calc(66% * var(--lp-glow-intensity)), transparent))
            drop-shadow(0 0 calc(18px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot3) calc(28% * var(--lp-glow-intensity)), transparent));
        }
      }

      #lp-mini-button {
        position: fixed;
        right: 18px;
        bottom: 135px;
        z-index: 999998;
        width: 38px;
        height: 38px;
        border-radius: 12px;
        border: 1px solid color-mix(in srgb, var(--lp-accent) 45%, transparent);
        color: #fff;
        background: linear-gradient(145deg, #171520, #0d0d14);
        box-shadow: 0 8px 20px rgba(0,0,0,.38), 0 0 12px color-mix(in srgb, var(--lp-accent2) 16%, transparent);
        cursor: grab;
        font-size: 18px;
      }

      @keyframes lp-in {
        to { transform: translateX(0); opacity: 1; }
      }

      @keyframes lp-out {
        to { transform: translateX(115%); opacity: 0; }
      }

      @keyframes lp-shine {
        from { left: -35%; }
        to { left: 130%; }
      }

      @keyframes lp-pulse {
        from { transform: scale(.9); opacity: .65; }
        to { transform: scale(1.15); opacity: 1; }
      }

      @keyframes lp-item-pulse {
        0%, 100% {
          filter:
            drop-shadow(0 0 calc(12px * var(--lp-glow-scale)) var(--lp-item1))
            brightness(1.06);
          box-shadow:
            0 0 calc(15px * var(--lp-glow-scale)) calc(2px * var(--lp-glow-scale))
            color-mix(in srgb, var(--lp-item1) calc(72% * var(--lp-glow-intensity)), transparent);
        }
        33.333% {
          filter:
            drop-shadow(0 0 calc(23px * var(--lp-glow-scale)) var(--lp-item2))
            brightness(1.16);
          box-shadow:
            0 0 calc(27px * var(--lp-glow-scale)) calc(4px * var(--lp-glow-scale))
            color-mix(in srgb, var(--lp-item2) calc(82% * var(--lp-glow-intensity)), transparent);
        }
        66.666% {
          filter:
            drop-shadow(0 0 calc(17px * var(--lp-glow-scale)) var(--lp-item3))
            brightness(1.11);
          box-shadow:
            0 0 calc(20px * var(--lp-glow-scale)) calc(3px * var(--lp-glow-scale))
            color-mix(in srgb, var(--lp-item3) calc(77% * var(--lp-glow-intensity)), transparent);
        }
      }

      @keyframes lp-item-slot-pulse {
        0%, 100% {
          box-shadow:
            0 0 calc(15px * var(--lp-glow-scale)) calc(2px * var(--lp-glow-scale))
            color-mix(in srgb, var(--lp-item1) calc(74% * var(--lp-glow-intensity)), transparent);
        }
        33.333% {
          box-shadow:
            0 0 calc(23px * var(--lp-glow-scale)) calc(4px * var(--lp-glow-scale))
            color-mix(in srgb, var(--lp-item2) calc(84% * var(--lp-glow-intensity)), transparent);
        }
        66.666% {
          box-shadow:
            0 0 calc(18px * var(--lp-glow-scale)) calc(3px * var(--lp-glow-scale))
            color-mix(in srgb, var(--lp-item3) calc(79% * var(--lp-glow-intensity)), transparent);
        }
      }

      @keyframes lp-screen-pulse {
        0%, 100% {
          opacity: calc(.42 * var(--lp-glow-intensity));
          border: 0;
          box-shadow:
            inset 0 0 calc(100px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-map1) calc(50% * var(--lp-glow-intensity)), transparent),
            inset 0 0 calc(235px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-map1) calc(29% * var(--lp-glow-intensity)), transparent),
            inset 0 0 calc(410px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-map1) calc(14% * var(--lp-glow-intensity)), transparent);
        }
        33.333% {
          opacity: calc(.94 * var(--lp-glow-intensity));
          border: 0;
          box-shadow:
            inset 0 0 calc(145px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-map2) calc(78% * var(--lp-glow-intensity)), transparent),
            inset 0 0 calc(340px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-map2) calc(48% * var(--lp-glow-intensity)), transparent),
            inset 0 0 calc(555px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-map2) calc(25% * var(--lp-glow-intensity)), transparent);
        }
        66.666% {
          opacity: calc(.70 * var(--lp-glow-intensity));
          border: 0;
          box-shadow:
            inset 0 0 calc(125px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-map3) calc(64% * var(--lp-glow-intensity)), transparent),
            inset 0 0 calc(290px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-map3) calc(38% * var(--lp-glow-intensity)), transparent),
            inset 0 0 calc(480px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-map3) calc(19% * var(--lp-glow-intensity)), transparent);
        }
      }

      #lp-legend-lightning {
        position: fixed;
        left: 0;
        top: 0;
        width: 0;
        height: 0;
        pointer-events: none;
        z-index: 2147483639;
        overflow: visible;
        opacity: 1;
      }

      #lp-legend-lightning svg {
        width: 100%;
        height: 100%;
        overflow: visible;
        filter:
          drop-shadow(0 0 2px rgba(255,255,255,.98))
          drop-shadow(0 0 7px var(--lp-map1))
          drop-shadow(0 0 15px var(--lp-map2));
      }

      #lp-legend-lightning .lp-bolt-shadow {
        fill: none;
        stroke: rgba(20,25,55,.92);
        stroke-width: 5;
        stroke-linecap: butt;
        stroke-linejoin: miter;
        vector-effect: non-scaling-stroke;
      }

      #lp-legend-lightning .lp-bolt-main {
        fill: none;
        stroke: rgba(245,252,255,.98);
        stroke-width: 1.45;
        stroke-linecap: butt;
        stroke-linejoin: miter;
        vector-effect: non-scaling-stroke;
      }

      #lp-legend-lightning .lp-bolt-color {
        fill: none;
        stroke: var(--lp-map1);
        stroke-width: 2.8;
        stroke-linecap: butt;
        stroke-linejoin: miter;
        vector-effect: non-scaling-stroke;
        opacity: .72;
      }

      #lp-legend-lightning .lp-bolt-branch {
        fill: none;
        stroke: color-mix(in srgb, var(--lp-map2) 65%, white);
        stroke-width: .85;
        stroke-linecap: butt;
        vector-effect: non-scaling-stroke;
        opacity: .9;
      }

      #lp-legend-lightning .lp-lightning-impact {
        position: absolute;
        width: 26px;
        height: 26px;
        margin: -13px 0 0 -13px;
        border-radius: 50%;
        background: radial-gradient(circle,
          rgba(255,255,255,.98) 0 8%,
          var(--lp-map1) 20%,
          color-mix(in srgb, var(--lp-map2) 60%, transparent) 48%,
          transparent 72%);
        filter: blur(.2px) drop-shadow(0 0 16px var(--lp-map1));
        animation: lp-lightning-impact 620ms ease-out forwards;
      }

      #lp-legend-lightning.active {
        animation: lp-lightning-layer 780ms ease-out forwards;
      }

      @keyframes lp-lightning-layer {
        0% { opacity: 0; }
        3% { opacity: 1; }
        8% { opacity: .12; }
        13% { opacity: .96; }
        20% { opacity: .28; }
        27% { opacity: 1; }
        36% { opacity: .18; }
        44% { opacity: .88; }
        58% { opacity: .34; }
        72% { opacity: .14; }
        100% { opacity: 0; }
      }

      @keyframes lp-lightning-impact {
        0% { transform: scale(.2); opacity: 0; }
        10% { transform: scale(1.55); opacity: 1; }
        38% { transform: scale(2.8); opacity: .82; }
        100% { transform: scale(4.2); opacity: 0; }
      }

      #lp-screen-crack {
        position: fixed;
        left: 0;
        top: 0;
        width: 0;
        height: 0;
        pointer-events: none;
        z-index: 2147483646;
        overflow: visible;
        opacity: 0;
      }

      #lp-screen-crack svg {
        width: 100%;
        height: 100%;
        overflow: visible;
        filter:
          drop-shadow(0 0 1px rgba(255,255,255,.95))
          drop-shadow(0 0 3px rgba(120,190,255,.45))
          drop-shadow(0 1px 1px rgba(0,0,0,.85));
      }

      #lp-screen-crack.active {
        animation: lp-screen-crack-fade 920ms cubic-bezier(.12,.7,.22,1) forwards;
      }

      #lp-screen-crack .lp-crack-main {
        fill: none;
        stroke: rgba(245,250,255,.96);
        stroke-width: 1.45;
        stroke-linecap: round;
        stroke-linejoin: round;
        vector-effect: non-scaling-stroke;
      }

      #lp-screen-crack .lp-crack-shadow {
        fill: none;
        stroke: rgba(5,8,16,.82);
        stroke-width: 3.6;
        stroke-linecap: round;
        stroke-linejoin: round;
        vector-effect: non-scaling-stroke;
        opacity: .72;
      }

      #lp-screen-crack .lp-crack-fine {
        fill: none;
        stroke: rgba(225,242,255,.78);
        stroke-width: .72;
        stroke-linecap: round;
        vector-effect: non-scaling-stroke;
      }

      #lp-screen-crack .lp-crack-impact {
        fill: rgba(255,255,255,.20);
        stroke: rgba(255,255,255,.90);
        stroke-width: 1;
        vector-effect: non-scaling-stroke;
      }

      @keyframes lp-screen-crack-fade {
        0%   { opacity: 0; transform: scale(.985); filter: brightness(1.9); }
        8%   { opacity: 1; transform: scale(1); filter: brightness(1.35); }
        48%  { opacity: .92; transform: scale(1.002); filter: brightness(1.05); }
        72%  { opacity: .52; }
        100% { opacity: 0; transform: scale(1.006); filter: brightness(.9); }
      }

    @keyframes lp-screen-shake {
      0%, 100% { transform: translate3d(0, 0, 0); }
      14% { transform: translate3d(calc(-1px * var(--lp-shake-strength)), calc(1px * var(--lp-shake-strength)), 0); }
      28% { transform: translate3d(calc(2px * var(--lp-shake-strength)), calc(-1px * var(--lp-shake-strength)), 0); }
      42% { transform: translate3d(calc(-2px * var(--lp-shake-strength)), 0, 0); }
      56% { transform: translate3d(calc(1px * var(--lp-shake-strength)), calc(1px * var(--lp-shake-strength)), 0); }
      70% { transform: translate3d(calc(-1px * var(--lp-shake-strength)), calc(-1px * var(--lp-shake-strength)), 0); }
      84% { transform: translate3d(calc(1px * var(--lp-shake-strength)), 0, 0); }
    }

    #lp-burst-layer {
        position: fixed;
        left: 0;
        top: 0;
        width: 0;
        height: 0;
        pointer-events: none;
        z-index: 2147483638;
        overflow: visible;
      }

      .lp-burst-core,
      .lp-burst-ring,
      .lp-burst-particle {
        position: absolute;
        left: 0;
        top: 0;
        pointer-events: none;
        will-change: transform, opacity, filter;
      }

      .lp-burst-core {
        width: 34px;
        height: 34px;
        margin: -17px 0 0 -17px;
        border-radius: 50%;
        background:
          radial-gradient(circle,
            rgba(255,255,255,.98) 0 12%,
            var(--lp-map1) 22%,
            color-mix(in srgb, var(--lp-map2) 72%, transparent) 48%,
            transparent 74%);
        filter: blur(.4px) drop-shadow(0 0 18px var(--lp-map1));
        animation: lp-burst-core 900ms cubic-bezier(.14,.72,.24,1) forwards;
      }

      .lp-burst-ring {
        width: 32px;
        height: 32px;
        margin: -16px 0 0 -16px;
        border: 3px solid var(--lp-map1);
        border-radius: 50%;
        box-shadow:
          0 0 16px var(--lp-map1),
          inset 0 0 12px color-mix(in srgb, var(--lp-map2) 72%, transparent);
        animation: lp-burst-ring 1050ms cubic-bezier(.12,.67,.2,1) forwards;
      }

      .lp-burst-particle {
        width: var(--lp-particle-size, 5px);
        height: var(--lp-particle-size, 5px);
        margin:
          calc(var(--lp-particle-size, 5px) / -2)
          0 0
          calc(var(--lp-particle-size, 5px) / -2);
        border-radius: 999px;
        background: var(--lp-particle-color, var(--lp-map1));
        box-shadow:
          0 0 8px var(--lp-particle-color, var(--lp-map1)),
          0 0 16px color-mix(in srgb, var(--lp-particle-color, var(--lp-map1)) 65%, transparent);
        animation: lp-burst-particle var(--lp-particle-duration, 1050ms)
          cubic-bezier(.12,.62,.22,1) forwards;
        animation-delay: var(--lp-particle-delay, 0ms);
      }

      @keyframes lp-burst-core {
        0% {
          transform: scale(.15);
          opacity: 0;
        }
        16% {
          transform: scale(1.55);
          opacity: 1;
        }
        48% {
          transform: scale(3.2);
          opacity: .76;
        }
        100% {
          transform: scale(5.1);
          opacity: 0;
        }
      }

      @keyframes lp-burst-ring {
        0% {
          transform: scale(.25);
          opacity: 0;
          border-color: var(--lp-map1);
        }
        18% {
          opacity: 1;
        }
        52% {
          border-color: var(--lp-map2);
        }
        100% {
          transform: scale(7.2);
          opacity: 0;
          border-color: var(--lp-map3);
        }
      }

      @keyframes lp-burst-particle {
        0% {
          transform:
            translate(0, 0)
            scale(.3);
          opacity: 0;
        }
        12% {
          opacity: 1;
        }
        55% {
          background: var(--lp-particle-color2, var(--lp-map2));
        }
        100% {
          transform:
            translate(var(--lp-particle-x), var(--lp-particle-y))
            scale(.05);
          opacity: 0;
        }
      }

      @keyframes lp-panel-in {
        from { opacity: 0; transform: translateY(-6px) scale(.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
    `;
    document.head.appendChild(style);
  }

  function createUi() {
    if (!document.getElementById("lp-screen-flash")) {
      const flash = document.createElement("div");
      flash.id = "lp-screen-flash";
      flash.className = "map-overlay";
      flash.style.setProperty("z-index", "11");
      flash.style.setProperty("display", "block");
      flash.style.setProperty("background", "transparent");
      flash.style.setProperty("pointer-events", "none");

      const appendFlash = () => {
        const gameLayer = document.querySelector(".game-layer");
        if (gameLayer) {
          gameLayer.appendChild(flash);
          return;
        }
        setTimeout(appendFlash, 250);
      };

      appendFlash();
    }

    if (!document.getElementById("lp-mini-button")) {
      const button = document.createElement("button");
      button.id = "lp-mini-button";
      button.type = "button";
      button.title = "Legendary Pulse — ustawienia (Alt+L)";
      button.textContent = "✦";
      button.addEventListener("click", e => {
        if (button.dataset.lpJustDragged === "1") {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        togglePanel();
      });
      document.body.appendChild(button);
      restoreMiniWidgetPosition(button);
      makeMiniWidgetDraggable(button);
    }

    if (!document.getElementById("lp-settings")) {
      const panel = document.createElement("div");
      panel.id = "lp-settings";
      panel.innerHTML = `
        <div class="lp-panel-head">
          <div>
            <div class="lp-panel-title">✦ Legendary Pulse</div>
            <div class="lp-panel-subtitle">Notyfikator legend</div>
          </div>
          <button class="lp-close" type="button">×</button>
        </div>

        <div class="lp-panel-body">
          ${checkboxRow("enabled", "Dodatek aktywny")}
          ${checkboxRow("sound", "Dźwięk")}
          ${checkboxRow("burstAnimation", "Animacja wybuchu")}
          ${checkboxRow("screenShake", "Lekkie trzęsienie ekranu")}
          <div id="lp-screen-shake-strength-wrap" style="margin:4px 0 8px;">
            <div class="lp-row">
              <span>Siła trzęsienia</span>
              <strong id="lp-screen-shake-strength-value">${Math.round(state.settings.screenShakeStrength)}%</strong>
            </div>
            <input id="lp-screen-shake-strength" type="range" min="10" max="200" step="5" value="${state.settings.screenShakeStrength}" style="width:100%;">
          </div>
          ${checkboxRow("screenCrack", "Pęknięcie ekranu")}
          ${checkboxRow("legendaryLightning", "Błyskawice do legendy")}
          ${checkboxRow("screenFlash", "Obramowanie mapy")}
          ${checkboxRow("itemGlow", "Podświetlenie itemu")}
          ${checkboxRow("centerMessage", "Wiadomość ekranowa")}
          ${checkboxRow("clanMessage", "Wiadomość klanowa")}

          <label class="lp-setting">
            <span>Tekst klanowy</span>
            <input id="lp-clanText" type="text" value="${esc(state.settings.clanText)}">
          </label>

          <label class="lp-setting">
            <span>Animacja przechodzenia między kolorami</span>
            <input id="lp-animate-colors" type="checkbox" ${state.settings.animateColors ? "checked" : ""}>
          </label>

          <div class="lp-palette-section ${state.settings.animateColors ? "" : "disabled"}">
            <div class="lp-palette-title">Paleta animacji</div>
            <div class="lp-palette-grid">
              ${paletteButtons()}
            </div>

            <label class="lp-setting" style="margin-top:6px;">
              <span>Własne kolory przejścia</span>
              <input id="lp-use-custom-palette" type="checkbox" ${state.settings.useCustomPalette ? "checked" : ""}>
            </label>

            <div class="lp-custom-palette-grid ${state.settings.useCustomPalette ? "" : "disabled"}">
              <label class="lp-custom-palette-row">
                <span>Kolor 1</span>
                <input id="lp-custom-palette-1" type="color" value="${esc(state.settings.customPalette1)}">
              </label>
              <label class="lp-custom-palette-row">
                <span>Kolor 2</span>
                <input id="lp-custom-palette-2" type="color" value="${esc(state.settings.customPalette2)}">
              </label>
              <label class="lp-custom-palette-row">
                <span>Kolor 3</span>
                <input id="lp-custom-palette-3" type="color" value="${esc(state.settings.customPalette3)}">
              </label>
            </div>
          </div>

          <div class="lp-static-colors-section ${state.settings.staticColors ? "" : "disabled"}">
            <label class="lp-setting" style="margin-top:6px;">
              <span>Statyczne kolory podświetlenia</span>
              <input id="lp-static-colors" type="checkbox" ${state.settings.staticColors ? "checked" : ""}>
            </label>

            <div class="lp-color-mode-row">
              <span class="lp-setting-label">Obramowanie mapy</span>
              <input id="lp-map-color" class="lp-color-picker" type="color" value="${esc(state.settings.mapColor)}">
            </div>

            <div class="lp-color-mode-row">
              <span class="lp-setting-label">Obramowanie okna łupów</span>
              <input id="lp-loot-color" class="lp-color-picker" type="color" value="${esc(state.settings.lootColor)}">
            </div>

            <div class="lp-color-mode-row">
              <span class="lp-setting-label">Obramowanie itemu</span>
              <input id="lp-item-color" class="lp-color-picker" type="color" value="${esc(state.settings.itemColor)}">
            </div>
          </div>

          <div class="lp-palette-section">
            <div class="lp-palette-title">Wielkość podświetleń</div>
            <label class="lp-setting">
              <span>Rozmiar wszystkich efektów</span>
              <input
                id="lp-glow-size"
                type="range"
                min="40"
                max="200"
                step="5"
                value="${Number(state.settings.glowSize ?? 100)}"
              >
              <span id="lp-glow-size-value">${Number(state.settings.glowSize ?? 100)}%</span>
            </label>
          </div>

          <div class="lp-palette-section">
            <div class="lp-palette-title">Własny dźwięk powiadomienia</div>

            <label class="lp-setting" style="display:block;">
              <span style="display:block;margin-bottom:6px;">Link / ścieżka do MP3 lub MP4</span>
              <input
                id="lp-custom-sound"
                type="text"
                value="${esc(state.settings.customSound || "")}"
                placeholder="np. https://.../dzwiek.mp3"
                style="width:100%;box-sizing:border-box;"
              >
            </label>

            <label class="lp-setting">
              <span>Głośność własnego dźwięku</span>
              <input
                id="lp-custom-sound-volume"
                type="range"
                min="0"
                max="100"
                step="1"
                value="${Number(state.settings.customSoundVolume ?? 100)}"
              >
              <span id="lp-custom-sound-volume-value">${Number(state.settings.customSoundVolume ?? 100)}%</span>
            </label>

            <div class="lp-actions" style="margin-top:8px;">
              <button id="lp-test-sound" type="button">TEST DŹWIĘKU</button>
              <button id="lp-clear-sound" type="button">WYCZYŚĆ</button>
            </div>

            <div style="margin-top:7px;font-size:10px;line-height:1.35;color:rgba(255,255,255,.55);">
              Puste pole = domyślny dźwięk dodatku. Najpewniej działają bezpośrednie adresy HTTPS do plików MP3/MP4.
            </div>
          </div>

          <div class="lp-actions">
            <button class="lp-btn" id="lp-test" type="button">TEST LEGENDY</button>
            <button class="lp-btn secondary" id="lp-reset" type="button">RESET</button>
          </div>
        </div>
      `;
      document.body.appendChild(panel);

      const closeButton = panel.querySelector(".lp-close");
      closeButton.addEventListener("mousedown", e => {
        e.stopPropagation();
      });
      closeButton.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        setPanel(false);
      });
      panel.querySelector("#lp-test").addEventListener("click", () => {
        runLootWindowTest();
      });

      panel.querySelector("#lp-reset").addEventListener("click", () => {
        state.settings = { ...DEFAULTS };
        saveSettings();
        syncUiFromSettings();
        updateCssVars();
      });

      panel.querySelectorAll("[data-lp-setting]").forEach(input => {
        input.addEventListener("change", () => {
          const key = input.dataset.lpSetting;
          state.settings[key] = input.checked;
          saveSettings();

          if (key === "screenShake") {
            const wrap = panel.querySelector("#lp-screen-shake-strength-wrap");
            if (wrap) wrap.style.display = input.checked ? "block" : "none";
          }
        });
      });

      const shakeStrengthInput = panel.querySelector("#lp-screen-shake-strength");
      const shakeStrengthValue = panel.querySelector("#lp-screen-shake-strength-value");
      shakeStrengthInput?.addEventListener("input", e => {
        const value = Math.max(10, Math.min(200, Number(e.target.value) || 100));
        state.settings.screenShakeStrength = value;
        if (shakeStrengthValue) shakeStrengthValue.textContent = `${Math.round(value)}%`;
        saveSettings();
      });

      panel.querySelector("#lp-clanText").addEventListener("change", e => {
        state.settings.clanText = e.target.value || DEFAULTS.clanText;
        saveSettings();
      });

      panel.querySelectorAll(".lp-palette-card").forEach(button => {
        button.addEventListener("click", () => {
          const paletteId = button.dataset.palette;
          if (!COLOR_PALETTES[paletteId]) return;

          state.settings.palette = paletteId;
          state.settings.useCustomPalette = false;
          const colors = COLOR_PALETTES[paletteId].colors;
          state.settings.accent = colors[0];
          state.settings.accent2 = colors[1];

          saveSettings();
          updateCssVars();
          syncUiFromSettings();
        });
      });

      const useCustomPaletteInput = panel.querySelector("#lp-use-custom-palette");
      const customPaletteInputs = [
        panel.querySelector("#lp-custom-palette-1"),
        panel.querySelector("#lp-custom-palette-2"),
        panel.querySelector("#lp-custom-palette-3")
      ];

      useCustomPaletteInput.addEventListener("change", e => {
        if (state.settings.staticColors) {
          e.target.checked = !!state.settings.useCustomPalette;
          e.target.disabled = true;
          return;
        }
        state.settings.useCustomPalette = e.target.checked;
        state.settings.animateColors = true;
        state.settings.staticColors = false;
        saveSettings();
        updateCssVars();
        syncUiFromSettings();
      });

      customPaletteInputs.forEach((input, index) => {
        input.addEventListener("input", e => {
          state.settings[`customPalette${index + 1}`] = e.target.value;
          saveSettings();
          updateCssVars();
        });
      });

      const animateColorsInput = panel.querySelector("#lp-animate-colors");
      const staticColorsInput = panel.querySelector("#lp-static-colors");
      const mapColorInput = panel.querySelector("#lp-map-color");
      const lootColorInput = panel.querySelector("#lp-loot-color");
      const itemColorInput = panel.querySelector("#lp-item-color");

      animateColorsInput.addEventListener("change", e => {
        if (e.target.checked) {
          state.settings.animateColors = true;
          state.settings.staticColors = false;
        } else {
          e.target.checked = true;
          return;
        }
        saveSettings();
        updateCssVars();
        syncUiFromSettings();
      });

      staticColorsInput.addEventListener("change", e => {
        if (e.target.checked) {
          state.settings.staticColors = true;
          state.settings.animateColors = false;
        } else {
          e.target.checked = true;
          return;
        }
        saveSettings();
        updateCssVars();
        syncUiFromSettings();
      });

      mapColorInput.addEventListener("input", e => {
        state.settings.mapColor = e.target.value;
        saveSettings();
        updateCssVars();
      });

      lootColorInput.addEventListener("input", e => {
        state.settings.lootColor = e.target.value;
        saveSettings();
        updateCssVars();
      });

      itemColorInput.addEventListener("input", e => {
        state.settings.itemColor = e.target.value;
        saveSettings();
        updateCssVars();
      });

      const glowSizeControl = panel.querySelector("#lp-glow-size");
      const glowSizeLabel = panel.querySelector("#lp-glow-size-value");

      glowSizeControl.addEventListener("input", e => {
        const value = Math.max(40, Math.min(200, Number(e.target.value) || 100));
        state.settings.glowSize = value;
        glowSizeLabel.textContent = `${value}%`;
        saveSettings();
        updateGlowSize();
      });

      const customSoundInput = panel.querySelector("#lp-custom-sound");
      const customSoundVolume = panel.querySelector("#lp-custom-sound-volume");
      const customSoundVolumeValue = panel.querySelector("#lp-custom-sound-volume-value");

      customSoundInput.addEventListener("change", e => {
        state.settings.customSound = e.target.value.trim();
        saveSettings();
      });

      customSoundVolume.addEventListener("input", e => {
        const value = Math.max(0, Math.min(100, Number(e.target.value) || 0));
        state.settings.customSoundVolume = value;
        customSoundVolumeValue.textContent = `${value}%`;
        saveSettings();
      });

      panel.querySelector("#lp-test-sound").addEventListener("click", () => {
        playLegendSound(true);
      });

      panel.querySelector("#lp-clear-sound").addEventListener("click", () => {
        state.settings.customSound = "";
        customSoundInput.value = "";
        saveSettings();
      });

      const panelBody = panel.querySelector(".lp-panel-body");

      if (panelBody) {
        const handlePanelWheel = event => {
          event.stopPropagation();
          event.preventDefault();

          let delta = event.deltaY;

          if (!Number.isFinite(delta) || delta === 0) {
            delta = event.wheelDelta ? -event.wheelDelta : 0;
          }

          panelBody.scrollTop += delta;
        };

        panelBody.addEventListener("wheel", handlePanelWheel, {
          passive: false,
          capture: true
        });

        panelBody.addEventListener("mousewheel", handlePanelWheel, {
          passive: false,
          capture: true
        });
      }

      makeDraggable(panel, panel.querySelector(".lp-panel-head"));
    }
  }

  function checkboxRow(key, label) {
    return `
      <label class="lp-setting">
        <span>${esc(label)}</span>
        <input type="checkbox" data-lp-setting="${key}" ${state.settings[key] ? "checked" : ""}>
      </label>
    `;
  }

  function syncUiFromSettings() {
    const panel = document.getElementById("lp-settings");
    if (!panel) return;

    panel.querySelectorAll("[data-lp-setting]").forEach(input => {
      input.checked = !!state.settings[input.dataset.lpSetting];
    });

    const shakeStrengthWrap = panel.querySelector("#lp-screen-shake-strength-wrap");
    const shakeStrengthInput = panel.querySelector("#lp-screen-shake-strength");
    const shakeStrengthValue = panel.querySelector("#lp-screen-shake-strength-value");
    const shakeStrength = Math.max(10, Math.min(200, Number(state.settings.screenShakeStrength ?? 100)));
    if (shakeStrengthWrap) shakeStrengthWrap.style.display = state.settings.screenShake ? "block" : "none";
    if (shakeStrengthInput) shakeStrengthInput.value = String(shakeStrength);
    if (shakeStrengthValue) shakeStrengthValue.textContent = `${Math.round(shakeStrength)}%`;

    panel.querySelector("#lp-clanText").value = state.settings.clanText;

    panel.querySelectorAll(".lp-palette-card").forEach(button => {
      button.classList.toggle("active", button.dataset.palette === state.settings.palette);
    });

    const useCustomPaletteInput = panel.querySelector("#lp-use-custom-palette");
    const customPaletteInputs = [
      panel.querySelector("#lp-custom-palette-1"),
      panel.querySelector("#lp-custom-palette-2"),
      panel.querySelector("#lp-custom-palette-3"),
      panel.querySelector("#lp-custom-palette-4")
    ];
    const customPaletteGrid = panel.querySelector(".lp-custom-palette-grid");

    if (useCustomPaletteInput) {
      useCustomPaletteInput.checked = !!state.settings.useCustomPalette;
      useCustomPaletteInput.disabled = !!state.settings.staticColors;
    }
    customPaletteInputs.forEach((input, index) => {
      if (input) input.value = state.settings[`customPalette${index + 1}`];
    });
    customPaletteGrid?.classList.toggle("disabled", !state.settings.useCustomPalette);

    const animateColorsInput = panel.querySelector("#lp-animate-colors");
    const staticColorsInput = panel.querySelector("#lp-static-colors");
    const staticColorsSection = panel.querySelector(".lp-static-colors-section");
    const mapColorInput = panel.querySelector("#lp-map-color");
    const lootColorInput = panel.querySelector("#lp-loot-color");
    const itemColorInput = panel.querySelector("#lp-item-color");
    const paletteSection = panel.querySelector(".lp-palette-section");

    if (animateColorsInput) {
      animateColorsInput.checked = !!state.settings.animateColors;
      animateColorsInput.disabled = false;
    }
    if (staticColorsInput) {
      staticColorsInput.checked = !!state.settings.staticColors;
      staticColorsInput.disabled = false;
    }
    if (mapColorInput) mapColorInput.value = state.settings.mapColor;
    if (lootColorInput) lootColorInput.value = state.settings.lootColor;
    if (itemColorInput) itemColorInput.value = state.settings.itemColor;
    paletteSection?.classList.toggle("disabled", !state.settings.animateColors);
    staticColorsSection?.classList.toggle("disabled", !state.settings.staticColors);

    const glowSizeSync = panel.querySelector("#lp-glow-size");
    const glowSizeValueSync = panel.querySelector("#lp-glow-size-value");

    if (glowSizeSync) glowSizeSync.value = Number(state.settings.glowSize ?? 100);
    if (glowSizeValueSync) glowSizeValueSync.textContent = `${Number(state.settings.glowSize ?? 100)}%`;

    const customSoundInput = panel.querySelector("#lp-custom-sound");
    const customSoundVolume = panel.querySelector("#lp-custom-sound-volume");
    const customSoundVolumeValue = panel.querySelector("#lp-custom-sound-volume-value");

    if (customSoundInput) customSoundInput.value = state.settings.customSound || "";
    if (customSoundVolume) customSoundVolume.value = Number(state.settings.customSoundVolume ?? 100);
    if (customSoundVolumeValue) customSoundVolumeValue.textContent = `${Number(state.settings.customSoundVolume ?? 100)}%`;
  }

  function updateGlowSize() {
    const percent = Math.max(40, Math.min(200, Number(state.settings.glowSize ?? 100)));
    const glowScale = percent / 100;

    document.documentElement.style.setProperty("--lp-glow-scale", String(glowScale));

    const glowIntensity = 0.5 + (glowScale * 0.5);
    document.documentElement.style.setProperty("--lp-glow-intensity", String(glowIntensity));
  }

  function updateCssVars() {
    updateGlowSize();
    const palette = getActivePaletteColors();

    const uiAccent = state.settings.staticColors
      ? (state.settings.mapColor || "#ffd35a")
      : palette[0];
    const uiAccent2 = state.settings.staticColors
      ? (state.settings.lootColor || state.settings.mapColor || "#ff9f1c")
      : palette[1];

    state.settings.accent = uiAccent;
    state.settings.accent2 = uiAccent2;

    document.documentElement.style.setProperty("--lp-accent", uiAccent);
    document.documentElement.style.setProperty("--lp-accent2", uiAccent2);

    const setSeries = (prefix, colors) => {
      document.documentElement.style.setProperty(`--lp-${prefix}1`, colors[0]);
      document.documentElement.style.setProperty(`--lp-${prefix}2`, colors[1]);
      document.documentElement.style.setProperty(`--lp-${prefix}3`, colors[2]);
      document.documentElement.style.setProperty(`--lp-${prefix}4`, colors[3]);
    };

    if (!state.settings.staticColors && state.settings.animateColors) {
      setSeries("map", palette);
      setSeries("loot", palette);
      setSeries("item", palette);
    } else {
      setSeries("map", [state.settings.mapColor, state.settings.mapColor, state.settings.mapColor, state.settings.mapColor]);
      setSeries("loot", [state.settings.lootColor, state.settings.lootColor, state.settings.lootColor, state.settings.lootColor]);
      setSeries("item", [state.settings.itemColor, state.settings.itemColor, state.settings.itemColor, state.settings.itemColor]);
    }
  }

  function setPanel(visible) {
    state.panelVisible = visible;
    document.getElementById("lp-settings")?.classList.toggle("visible", visible);
  }

  function togglePanel() {
    setPanel(!state.panelVisible);
  }

  function restoreMiniWidgetPosition(button) {
    if (!button) return;

    const x = state.settings.widgetX;
    const y = state.settings.widgetY;

    const hasSavedPosition =
      typeof x === "number" &&
      Number.isFinite(x) &&
      typeof y === "number" &&
      Number.isFinite(y);

    if (!hasSavedPosition) return;

    const maxX = Math.max(0, window.innerWidth - button.offsetWidth);
    const maxY = Math.max(0, window.innerHeight - button.offsetHeight);

    const left = Math.max(0, Math.min(maxX, x));
    const top = Math.max(0, Math.min(maxY, y));

    button.style.left = `${Math.round(left)}px`;
    button.style.top = `${Math.round(top)}px`;
    button.style.right = "auto";
    button.style.bottom = "auto";
  }

  function makeMiniWidgetDraggable(button) {
    if (!button || button.dataset.lpMiniDragReady === "1") return;
    button.dataset.lpMiniDragReady = "1";

    let dragging = false;
    let moved = false;
    let startMouseX = 0;
    let startMouseY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onMouseMove = e => {
      if (!dragging) return;

      const dx = e.clientX - startMouseX;
      const dy = e.clientY - startMouseY;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        moved = true;
      }

      const maxX = Math.max(0, window.innerWidth - button.offsetWidth);
      const maxY = Math.max(0, window.innerHeight - button.offsetHeight);

      const left = Math.max(0, Math.min(maxX, startLeft + dx));
      const top = Math.max(0, Math.min(maxY, startTop + dy));

      button.style.left = `${Math.round(left)}px`;
      button.style.top = `${Math.round(top)}px`;
      button.style.right = "auto";
      button.style.bottom = "auto";
    };

    const onMouseUp = e => {
      if (!dragging) return;

      dragging = false;
      button.style.cursor = "grab";

      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("mouseup", onMouseUp, true);

      if (moved) {
        const rect = button.getBoundingClientRect();

        state.settings.widgetX = Math.round(rect.left);
        state.settings.widgetY = Math.round(rect.top);
        saveSettings();

        button.dataset.lpJustDragged = "1";

        setTimeout(() => {
          delete button.dataset.lpJustDragged;
        }, 100);
      }

      e.preventDefault();
      e.stopPropagation();
    };

    button.addEventListener("mousedown", e => {
      if (e.button !== 0) return;

      const rect = button.getBoundingClientRect();

      dragging = true;
      moved = false;
      startMouseX = e.clientX;
      startMouseY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;

      button.style.left = `${Math.round(rect.left)}px`;
      button.style.top = `${Math.round(rect.top)}px`;
      button.style.right = "auto";
      button.style.bottom = "auto";
      button.style.cursor = "grabbing";

      window.addEventListener("mousemove", onMouseMove, true);
      window.addEventListener("mouseup", onMouseUp, true);

      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  function makeDraggable(element, handle) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener("mousedown", e => {
      if (e.button !== 0) return;

      if (e.target.closest("button, input, select, textarea, a")) return;

      const rect = element.getBoundingClientRect();

      dragging = true;
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;

      element.style.left = `${Math.round(rect.left)}px`;
      element.style.top = `${Math.round(rect.top)}px`;
      element.style.right = "auto";

      e.preventDefault();
    });

    window.addEventListener("mousemove", e => {
      if (!dragging) return;
      const maxX = window.innerWidth - element.offsetWidth;
      const maxY = window.innerHeight - element.offsetHeight;
      element.style.left = `${Math.max(0, Math.min(maxX, e.clientX - offsetX))}px`;
      element.style.top = `${Math.max(0, Math.min(maxY, e.clientY - offsetY))}px`;
    });

    window.addEventListener("mouseup", () => {
      dragging = false;
    });
  }

  function isLegendary(item) {
    if (!item) return false;

    const stat = String(item.stat || "");
    if (stat.includes("rarity=legendary")) return true;

    return String(item._cachedStats?.rarity || "").toLowerCase() === "legendary";
  }

  function getItemKey(item) {
    return String(item.id ?? item.lootId ?? item.hid ?? `${item.name}-${item.stat}`);
  }

  function getLootItems() {
    try {
      const manager = pageWindow.Engine?.items;
      if (!manager?.fetchLocationItems) return [];

      const regularLoot = manager.fetchLocationItems("l") || [];
      const colossusLoot = manager.fetchLocationItems("k") || [];

      return [...regularLoot, ...colossusLoot];
    } catch (e) {
      console.warn("[Legendary Pulse] Nie udało się pobrać lootu:", e);
      return [];
    }
  }

  function scanLoot() {
    if (!state.settings.enabled) return;

    const items = getLootItems();
    const newLegendaries = [];

    for (const item of items) {
      const key = getItemKey(item);

      if (state.seen.has(key)) continue;
      state.seen.add(key);

      if (Date.now() - state.startedAt < 1200) continue;

      if (isLegendary(item)) {
        newLegendaries.push(item);
        notify(item, false, true);
      }
    }

    if (newLegendaries.length > 0 && state.settings.clanMessage) {
      void sendClanMessage(newLegendaries);
    }

    if (state.seen.size > 1500) {
      state.seen = new Set(Array.from(state.seen).slice(-700));
    }
  }

  function findExactLegendLootElement(item) {
    if (!item) return null;

    const ids = [
      item.lootId,
      item.id,
      item.itemId
    ]
      .filter(v => v !== undefined && v !== null && String(v).length > 0)
      .map(v => String(v));

    if (!ids.length) return null;

    const lootWindows = [...document.querySelectorAll(".loot-window")].filter(lootWindow => {
      const rect = lootWindow.getBoundingClientRect();
      const style = getComputedStyle(lootWindow);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });

    for (const lootWindow of lootWindows) {
      for (const id of ids) {
        const safe = window.CSS?.escape
          ? CSS.escape(id)
          : id.replace(/["\\]/g, "\\$&");

        const selectors = [
          `.loot-item-wrapper-${safe}`,
          `.loot-item[data-id="${safe}"]`,
          `.loot-item[data-item-id="${safe}"]`,
          `.loot-item[data-itemid="${safe}"]`,
          `[data-id="${safe}"].loot-item`,
          `[data-item-id="${safe}"].loot-item`,
          `[data-id="${safe}"].slot`,
          `[data-item-id="${safe}"].slot`
        ];

        for (const selector of selectors) {
          const found = lootWindow.querySelector(selector);
          if (!found) continue;

          return (
            found.closest(`[class*="loot-item-wrapper-"]`) ||
            found.closest(".loot-item") ||
            found
          );
        }

        const wrappers = lootWindow.querySelectorAll('[class*="loot-item-wrapper-"]');
        for (const wrapper of wrappers) {
          const className = String(wrapper.className || "");
          const match = className.match(/(?:^|\s)loot-item-wrapper-([^\s]+)(?:\s|$)/);
          if (match && match[1] === id) {
            return wrapper;
          }
        }
      }
    }

    return null;
  }

  function findLootWindowForLegend(item) {
    const element = findExactLegendLootElement(item);
    return element?.closest?.(".loot-window") || null;
  }

  function getLegendBurstTarget(item) {
    const wrapper = findExactLegendLootElement(item);
    if (!wrapper) return null;

    const visualElement =
      wrapper.querySelector(".slot .item img.icon") ||
      wrapper.querySelector(".slot .item img") ||
      wrapper.querySelector(".slot img") ||
      wrapper.querySelector(".item img") ||
      wrapper.querySelector(".slot .item") ||
      wrapper.querySelector(".slot");

    if (!visualElement) return null;

    const rect = visualElement.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;

    return {
      element: visualElement,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  function renderBurstAt(x, y) {
    document.querySelectorAll("#lp-burst-layer").forEach(el => el.remove());

    const layer = document.createElement("div");
    layer.id = "lp-burst-layer";
    layer.style.left = `${Math.round(x)}px`;
    layer.style.top = `${Math.round(y)}px`;

    const core = document.createElement("div");
    core.className = "lp-burst-core";

    const ring = document.createElement("div");
    ring.className = "lp-burst-ring";

    layer.append(core, ring);

    const colors = state.settings.animateColors
      ? getActivePaletteColors().slice(0, 3)
      : [
          state.settings.mapColor || "#ffd35a",
          state.settings.lootColor || "#ff9f1c",
          state.settings.itemColor || "#c544ff"
        ];

    const particleCount = 34;

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement("span");
      particle.className = "lp-burst-particle";

      const angle = (Math.PI * 2 * i / particleCount) + (Math.random() - .5) * .18;
      const distance = 95 + Math.random() * 165;
      const px = Math.cos(angle) * distance;
      const py = Math.sin(angle) * distance;
      const size = 3 + Math.random() * 6;
      const duration = 760 + Math.random() * 520;
      const delay = Math.random() * 90;
      const colorIndex = i % 3;
      const nextColorIndex = (colorIndex + 1) % 3;

      particle.style.setProperty("--lp-particle-x", `${px.toFixed(1)}px`);
      particle.style.setProperty("--lp-particle-y", `${py.toFixed(1)}px`);
      particle.style.setProperty("--lp-particle-size", `${size.toFixed(1)}px`);
      particle.style.setProperty("--lp-particle-duration", `${Math.round(duration)}ms`);
      particle.style.setProperty("--lp-particle-delay", `${Math.round(delay)}ms`);
      particle.style.setProperty("--lp-particle-color", colors[colorIndex]);
      particle.style.setProperty("--lp-particle-color2", colors[nextColorIndex]);

      layer.appendChild(particle);
    }

    document.body.appendChild(layer);

    window.setTimeout(() => {
      layer.remove();
    }, 1550);
  }

  function playBurstAnimation(item) {
    if (!state.settings.burstAnimation) return;

    const startedAt = performance.now();

    const tryPlaceBurst = () => {
      if (!state.settings.burstAnimation) return;

      const target = getLegendBurstTarget(item);

      if (target) {
        requestAnimationFrame(() => {
          const freshTarget = getLegendBurstTarget(item);
          if (!freshTarget) return;
          renderBurstAt(freshTarget.x, freshTarget.y);
        });
        return;
      }

      if (performance.now() - startedAt < 2000) {
        window.setTimeout(tryPlaceBurst, 40);
      } else {
        console.warn("[Legendary Pulse] Nie znaleziono pozycji legendy dla animacji:", item);
      }
    };

    tryPlaceBurst();
  }

  function playLegendLightning(item) {
    if (!state.settings.legendaryLightning) return;

    const startedAt = performance.now();

    const tryPlaceLightning = () => {
      if (!state.settings.legendaryLightning) return;

      const target = getLegendBurstTarget(item);

      if (target) {
        requestAnimationFrame(() => {
          const freshTarget = getLegendBurstTarget(item);
          if (!freshTarget) return;

          const rect = getGameAreaRect();
          if (!rect || rect.width < 80 || rect.height < 80) return;

          document.getElementById("lp-legend-lightning")?.remove();

          const layer = document.createElement("div");
          layer.id = "lp-legend-lightning";
          layer.style.left = `${Math.round(rect.left)}px`;
          layer.style.top = `${Math.round(rect.top)}px`;
          layer.style.width = `${Math.round(rect.width)}px`;
          layer.style.height = `${Math.round(rect.height)}px`;

          const w = Math.max(1, rect.width);
          const h = Math.max(1, rect.height);
          const tx = freshTarget.x - rect.left;
          const ty = freshTarget.y - rect.top;

          const bolts = [];
          const branches = [];

          const p = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;

          const starts = [
            [Math.max(8, tx - w * (.25 + Math.random() * .22)), 0],
            [Math.min(w - 8, tx + w * (.22 + Math.random() * .24)), 0],
            [0, Math.max(8, ty - h * (.10 + Math.random() * .24))],
            [w, Math.min(h - 8, ty + h * (.05 + Math.random() * .24))],

            [Math.max(8, tx - w * (.18 + Math.random() * .20)), h],
            [Math.min(w - 8, tx + w * (.18 + Math.random() * .20)), h]
          ];

          starts.forEach(([sx, sy], boltIndex) => {
            const distance = Math.hypot(tx - sx, ty - sy);
            const segments = Math.max(12, Math.min(22, Math.round(distance / 42)));
            const dirX = (tx - sx) / Math.max(1, distance);
            const dirY = (ty - sy) / Math.max(1, distance);
            const normalX = -dirY;
            const normalY = dirX;

            let d = `M ${p(sx, sy)}`;
            let prevX = sx;
            let prevY = sy;
            let zigSign = Math.random() < .5 ? -1 : 1;

            for (let i = 1; i <= segments; i++) {
              const t = i / segments;
              const baseX = sx + (tx - sx) * t;
              const baseY = sy + (ty - sy) * t;

              const envelope = Math.sin(Math.PI * t) * (1 - t * .28);
              const major = (11 + Math.random() * 21) * envelope * zigSign;
              const minor = (Math.random() - .5) * 8 * envelope;

              let x = baseX + normalX * (major + minor) + dirX * ((Math.random() - .5) * 7);
              let y = baseY + normalY * (major + minor) + dirY * ((Math.random() - .5) * 7);

              if (i === segments) {
                x = tx;
                y = ty;
              }

              d += ` L ${p(x, y)}`;

              if (i > 1 && i < segments - 2 && Math.random() < .42) {
                const localDx = x - prevX;
                const localDy = y - prevY;
                const localLen = Math.hypot(localDx, localDy) || 1;
                const lx = localDx / localLen;
                const ly = localDy / localLen;
                const lnx = -ly;
                const lny = lx;
                const side = Math.random() < .5 ? -1 : 1;
                const branchLen = 20 + Math.random() * 55;

                const midX = x + lx * branchLen * .38 + lnx * branchLen * side * (.22 + Math.random() * .28);
                const midY = y + ly * branchLen * .38 + lny * branchLen * side * (.22 + Math.random() * .28);
                const bx = x + lx * branchLen * .72 + lnx * branchLen * side * (.45 + Math.random() * .38);
                const by = y + ly * branchLen * .72 + lny * branchLen * side * (.45 + Math.random() * .38);

                branches.push(`M ${p(x, y)} L ${p(midX, midY)} L ${p(bx, by)}`);

                if (Math.random() < .38) {
                  const forkSide = -side;
                  const fx = midX + lx * branchLen * .32 + lnx * branchLen * forkSide * (.22 + Math.random() * .25);
                  const fy = midY + ly * branchLen * .32 + lny * branchLen * forkSide * (.22 + Math.random() * .25);
                  branches.push(`M ${p(midX, midY)} L ${p(fx, fy)}`);
                }
              }

              prevX = x;
              prevY = y;
              zigSign *= -1;
              if (Math.random() < .20) zigSign *= -1;
            }

            bolts.push(d);
          });

          const main = bolts.map(d => `<path d="${d}"/>`).join("");
          const branchMarkup = branches.map(d => `<path d="${d}"/>`).join("");

          layer.innerHTML = `
            <svg viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}" preserveAspectRatio="none" aria-hidden="true">
              <g class="lp-bolt-shadow">${main}</g>
              <g class="lp-bolt-color">${main}</g>
              <g class="lp-bolt-main">${main}</g>
              <g class="lp-bolt-branch">${branchMarkup}</g>
            </svg>
            <div class="lp-lightning-impact" style="left:${tx.toFixed(1)}px;top:${ty.toFixed(1)}px;"></div>
          `;

          document.body.appendChild(layer);
          void layer.offsetWidth;
          layer.classList.add("active");

          window.setTimeout(() => layer.remove(), 850);
        });
        return;
      }

      if (performance.now() - startedAt < 2000) {
        window.setTimeout(tryPlaceLightning, 40);
      } else {
        console.warn("[Legendary Pulse] Nie znaleziono pozycji legendy dla błyskawic:", item);
      }
    };

    tryPlaceLightning();
  }

  function playScreenCrack(item) {
    if (!state.settings.screenCrack) return;

    const startedAt = performance.now();

    const tryPlaceCrack = () => {
      if (!state.settings.screenCrack) return;

      const target = getLegendBurstTarget(item);

      if (target) {
        requestAnimationFrame(() => {
          const freshTarget = getLegendBurstTarget(item);
          if (!freshTarget) return;

          document.getElementById("lp-screen-crack")?.remove();

          const layer = document.createElement("div");
          layer.id = "lp-screen-crack";
          layer.style.left = "0px";
          layer.style.top = "0px";
          layer.style.width = `${Math.round(window.innerWidth)}px`;
          layer.style.height = `${Math.round(window.innerHeight)}px`;

          const w = Math.max(1, window.innerWidth);
          const h = Math.max(1, window.innerHeight);

          const cx = freshTarget.x;
          const cy = freshTarget.y;
          const maxRadius = Math.min(w, h) * 0.47;

          const paths = [];
          const finePaths = [];
          const branches = 11;
          const point = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;

          for (let i = 0; i < branches; i++) {
            const baseAngle = (Math.PI * 2 * i / branches) + (Math.random() - .5) * .28;
            const steps = 5 + Math.floor(Math.random() * 3);
            const reach = maxRadius * (0.62 + Math.random() * 0.48);

            let x = cx;
            let y = cy;
            let d = `M ${point(x, y)}`;

            for (let s = 1; s <= steps; s++) {
              const t = s / steps;
              const angle = baseAngle + (Math.random() - .5) * .25;
              const r = reach * t;
              x = cx + Math.cos(angle) * r + (Math.random() - .5) * 12;
              y = cy + Math.sin(angle) * r + (Math.random() - .5) * 12;
              d += ` L ${point(x, y)}`;

              if (s >= 2 && s < steps && Math.random() < .72) {
                const side = Math.random() < .5 ? -1 : 1;
                const sideAngle = angle + side * (.45 + Math.random() * .48);
                const sideLen = 20 + Math.random() * 58;
                const bx = x + Math.cos(sideAngle) * sideLen;
                const by = y + Math.sin(sideAngle) * sideLen;

                finePaths.push(
                  `M ${point(x, y)} L ${point(
                    x + Math.cos(sideAngle) * sideLen * .48 + (Math.random() - .5) * 5,
                    y + Math.sin(sideAngle) * sideLen * .48 + (Math.random() - .5) * 5
                  )} L ${point(bx, by)}`
                );
              }
            }

            paths.push(d);
          }

          for (let ring = 0; ring < 3; ring++) {
            const radius = 14 + ring * 15 + Math.random() * 5;
            let d = "";
            const segments = 12;

            for (let i = 0; i <= segments; i++) {
              const a = Math.PI * 2 * i / segments;
              const rr = radius * (.78 + Math.random() * .34);
              const x = cx + Math.cos(a) * rr;
              const y = cy + Math.sin(a) * rr;
              d += `${i === 0 ? "M" : " L"} ${point(x, y)}`;
            }

            finePaths.push(d);
          }

          const mainMarkup = paths.map(d => `<path d="${d}"/>`).join("");
          const fineMarkup = finePaths.map(d => `<path d="${d}"/>`).join("");

          layer.innerHTML = `
            <svg viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}" preserveAspectRatio="none" aria-hidden="true">
              <g class="lp-crack-shadow">${mainMarkup}</g>
              <g class="lp-crack-main">${mainMarkup}</g>
              <g class="lp-crack-fine">${fineMarkup}</g>
              <circle class="lp-crack-impact" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5"/>
            </svg>
          `;

          document.body.appendChild(layer);
          void layer.offsetWidth;
          layer.classList.add("active");

          window.setTimeout(() => layer.remove(), 1000);
        });

        return;
      }

      if (performance.now() - startedAt < 2000) {
        window.setTimeout(tryPlaceCrack, 40);
      } else {
        console.warn("[Legendary Pulse] Nie znaleziono pozycji legendy dla pęknięcia:", item);
      }
    };

    tryPlaceCrack();
  }

  function playScreenShake() {
    if (!state.settings.screenShake) return;

    const target =
      document.querySelector(".game-window-positioner") ||
      document.querySelector("#GAME_CANVAS") ||
      document.querySelector("canvas");

    if (!target) return;

    const oldAnimation = target.style.animation;
    const oldWillChange = target.style.willChange;

    const shakeStrength = Math.max(10, Math.min(200, Number(state.settings.screenShakeStrength ?? 100))) / 100;
    target.style.setProperty("--lp-shake-strength", String(shakeStrength));

    target.style.animation = "none";
    void target.offsetWidth;
    target.style.willChange = "transform";
    target.style.animation = "lp-screen-shake 420ms ease-out 1";

    setTimeout(() => {
      target.style.animation = oldAnimation;
      target.style.willChange = oldWillChange;
    }, 450);
  }

  function notify(item, testMode, suppressClanMessage = false) {
    playScreenShake();
    playScreenCrack(item);
    playLegendLightning(item);
    state.lastDetectedAt = Date.now();

    if (testMode) {
      startLootTimedEffects(item);
    } else {
      startLootTimedEffects(item);
    }

    if (state.settings.burstAnimation) {
      playBurstAnimation(item);
    }

    if (state.settings.sound) {
      playLegendSound();
    }

    if (state.settings.centerMessage) {
      sendCenterMessage(item);
    }

    if (state.settings.clanMessage) {
      if (testMode) {
        sendClanTestMessage(item?.name || "Testowy przedmiot legendarny");
      } else if (!suppressClanMessage) {
        void sendClanMessage([item]);
      }
    }

    console.info("[Legendary Pulse] Wykryto legendę:", item);
  }

  function getGameAreaRect() {
    let expected = null;

    try {
      if (typeof pageWindow.Engine?.getCanvasViewSize === "function") {
        expected = pageWindow.Engine.getCanvasViewSize();
      }
    } catch {}

    const canvases = [...document.querySelectorAll("canvas")]
      .map(canvas => ({ canvas, rect: canvas.getBoundingClientRect() }))
      .filter(({ rect }) =>
        rect.width >= 300 &&
        rect.height >= 250 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth
      );

    if (canvases.length) {
      let best = null;
      let bestScore = Infinity;

      for (const entry of canvases) {
        const { canvas, rect } = entry;

        let score = 0;

        if (expected?.width && expected?.height) {
          score += Math.abs(rect.width - expected.width);
          score += Math.abs(rect.height - expected.height);
        } else {
          score -= rect.width * rect.height / 10000;
        }

        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        score += Math.abs(cx - window.innerWidth / 2) * 0.08;
        score += Math.abs(cy - window.innerHeight / 2) * 0.08;

        if (canvas.width < 300 || canvas.height < 250) score += 10000;

        if (score < bestScore) {
          bestScore = score;
          best = rect;
        }
      }

      if (best) return best;
    }

    const positioner = document.querySelector(".game-window-positioner");
    if (positioner) {
      const rect = positioner.getBoundingClientRect();
      if (rect.width >= 300 && rect.height >= 250) return rect;
    }

    return null;
  }

  function positionFlashToGameArea() {
    const flash = document.getElementById("lp-screen-flash");
    if (!flash) return false;

    const gameLayer = document.querySelector(".game-layer");
    if (!gameLayer) return false;

    if (flash.parentElement !== gameLayer) {
      gameLayer.appendChild(flash);
    }

    flash.classList.add("map-overlay");
    flash.style.removeProperty("position");
    flash.style.removeProperty("left");
    flash.style.removeProperty("top");
    flash.style.removeProperty("right");
    flash.style.removeProperty("bottom");
    flash.style.removeProperty("width");
    flash.style.removeProperty("height");
    flash.style.setProperty("z-index", "11");
    flash.style.setProperty("display", "block");
    flash.style.setProperty("background", "transparent");
    flash.style.setProperty("pointer-events", "none");

    return true;
  }

  function findLootWindow() {
    const candidates = [...document.querySelectorAll(".loot-window")];

    for (const loot of candidates) {
      const rect = loot.getBoundingClientRect();
      const style = getComputedStyle(loot);

      if (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      ) {
        return loot;
      }
    }

    return null;
  }

  function parseLootRemainingMs(lootWindow) {
    if (!lootWindow) return null;

    const text = String(lootWindow.innerText || lootWindow.textContent || "")
      .replace(/\s+/g, " ")
      .trim();

    const mmss = [...text.matchAll(/(?:^|\s)(\d{1,2}):(\d{2})(?:\s|$)/g)]
      .map(match => {
        const minutes = Number(match[1]);
        const seconds = Number(match[2]);
        return (minutes * 60 + seconds) * 1000;
      })
      .filter(ms => ms >= 0 && ms <= 5 * 60 * 1000);

    if (mmss.length) {
      return Math.min(...mmss);
    }

    const secondValues = [...text.matchAll(/(?:^|\s)(\d{1,3})\s*(?:s|sek\.?|sekund(?:y|a|ę)?)(?:\s|$)/gi)]
      .map(match => Number(match[1]) * 1000)
      .filter(ms => ms >= 0 && ms <= 5 * 60 * 1000);

    if (secondValues.length) {
      return Math.min(...secondValues);
    }

    const timedElements = [...lootWindow.querySelectorAll(
      "[data-time], [data-time-left], [data-seconds], [aria-valuenow]"
    )];

    for (const el of timedElements) {
      for (const value of [
        el.getAttribute("data-time-left"),
        el.getAttribute("data-seconds"),
        el.getAttribute("data-time"),
        el.getAttribute("aria-valuenow")
      ]) {
        if (value == null) continue;

        const number = Number(String(value).replace(",", "."));
        if (!Number.isFinite(number) || number <= 0) continue;

        if (number <= 300) return number * 1000;
        if (number <= 300000) return number;
      }
    }

    return null;
  }

  function getLootBorderWindow(lootWindow) {
    if (!lootWindow) return null;
    return lootWindow.closest(".border-window") || lootWindow.parentElement;
  }

  function showLootWindowGlow(lootWindow) {
    const borderWindow = getLootBorderWindow(lootWindow);
    if (!borderWindow) return;

    borderWindow.style.setProperty("z-index", "2147483636", "important");
    borderWindow.classList.add("lp-loot-window-glow");
  }

  function hideLootWindowGlow() {
    document.querySelectorAll(".lp-loot-window-glow").forEach(element => {
      element.classList.remove("lp-loot-window-glow");
      element.style.removeProperty("animation");
      element.style.removeProperty("animation-delay");
      element.style.removeProperty("filter");
      element.style.removeProperty("box-shadow");
    });
  }

  function stopLootTimedEffects() {
    if (state.lootEffectTimer) {
      clearInterval(state.lootEffectTimer);
      state.lootEffectTimer = null;
    }

    state.lootEffectDeadline = 0;
    state.__animationsSynced = false;
    window.__lpCurrentLegendItem = null;

    const flash = document.getElementById("lp-screen-flash");
    if (flash) {
      flash.classList.remove("active");
      flash.style.removeProperty("animation");
      flash.style.removeProperty("animation-delay");
    }

    document.querySelectorAll(".lp-loot-window-glow").forEach(element => {
      element.classList.remove("lp-loot-window-glow");
      element.style.removeProperty("animation");
      element.style.removeProperty("animation-delay");
      element.style.removeProperty("filter");
      element.style.removeProperty("box-shadow");
    });

    for (const element of state.activeGlowElements) {
      if (!element) continue;

      element.classList.remove("lp-loot-glow");
      element.style.removeProperty("animation");
      element.style.removeProperty("animation-delay");
      element.style.removeProperty("filter");
      element.style.removeProperty("box-shadow");

      const slot = element.querySelector?.(".slot");
      if (slot) {
        slot.style.removeProperty("animation");
        slot.style.removeProperty("animation-delay");
        slot.style.removeProperty("filter");
        slot.style.removeProperty("box-shadow");
      }
    }

    state.activeGlowElements.clear();
  }

  function restartLegendAnimationsTogether() {
    const flash = document.getElementById("lp-screen-flash");
    const currentItem = window.__lpCurrentLegendItem || {};
    const itemElement = findExactLegendLootElement(currentItem);
    const lootWindow = itemElement?.closest?.(".loot-window") || null;
    const borderWindow = getLootBorderWindow(lootWindow);
    const slot = itemElement?.querySelector?.(".slot");

    const animated = [flash, borderWindow, itemElement, slot].filter(Boolean);

    for (const element of animated) {
      element.style.animation = "none";
    }

    void document.body.offsetWidth;

    if (flash?.classList.contains("active")) {
      flash.style.animation = "lp-screen-pulse 3.0s linear infinite";
    }

    if (borderWindow?.classList.contains("lp-loot-window-glow")) {
      borderWindow.style.animation = "lp-loot-window-pulse 3.0s linear infinite";
    }

    if (itemElement?.classList.contains("lp-loot-glow")) {
      itemElement.style.animation = "lp-item-pulse 3.0s linear infinite";
    }

    if (slot && itemElement?.classList.contains("lp-loot-glow")) {
      slot.style.animation = "lp-item-slot-pulse 3.0s linear infinite";
    }
  }

  function initLootWindowActionWatcher() {
    if (window.__lpLootActionWatcherInstalled) return;
    window.__lpLootActionWatcherInstalled = true;

    const handleLootAction = event => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const action = target.closest(".accept-button .button, .accept-button, .close-button");
      if (!action) return;

      const borderWindow = action.closest(".border-window");
      if (!borderWindow || !borderWindow.querySelector(".loot-window")) return;

      stopLootTimedEffects();
    };

    document.addEventListener("mousedown", handleLootAction, true);
    document.addEventListener("click", handleLootAction, true);
  }

  function startLootTimedEffects(item) {
    stopLootTimedEffects();
    window.__lpCurrentLegendItem = item;

    const startedAt = Date.now();
    let legendWasVisible = false;
    let missingTicks = 0;

    const update = () => {
      const testItem = String(item?.id ?? item?.lootId ?? "").startsWith("lp-test-");
      const itemIds = [item?.id, item?.lootId, item?.itemId].filter(v => v !== undefined && v !== null).map(String);
      const liveLegend = testItem ? item : getLootItems().find(candidate => {
        if (!isLegendary(candidate)) return false;
        const candidateIds = [candidate?.id, candidate?.lootId, candidate?.itemId].filter(v => v !== undefined && v !== null).map(String);
        return itemIds.some(id => candidateIds.includes(id));
      });

      if (!liveLegend) {
        stopLootTimedEffects();
        return;
      }

      const legendElement = findExactLegendLootElement(item);
      const lootWindow = legendElement?.closest?.(".loot-window") || null;

      if (lootWindow && legendElement) {
        legendWasVisible = true;
        missingTicks = 0;

        const acceptControl = lootWindow.querySelector(".accept-button .button, .accept-button");
        if (!acceptControl) {
          stopLootTimedEffects();
          return;
        }

        if (state.settings.screenFlash) {
          const flash = document.getElementById("lp-screen-flash");

          if (flash && positionFlashToGameArea()) {
            flash.classList.add("active");
          }
        }

        hideLootWindowGlow();
        showLootWindowGlow(lootWindow);

        if (state.settings.itemGlow) {
          for (const element of state.activeGlowElements) {
            if (element !== legendElement) {
              element.classList.remove("lp-loot-glow");
              element.style.removeProperty("animation");
              element.style.removeProperty("animation-delay");
              element.style.removeProperty("filter");
              element.style.removeProperty("box-shadow");
            }
          }
          state.activeGlowElements.clear();
          legendElement.classList.add("lp-loot-glow");
          state.activeGlowElements.add(legendElement);
        }

        if (!state.__animationsSynced) {
          state.__animationsSynced = true;
          requestAnimationFrame(() => restartLegendAnimationsTogether());
        }

        return;
      }

      missingTicks++;
      hideLootWindowGlow();

      if (!legendWasVisible && Date.now() - startedAt < 2000) {
        return;
      }

      if (legendWasVisible ? missingTicks >= 2 : missingTicks >= 10) {
        stopLootTimedEffects();
      }
    };

    update();
    state.lootEffectTimer = setInterval(update, 100);
  }

  function flashScreenFor(durationMs) {
    const flash = document.getElementById("lp-screen-flash");
    if (!flash || !positionFlashToGameArea()) return;

    flash.classList.remove("active");
    void flash.offsetWidth;
    flash.classList.add("active");

    setTimeout(() => {
      flash.classList.remove("active");
    }, durationMs);
  }

  function findLootItemElement(item) {
    const possibleIds = [
      item.lootId,
      item.id
    ].filter(v => v !== undefined && v !== null);

    let element = null;

    for (const id of possibleIds) {
      element =
        document.querySelector(`.loot-item-wrapper-${CSS.escape(String(id))}`) ||
        document.querySelector(`.loot-window [loot-id="${CSS.escape(String(id))}"]`) ||
        document.querySelector(`.loot-window [data-id="${CSS.escape(String(id))}"]`) ||
        document.querySelector(`[data-id="${CSS.escape(String(id))}"]`);

      if (element) break;
    }

    if (!element && item.name) {
      const candidates = document.querySelectorAll(
        ".loot-window .loot-item-wrapper, .loot-window [title], .loot-window [data-name]"
      );

      element = [...candidates].find(el => {
        const haystack = [
          el.getAttribute("title"),
          el.getAttribute("data-name"),
          el.textContent
        ].filter(Boolean).join(" ");

        return haystack.includes(item.name);
      });
    }

    return element;
  }

  function glowLootItemPersistent(item) {
    const element = findLootItemElement(item);
    if (!element) return;

    element.classList.add("lp-loot-glow");
    state.activeGlowElements.add(element);
  }

  function glowLootItemFor(item, durationMs) {
    const element = findLootItemElement(item);
    if (!element) return;

    element.classList.add("lp-loot-glow");

    setTimeout(() => {
      element?.classList.remove("lp-loot-glow");
    }, durationMs);
  }

  function removeTestLootWindow() {
    if (state.testLootTimer) {
      clearInterval(state.testLootTimer);
      state.testLootTimer = null;
    }

    document.getElementById("lp-loot-window-mock")?.remove();
  }

  function centerMargonemTestLootWindow(element) {
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const left = Math.max(0, (window.innerWidth - rect.width) / 2);
    const top = Math.max(0, (window.innerHeight - rect.height) / 2);

    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
  }

  function createMargonemLootWindowMock(item, durationSeconds) {
    removeTestLootWindow();

    const wrapper = document.createElement("div");
    wrapper.id = "lp-loot-window-mock";
    wrapper.style.setProperty("z-index", "2147483636", "important");
    wrapper.className = "border-window ui-draggable loot-wnd no-exit-button window-on-peak";
    wrapper.style.position = "absolute";
    wrapper.style.display = "block";
    wrapper.style.setProperty("z-index", "2147483636", "important");

    wrapper.innerHTML = `
      <div class="header-label-positioner ui-draggable-handle">
        <div class="header-label">
          <div class="left-decor"></div>
          <div class="right-decor"></div>
          <div class="text" name="Łupy">Łupy</div>
        </div>
      </div>

      <div class="content">
        <div class="inner-content">
          <div class="loot-window">
            <div class="middle-graphics interface-element-middle-1-background"></div>

            <div class="items-wrapper">
              <div
                class="loot-item-wrapper interface-element-background-color-1 loot-item-wrapper-lp-test-legendary-bag cant-must"
                data-state="want"
                loot-id="lp-test-legendary-bag"
              >
                <div class="slot interface-element-one-item-slot">
                  <div
                    class="item"
                    data-tip-type="t_item"
                    data-item-type="t-leg"
                    title="${esc(item.name)}"
                  >
                    <div class="highlight t-leg h-exist"></div>
                    <img
                      src="https://micc.garmory-cdn.cloud/obrazki/itemy//que/wladcy_krysz01.gif"
                      class="icon canvas-icon"
                      width="32"
                      height="32"
                      alt="${esc(item.name)}"
                    >
                  </div>
                </div>

                <div class="text-info interface-element-table-header-1-background">
                  Nie chcę
                </div>

                <div class="button-holder" style="display:flex;justify-content:space-between;">
                  <div class="button want no-hover red">
                    <div class="background"></div>
                    <div class="label want"></div>
                  </div>

                  <div class="button not no-hover green">
                    <div class="background"></div>
                    <div class="label not"></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="col button-wrapper"></div>

            <div class="bottom-wrapper">
              <div class="interface-element-bottom-bar-background-stretch"></div>

              <div class="table-wrapper">
                <div class="time-left">
                  <span id="lp-test-loot-time">${durationSeconds} s</span>
                </div>

                <div id="lp-test-accept-loot" class="accept-button">
                  <div class="button green small">
                    <div class="background"></div>
                    <div class="label">Potwierdź</div>
                  </div>
                </div>

                <div class="bag-left">
                  <span>10 m</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="window-controlls"></div>
      </div>

      <div class="close-button-corner-decor">
        <button type="button" class="close-button"></button>
      </div>
    `;

    document.body.appendChild(wrapper);

    requestAnimationFrame(() => {
      if (!wrapper.dataset.lpMoved) centerMargonemTestLootWindow(wrapper);
    });

    const TEST_LOOT_POSITION_KEY = "legendaryPulse.testLootPosition.v1";
    const dragHandle = wrapper.querySelector(".header-label-positioner");

    try {
      const savedPosition = JSON.parse(localStorage.getItem(TEST_LOOT_POSITION_KEY) || "null");
      if (savedPosition && Number.isFinite(savedPosition.left) && Number.isFinite(savedPosition.top)) {
        requestAnimationFrame(() => {
          const rect = wrapper.getBoundingClientRect();
          const left = Math.max(0, Math.min(window.innerWidth - rect.width, savedPosition.left));
          const top = Math.max(0, Math.min(window.innerHeight - rect.height, savedPosition.top));

          wrapper.dataset.lpMoved = "1";
          wrapper.style.setProperty("position", "fixed", "important");
          wrapper.style.setProperty("left", `${Math.round(left)}px`, "important");
          wrapper.style.setProperty("top", `${Math.round(top)}px`, "important");
          wrapper.style.setProperty("right", "auto", "important");
          wrapper.style.setProperty("bottom", "auto", "important");
          wrapper.style.setProperty("margin", "0", "important");
          wrapper.style.setProperty("transform", "none", "important");
        });
      }
    } catch {}

    let dragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let dragWidth = 0;
    let dragHeight = 0;

    const onDragMove = (event) => {
      if (!dragging) return;

      const left = Math.max(0, Math.min(window.innerWidth - dragWidth, event.clientX - dragOffsetX));
      const top = Math.max(0, Math.min(window.innerHeight - dragHeight, event.clientY - dragOffsetY));

      wrapper.style.setProperty("left", `${Math.round(left)}px`, "important");
      wrapper.style.setProperty("top", `${Math.round(top)}px`, "important");
      wrapper.style.setProperty("right", "auto", "important");
      wrapper.style.setProperty("bottom", "auto", "important");
      wrapper.style.setProperty("margin", "0", "important");
      wrapper.style.setProperty("transform", "none", "important");

      event.preventDefault();
      event.stopPropagation();
    };

    const onDragEnd = (event) => {
      if (!dragging) return;
      dragging = false;

      try {
        const rect = wrapper.getBoundingClientRect();
        localStorage.setItem(TEST_LOOT_POSITION_KEY, JSON.stringify({
          left: Math.round(rect.left),
          top: Math.round(rect.top)
        }));
      } catch {}

      document.removeEventListener("mousemove", onDragMove, true);
      document.removeEventListener("mouseup", onDragEnd, true);
      event?.preventDefault();
      event?.stopPropagation();
    };

    dragHandle?.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;

      const rect = wrapper.getBoundingClientRect();
      dragWidth = rect.width;
      dragHeight = rect.height;
      dragOffsetX = event.clientX - rect.left;
      dragOffsetY = event.clientY - rect.top;
      dragging = true;
      wrapper.dataset.lpMoved = "1";

      wrapper.style.setProperty("position", "fixed", "important");
      wrapper.style.setProperty("left", `${Math.round(rect.left)}px`, "important");
      wrapper.style.setProperty("top", `${Math.round(rect.top)}px`, "important");
      wrapper.style.setProperty("right", "auto", "important");
      wrapper.style.setProperty("bottom", "auto", "important");
      wrapper.style.setProperty("margin", "0", "important");
      wrapper.style.setProperty("transform", "none", "important");

      document.addEventListener("mousemove", onDragMove, true);
      document.addEventListener("mouseup", onDragEnd, true);

      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);

    const close = () => {
      try {
        const rect = wrapper.getBoundingClientRect();
        localStorage.setItem(TEST_LOOT_POSITION_KEY, JSON.stringify({
          left: Math.round(rect.left),
          top: Math.round(rect.top)
        }));
      } catch {}

      removeTestLootWindow();
      stopLootTimedEffects();
    };

    wrapper.querySelector("#lp-test-accept-loot")?.addEventListener("click", close);
    wrapper.querySelector(".close-button")?.addEventListener("click", close);

    return wrapper;
  }

  function runLootWindowTest() {
    const durationSeconds = 15;

    const item = {
      id: "lp-test-legendary-bag",
      lootId: "lp-test-legendary-bag",
      hid: 0,
      name: "Testowy przedmiot legendarny",
      stat: "rarity=legendary;lvl=300",
      loc: "l"
    };

    const windowElement = createMargonemLootWindowMock(item, durationSeconds);
    const timeElement = windowElement?.querySelector("#lp-test-loot-time");

    const endAt = Date.now() + durationSeconds * 1000;

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));

      if (timeElement) {
        timeElement.textContent = `${remaining} s`;
      }

      if (remaining <= 0) {
        removeTestLootWindow();
        stopLootTimedEffects();
      }
    };

    updateCountdown();
    state.testLootTimer = setInterval(updateCountdown, 250);

    notify(item, true);
  }

  function normalizeCustomSoundSource(value) {
    const source = String(value || "").trim();
    if (!source) return "";

    if (/^(https?:|data:|blob:)/i.test(source)) {
      return source;
    }

    try {
      return new URL(source, window.location.href).href;
    } catch {
      return source;
    }
  }

  function stopCurrentLegendSound() {
    if (state.currentSoundAudio) {
      try {
        state.currentSoundAudio.pause();
        state.currentSoundAudio.currentTime = 0;
      } catch {}

      state.currentSoundAudio = null;
      state.currentSoundSource = "";
    }

    if (state.currentSoundContext) {
      try {
        state.currentSoundContext.close();
      } catch {}

      state.currentSoundContext = null;
    }
  }

  function playLegendSound(forceTest = false) {
    if (!forceTest && !state.settings.sound) return;

    stopCurrentLegendSound();

    const customSource = normalizeCustomSoundSource(state.settings.customSound);

    if (customSource) {
      try {
        const audio = new Audio(customSource);
        audio.preload = "auto";
        audio.volume = Math.max(
          0,
          Math.min(1, Number(state.settings.customSoundVolume ?? 100) / 100)
        );

        state.currentSoundAudio = audio;
        state.currentSoundSource = customSource;

        const cleanup = () => {
          if (state.currentSoundAudio === audio) {
            state.currentSoundAudio = null;
            state.currentSoundSource = "";
          }
        };

        audio.addEventListener("ended", cleanup, { once: true });
        audio.addEventListener("error", cleanup, { once: true });

        audio.currentTime = 0;
        const promise = audio.play();

        if (promise?.catch) {
          promise.catch(error => {
            cleanup();
            console.warn(
              "[Legendary Pulse] Nie udało się odtworzyć własnego dźwięku:",
              error
            );
          });
        }

        return;
      } catch (error) {
        console.warn(
          "[Legendary Pulse] Błąd własnego dźwięku, używam domyślnego:",
          error
        );
      }
    }

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      state.currentSoundContext = ctx;

      const now = ctx.currentTime;

      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(660, now);
      osc1.frequency.exponentialRampToValueAtTime(990, now + 0.45);
      osc1.connect(gain);

      const osc2 = ctx.createOscillator();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(880, now + 0.08);
      osc2.frequency.exponentialRampToValueAtTime(1320, now + 0.55);
      osc2.connect(gain);

      osc1.start(now);
      osc2.start(now + 0.08);
      osc1.stop(now + 0.9);
      osc2.stop(now + 0.9);

      setTimeout(() => {
        if (state.currentSoundContext === ctx) {
          try { ctx.close(); } catch {}
          state.currentSoundContext = null;
        }
      }, 1200);
    } catch (error) {
      state.currentSoundContext = null;
      console.warn("[Legendary Pulse] Nie udało się odtworzyć dźwięku:", error);
    }
  }

  function sendCenterMessage(item) {
    const name = item?.name || "Legenda";
    const text = `[color=#f2b84b]✦ LEGENDA![/color][br][color=#ffffff]${name}[/color]`;

    try {
      if (typeof pageWindow.message === "function") {
        pageWindow.message(text);
        return true;
      }

      if (typeof pageWindow.Engine?.message === "function") {
        pageWindow.Engine.message(text);
        return true;
      }

      console.warn("[Legendary Pulse] Brak funkcji wiadomości ekranowej Margonem.");
      return false;
    } catch (e) {
      console.warn("[Legendary Pulse] Nie udało się wyświetlić wiadomości:", e);
      return false;
    }
  }

  function findFreshLootItem(original) {
    const ids = [
      original?.id,
      original?.lootId,
      original?.itemId
    ]
      .filter(v => v !== undefined && v !== null)
      .map(v => String(v));

    if (typeof pageWindow.Engine?.items?.getItemById === "function") {
      for (const id of ids) {
        try {
          const found = pageWindow.Engine.items.getItemById(id) ||
                        pageWindow.Engine.items.getItemById(Number(id));
          if (found?.hid) return found;
        } catch {}
      }
    }

    const freshItems = getLootItems();

    for (const fresh of freshItems) {
      if (!fresh) continue;

      if (fresh.hid && original?.hid && String(fresh.hid) === String(original.hid)) {
        return fresh;
      }

      const freshIds = [fresh.id, fresh.lootId, fresh.itemId]
        .filter(v => v !== undefined && v !== null)
        .map(v => String(v));

      if (fresh.hid && ids.some(id => freshIds.includes(id))) {
        return fresh;
      }
    }

    if (original?.name) {
      const same = freshItems.filter(fresh =>
        fresh?.hid &&
        fresh?.name === original.name &&
        (!original?.stat || !fresh?.stat || fresh.stat === original.stat)
      );
      if (same.length === 1) return same[0];
    }

    return null;
  }

  function resolveLegendHid(item) {
    if (
      item?.hid !== undefined &&
      item?.hid !== null &&
      String(item.hid).length > 0 &&
      String(item.hid) !== "0"
    ) {
      return String(item.hid);
    }

    const fresh = findFreshLootItem(item);
    if (
      fresh?.hid !== undefined &&
      fresh?.hid !== null &&
      String(fresh.hid).length > 0 &&
      String(fresh.hid) !== "0"
    ) {
      return String(fresh.hid);
    }

    return null;
  }

  function sendClanTestMessage(itemName = "Testowy przedmiot legendarny") {
    if (typeof pageWindow._g !== "function") {
      console.warn("[Legendary Pulse] Brak funkcji _g — test czatu niemożliwy.");
      return false;
    }

    let template = String(state.settings.clanText || DEFAULTS.clanText).trim();
    if (!template) template = DEFAULTS.clanText;

    const text = template.includes("{item}")
      ? template.replaceAll("{item}", itemName)
      : `${template} ${itemName}`;

    const finalText = text;

    try {
      pageWindow._g("chat&channel=clan", false, { c: finalText });
      console.info("[Legendary Pulse] Wysłano TEST wiadomości klanowej:", finalText);
      return true;
    } catch (e) {
      console.warn("[Legendary Pulse] Test wiadomości klanowej nie powiódł się:", e);
      return false;
    }
  }

  async function sendClanMessage(items) {
    if (typeof pageWindow._g !== "function") {
      console.warn("[Legendary Pulse] Brak funkcji _g — nie można wysłać wiadomości klanowej.");
      return false;
    }

    const list = Array.isArray(items) ? items : [items];

    const deadline = Date.now() + 3000;
    let hids = [];

    while (Date.now() < deadline) {
      hids = list
        .map(resolveLegendHid)
        .filter(Boolean);

      if (hids.length === list.length) break;
      await new Promise(resolve => setTimeout(resolve, 60));
    }

    hids = [...new Set(hids)];

    if (!hids.length) {
      console.warn(
        "[Legendary Pulse] Nie udało się uzyskać HID legendy nawet po ponowieniu. Wiadomość nie została wysłana.",
        list
      );
      return false;
    }

    const itemRefs = hids.map(hid => `ITEM#${hid}`).join(" ");

    let template = String(state.settings.clanText || DEFAULTS.clanText).trim();

    if (!template) template = DEFAULTS.clanText;

    const text = template.includes("{item}")
      ? template.replaceAll("{item}", itemRefs)
      : `${template} ${itemRefs}`;

    const finalText = text;

    try {
      pageWindow._g(`chat&channel=clan`, false, { c: finalText });
      console.info("[Legendary Pulse] Wysłano wiadomość klanową:", finalText);
      return true;
    } catch (e) {
      console.warn("[Legendary Pulse] Nie udało się wysłać wiadomości klanowej:", e);
      return false;
    }
  }

  function bindKeys() {
    window.addEventListener("keydown", e => {
      if (e.altKey && e.code === "KeyL") {
        e.preventDefault();
        togglePanel();
      }
    });

    window.addEventListener("resize", () => {
      positionFlashToGameArea();
    });
  }

  function startScanner() {
    clearInterval(state.timer);
    state.timer = setInterval(scanLoot, Math.max(100, state.settings.pollInterval));
  }

  function destroy() {
    stopCurrentLegendSound();
    removeTestLootWindow();
    stopLootTimedEffects();
    clearInterval(state.timer);
    document.getElementById(`${ID}-styles`)?.remove();
    document.getElementById("lp-screen-flash")?.remove();
    document.getElementById("lp-settings")?.remove();
    document.getElementById("lp-mini-button")?.remove();
    delete pageWindow.LegendaryPulse;
    console.info("[Legendary Pulse] Wyłączono.");
  }

  function init() {
    if (!COLOR_PALETTES[state.settings.palette]) state.settings.palette = DEFAULTS.palette;
    if (
      !state.settings.clanText ||
      state.settings.clanText === "✨ Legenda! {item}"
    ) {
      state.settings.clanText = DEFAULTS.clanText;
    }
    if (typeof state.settings.burstAnimation !== "boolean") state.settings.burstAnimation = true;
    if (typeof state.settings.screenShake !== "boolean") state.settings.screenShake = true;
    if (typeof state.settings.screenCrack !== "boolean") state.settings.screenCrack = true;
    if (typeof state.settings.legendaryLightning !== "boolean") state.settings.legendaryLightning = true;
    state.settings.screenShakeStrength = Math.max(10, Math.min(200, Number(state.settings.screenShakeStrength ?? 100)));
    if (typeof state.settings.animateColors !== "boolean") state.settings.animateColors = true;
    if (typeof state.settings.useCustomPalette !== "boolean") state.settings.useCustomPalette = false;
    for (let i = 1; i <= 3; i++) {
      const key = `customPalette${i}`;
      if (!/^#[0-9a-f]{6}$/i.test(state.settings[key] || "")) {
        state.settings[key] = DEFAULTS[key];
      }
    }
    if (!/^#[0-9a-f]{6}$/i.test(state.settings.mapColor || "")) state.settings.mapColor = DEFAULTS.mapColor;
    if (!/^#[0-9a-f]{6}$/i.test(state.settings.lootColor || "")) state.settings.lootColor = DEFAULTS.lootColor;
    if (!/^#[0-9a-f]{6}$/i.test(state.settings.itemColor || "")) state.settings.itemColor = DEFAULTS.itemColor;
    if (typeof state.settings.customSound !== "string") state.settings.customSound = "";
    if (!Number.isFinite(Number(state.settings.customSoundVolume))) state.settings.customSoundVolume = 100;
    state.settings.customSoundVolume = Math.max(0, Math.min(100, Number(state.settings.customSoundVolume)));
    if (!Number.isFinite(Number(state.settings.glowSize))) state.settings.glowSize = 100;
    state.settings.glowSize = Math.max(40, Math.min(200, Number(state.settings.glowSize)));
    injectStyles();
    createUi();
    initLootWindowActionWatcher();
    updateCssVars();
    bindKeys();
    startScanner();

    pageWindow.LegendaryPulse = {
      version: "1.9.5",
      settings: state.settings,
      notifyTest: () => runLootWindowTest(),
      clanTest: () => {
        const inventory = (() => {
          try {
            return pageWindow.Engine?.items?.fetchLocationItems?.("g") || [];
          } catch {
            return [];
          }
        })();

        const item = inventory.find(x => x?.hid);
        if (!item) {
          console.warn("[Legendary Pulse] Brak przedmiotu z HID w ekwipunku do testu.");
          return false;
        }

        void sendClanMessage([item]);
        return true;
      },
      chatTransportTest: () => sendClanTestMessage("Testowy przedmiot legendarny"),
      openSettings: () => setPanel(true),
      closeSettings: () => setPanel(false),
      debugGameArea: () => {
        const rect = getGameAreaRect();
        console.log("[Legendary Pulse] Wykryty obszar gry:", rect);
        return rect;
      },
      debugLootTime: () => {
        const lootWindow = findLootWindow();
        const ms = parseLootRemainingMs(lootWindow);
        console.log("[Legendary Pulse] Pozostały czas łupu [ms]:", ms, lootWindow);
        return ms;
      },
      destroy
    };

    console.info(
      "[Legendary Pulse] Uruchomiono. Alt+L = ustawienia. Test: LegendaryPulse.notifyTest()"
    );
  }

  function waitForGame() {
    if (document.body && pageWindow.Engine?.items) {
      init();
      return;
    }
    setTimeout(waitForGame, 500);
  }

  waitForGame();
})();
      return true;
    }
    if (pw.g?.item) {
      started = true;
      document.documentElement.dataset.legendaryPulseInterface = "SI";
(() => {
  "use strict";

  const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  if (pageWindow.LegendaryPulse) {
    console.info("[Legendary Pulse] Dodatek jest już uruchomiony.");
    return;
  }

  const ID = "legendary-pulse";
  const STORAGE_KEY = "legendaryPulse.settings.v1";
  const GLOBAL_STORAGE_KEY = "legendaryPulse.globalSettings.v1";

  const COLOR_PALETTES = {
    sunset: { name: "Zachód słońca", colors: ["#ffb347", "#ff6b6b", "#d84cff", "#6a5cff"] },
    legendary: { name: "Legenda", colors: ["#ffd35a", "#ff9f1c", "#c544ff", "#6d4aff"] },
    ocean: { name: "Ocean", colors: ["#35d7ff", "#368cff", "#655cff", "#38e3c1"] },
    emerald: { name: "Szmaragd", colors: ["#72f29a", "#29cf83", "#13b9a8", "#6de7d8"] },
    fire: { name: "Ogień", colors: ["#fff06a", "#ffb12b", "#ff6038", "#e62855"] },
    arcane: { name: "Arkana", colors: ["#f35cff", "#9e5cff", "#555dff", "#37c7ff"] },
    bloodmoon: { name: "Krwawy księżyc", colors: ["#ff5c7a", "#d91f55", "#7b183d", "#f08b43"] },
    aurora: { name: "Zorza", colors: ["#55f0b1", "#4cc9f0", "#8e72ff", "#f06ee8"] }
  };

  const DEFAULTS = {
    enabled: true,
    sound: true,
    burstAnimation: true,
    screenShake: true,
    screenShakeStrength: 100,
    screenCrack: true,
    legendaryLightning: true,
    screenFlash: true,
    itemGlow: true,
    centerMessage: true,
    clanMessage: false,
    duration: 6500,
    pollInterval: 180,
    palette: "legendary",
    animateColors: true,
    staticColors: false,
    useCustomPalette: false,
    customPalette1: "#ffd35a",
    customPalette2: "#ff9f1c",
    customPalette3: "#c544ff",
    mapColor: "#ffd35a",
    lootColor: "#ffd35a",
    itemColor: "#ffd35a",
    customSound: "",
    customSoundVolume: 100,
    glowSize: 100,
    widgetX: null,
    widgetY: null,
    accent: "#ffd35a",
    accent2: "#ff9f1c",
    clanText: "Spadła legenda! {item}"
  };

  const state = {
    settings: loadSettings(),
    seen: new Set(),
    startedAt: Date.now(),
    timer: null,
    audioContext: null,
    panelVisible: false,
    lastDetectedAt: 0,
    lootEffectTimer: null,
    lootEffectDeadline: 0,
    activeGlowElements: new Set(),
    testLootTimer: null,
    siNativeTestLoot: null,
    currentSoundAudio: null,
    currentSoundSource: "",
    currentSoundContext: null
  };

  function normalizeColorModes() {
    if (state.settings.staticColors) {
      state.settings.animateColors = false;
    } else {
      state.settings.animateColors = true;
    }
  }

  normalizeColorModes();

  function readLocalWorldSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function loadSettings() {
    try {
      if (typeof GM_getValue === "function") {
        const globalSettings = GM_getValue(GLOBAL_STORAGE_KEY, null);

        if (globalSettings && typeof globalSettings === "object") {
          return { ...DEFAULTS, ...globalSettings };
        }

        const migrated = { ...DEFAULTS, ...readLocalWorldSettings() };

        if (typeof GM_setValue === "function") {
          GM_setValue(GLOBAL_STORAGE_KEY, migrated);
        }

        return migrated;
      }
    } catch (e) {
      console.warn("[Legendary Pulse] Nie udało się odczytać globalnych ustawień:", e);
    }

    return { ...DEFAULTS, ...readLocalWorldSettings() };
  }

  function saveSettings() {
    const data = { ...state.settings };

    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(GLOBAL_STORAGE_KEY, data);
      }
    } catch (e) {
      console.warn("[Legendary Pulse] Nie udało się zapisać globalnych ustawień:", e);
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getActivePalette() {
    return COLOR_PALETTES[state.settings.palette] || COLOR_PALETTES.legendary;
  }

  function getActivePaletteColors() {
    if (state.settings.useCustomPalette) {
      const c1 = state.settings.customPalette1 || "#ffd35a";
      const c2 = state.settings.customPalette2 || "#ff9f1c";
      const c3 = state.settings.customPalette3 || "#c544ff";
      return [c1, c2, c3, c1];
    }

    const colors = getActivePalette().colors;
    return [
      colors[0] || "#ffd35a",
      colors[1] || colors[0] || "#ff9f1c",
      colors[2] || colors[1] || colors[0] || "#c544ff",
      colors[3] || colors[2] || colors[1] || colors[0] || "#6d4aff"
    ];
  }

  function paletteButtons() {
    return Object.entries(COLOR_PALETTES).map(([id, palette]) => {
      const gradient = `linear-gradient(90deg, ${palette.colors.join(", ")})`;
      return `
        <button
          type="button"
          class="lp-palette-card ${state.settings.palette === id ? "active" : ""}"
          data-palette="${id}"
          title="${esc(palette.name)}"
        >
          <span class="lp-palette-strip" style="display:block;background:${gradient}"></span>
          <span class="lp-palette-name">${esc(palette.name)}</span>
        </button>
      `;
    }).join("");
  }

  function injectStyles() {
    if (document.getElementById(`${ID}-styles`)) return;

    const style = document.createElement("style");
    style.id = `${ID}-styles`;
    style.textContent = `
      :root {
        --lp-accent: ${getActivePaletteColors()[0]};
        --lp-accent2: ${getActivePaletteColors()[1]};

        --lp-map1: ${getActivePaletteColors()[0]};
        --lp-map2: ${getActivePaletteColors()[1]};
        --lp-map3: ${getActivePaletteColors()[2]};
        --lp-map4: ${getActivePaletteColors()[3]};

        --lp-loot1: ${getActivePaletteColors()[0]};
        --lp-loot2: ${getActivePaletteColors()[1]};
        --lp-loot3: ${getActivePaletteColors()[2]};
        --lp-loot4: ${getActivePaletteColors()[3]};

        --lp-item1: ${getActivePaletteColors()[0]};
        --lp-item2: ${getActivePaletteColors()[1]};
        --lp-item3: ${getActivePaletteColors()[2]};
        --lp-item4: ${getActivePaletteColors()[3]};
        --lp-glow-scale: ${Number(state.settings.glowSize ?? 100) / 100};
      }

      body > #tip {
        z-index: 2147483645 !important;
      }

      #lp-screen-flash {
        z-index: 11;
        display: block;
        background: transparent;
        pointer-events: none;
        opacity: 0;
        box-sizing: border-box;
        overflow: hidden;
        border: 0 !important;
      }

      #lp-screen-flash.active {
        animation: lp-screen-pulse 3.0s linear infinite;
        animation-delay: 0s;
      }

      .lp-loot-glow {
        position: relative !important;
        animation: lp-item-pulse 3.0s linear infinite !important;
        animation-delay: 0s !important;
      }

      .lp-loot-glow .slot {
        animation: lp-item-slot-pulse 3.0s linear infinite !important;
        animation-delay: 0s !important;
      }

      #lp-settings {
        position: fixed;
        top: 70px;
        right: 22px;
        z-index: 1000000;
        width: 285px;
        color: #eceaf7;
        background: rgba(12, 12, 20, .98);
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 11px;
        box-shadow: 0 18px 55px rgba(0,0,0,.6);
        font: 12px Arial, sans-serif;
        user-select: none;
        display: none;
        overflow: hidden;
      }

      #lp-settings.visible {
        display: block;
        animation: lp-panel-in .18s ease-out;
      }

      .lp-panel-head {
        padding: 9px 11px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: move;
        background:
          linear-gradient(100deg,
            color-mix(in srgb, var(--lp-accent2) 24%, transparent),
            color-mix(in srgb, var(--lp-accent) 14%, transparent));
        border-bottom: 1px solid rgba(255,255,255,.08);
      }

      .lp-panel-title {
        font-weight: 800;
        letter-spacing: .3px;
      }

      .lp-panel-subtitle {
        color: rgba(255,255,255,.45);
        font-size: 9px;
        margin-top: 2px;
      }

      .lp-close {
        cursor: pointer;
        border: 0;
        border-radius: 8px;
        width: 25px;
        height: 25px;
        color: #fff;
        background: rgba(255,255,255,.08);
      }

      .lp-panel-body {
        padding: 7px 9px 9px;
        max-height: calc(72vh - 48px);
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,.28) rgba(255,255,255,.04);
      }

      .lp-panel-body::-webkit-scrollbar {
        width: 7px;
      }

      .lp-panel-body::-webkit-scrollbar-track {
        background: rgba(255,255,255,.035);
        border-radius: 10px;
      }

      .lp-panel-body::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,.25);
        border-radius: 10px;
      }

      .lp-panel-body::-webkit-scrollbar-thumb:hover {
        background: rgba(255,255,255,.38);
      }

      .lp-setting {
        min-height: 31px;
        display: flex;
        gap: 10px;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(255,255,255,.055);
      }

      .lp-setting:last-of-type {
        border-bottom: none;
      }

      .lp-setting input[type="checkbox"] {
        accent-color: var(--lp-accent2);
      }

      .lp-setting input[type="text"] {
        width: 142px;
        box-sizing: border-box;
        color: #fff;
        background: #181723;
        border: 1px solid rgba(255,255,255,.11);
        border-radius: 7px;
        padding: 6px 7px;
        outline: none;
      }

      .lp-actions {
        display: flex;
        gap: 8px;
        margin-top: 11px;
      }

      .lp-btn {
        flex: 1;
        cursor: pointer;
        padding: 8px 10px;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 9px;
        color: #fff;
        font-weight: 700;
        background: linear-gradient(135deg,
          color-mix(in srgb, var(--lp-accent2) 58%, #171521),
          color-mix(in srgb, var(--lp-accent) 38%, #171521));
      }

      .lp-btn.secondary {
        background: #191822;
      }

      .lp-palette-section {
        padding: 6px 0 3px;
        border-bottom: 1px solid rgba(255,255,255,.055);
      }

      .lp-palette-title {
        margin-bottom: 5px;
        font-size: 11px;
        color: rgba(255,255,255,.78);
      }

      .lp-palette-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 7px;
      }

      .lp-palette-card {
        min-height: 36px;
        padding: 4px;
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 9px;
        color: rgba(255,255,255,.88);
        background: rgba(255,255,255,.025);
        cursor: pointer;
        transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease;
      }

      .lp-palette-card:hover {
        transform: translateY(-1px);
        border-color: rgba(255,255,255,.24);
      }

      .lp-palette-card.active {
        border-color: var(--lp-accent);
        box-shadow:
          0 0 0 1px color-mix(in srgb, var(--lp-accent2) 50%, transparent),
          0 0 12px color-mix(in srgb, var(--lp-accent) 24%, transparent);
      }

      .lp-palette-strip {
        height: 13px;
        border-radius: 5px;
        margin-bottom: 3px;
        border: 1px solid rgba(255,255,255,.12);
      }

      .lp-palette-name {
        display: block;
        font-size: 9px;
        line-height: 1.1;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .lp-custom-palette-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        margin-top: 6px;
      }

      .lp-custom-palette-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: 30px;
        padding: 3px 5px;
        border: 1px solid rgba(255,255,255,.07);
        border-radius: 7px;
        background: rgba(255,255,255,.025);
      }

      .lp-custom-palette-row span {
        font-size: 9px;
        color: rgba(255,255,255,.68);
      }

      .lp-custom-palette-row input[type="color"] {
        width: 36px;
        height: 25px;
        padding: 0;
        border: 1px solid rgba(255,255,255,.16);
        border-radius: 5px;
        background: transparent;
        cursor: pointer;
      }

      .lp-custom-palette-grid.disabled {
        opacity: .4;
        pointer-events: none;
      }

      .lp-color-mode-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        min-height: 29px;
        padding: 2px 0;
        border-bottom: 1px solid rgba(255,255,255,.055);
      }

      .lp-color-mode-row .lp-setting-label {
        color: rgba(255,255,255,.84);
      }

      .lp-static-colors-section.disabled > .lp-setting {
        opacity: 1;
        color: #eceaf7;
      }

      .lp-static-colors-section.disabled .lp-color-mode-row {
        opacity: .42;
      }

      .lp-static-colors-section.disabled .lp-color-picker {
        pointer-events: none;
      }

      .lp-color-picker {
        width: 38px;
        height: 27px;
        padding: 0;
        border: 1px solid rgba(255,255,255,.16);
        border-radius: 6px;
        background: transparent;
        cursor: pointer;
      }

      .lp-palette-section.disabled {
        opacity: .42;
      }

      .lp-palette-section.disabled .lp-palette-card {
        pointer-events: none;
      }

      .lp-loot-window-glow {
        animation: lp-loot-window-pulse 3.0s linear infinite !important;
        animation-delay: 0s !important;
        will-change: box-shadow, filter;
      }

      #loots.lp-loot-window-glow {
        animation: none !important;
        filter: none !important;
        box-shadow: none !important;
      }

      #loots {
        z-index: 450 !important;
      }

      #loots_button {
        animation: none !important;
        filter: none !important;
        box-shadow: none !important;
        z-index: 451 !important;
      }

      #lp-si-loot-glow-overlay {
        position: fixed;
        pointer-events: none;
        z-index: 449;
        box-sizing: border-box;
        background: transparent;
        border: 0;
        animation: lp-si-loot-window-pulse 3.0s linear infinite !important;
        animation-delay: 0s !important;
        will-change: box-shadow;
      }

      @keyframes lp-si-loot-window-pulse {
        0%, 100% {
          box-shadow:
            0 0 calc(20px * var(--lp-glow-scale)) calc(4px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot1) calc(62% * var(--lp-glow-intensity)), transparent),
            0 0 calc(45px * var(--lp-glow-scale)) calc(8px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot1) calc(24% * var(--lp-glow-intensity)), transparent) !important;
        }
        33.333% {
          box-shadow:
            0 0 calc(38px * var(--lp-glow-scale)) calc(8px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot2) calc(82% * var(--lp-glow-intensity)), transparent),
            0 0 calc(70px * var(--lp-glow-scale)) calc(23px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot2) calc(38% * var(--lp-glow-intensity)), transparent) !important;
        }
        66.666% {
          box-shadow:
            0 0 calc(30px * var(--lp-glow-scale)) calc(6px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot3) calc(74% * var(--lp-glow-intensity)), transparent),
            0 0 calc(56px * var(--lp-glow-scale)) calc(18px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot3) calc(32% * var(--lp-glow-intensity)), transparent) !important;
        }
      }

      @keyframes lp-loot-window-pulse {
        0%, 100% {
          box-shadow:
            0 0 calc(20px * var(--lp-glow-scale)) calc(4px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot1) calc(62% * var(--lp-glow-intensity)), transparent),
            0 0 calc(45px * var(--lp-glow-scale)) calc(8px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot1) calc(24% * var(--lp-glow-intensity)), transparent) !important;
          filter:
            drop-shadow(0 0 calc(5px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot1) calc(54% * var(--lp-glow-intensity)), transparent))
            drop-shadow(0 0 calc(15px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot1) calc(22% * var(--lp-glow-intensity)), transparent));
        }
        33.333% {
          box-shadow:
            0 0 calc(38px * var(--lp-glow-scale)) calc(8px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot2) calc(82% * var(--lp-glow-intensity)), transparent),
            0 0 calc(70px * var(--lp-glow-scale)) calc(23px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot2) calc(38% * var(--lp-glow-intensity)), transparent) !important;
          filter:
            drop-shadow(0 0 calc(8px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot2) calc(72% * var(--lp-glow-intensity)), transparent))
            drop-shadow(0 0 calc(23px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot2) calc(34% * var(--lp-glow-intensity)), transparent));
        }
        66.666% {
          box-shadow:
            0 0 calc(30px * var(--lp-glow-scale)) calc(6px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot3) calc(74% * var(--lp-glow-intensity)), transparent),
            0 0 calc(56px * var(--lp-glow-scale)) calc(18px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot3) calc(32% * var(--lp-glow-intensity)), transparent) !important;
          filter:
            drop-shadow(0 0 calc(12px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot3) calc(66% * var(--lp-glow-intensity)), transparent))
            drop-shadow(0 0 calc(18px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-loot3) calc(28% * var(--lp-glow-intensity)), transparent));
        }
      }

      #lp-mini-button {
        position: fixed;
        right: 18px;
        bottom: 135px;
        z-index: 999998;
        width: 38px;
        height: 38px;
        border-radius: 12px;
        border: 1px solid color-mix(in srgb, var(--lp-accent) 45%, transparent);
        color: #fff;
        background: linear-gradient(145deg, #171520, #0d0d14);
        box-shadow: 0 8px 20px rgba(0,0,0,.38), 0 0 12px color-mix(in srgb, var(--lp-accent2) 16%, transparent);
        cursor: grab;
        font-size: 18px;
      }

      @keyframes lp-in {
        to { transform: translateX(0); opacity: 1; }
      }

      @keyframes lp-out {
        to { transform: translateX(115%); opacity: 0; }
      }

      @keyframes lp-shine {
        from { left: -35%; }
        to { left: 130%; }
      }

      @keyframes lp-pulse {
        from { transform: scale(.9); opacity: .65; }
        to { transform: scale(1.15); opacity: 1; }
      }

      @keyframes lp-item-pulse {
        0%, 100% {
          filter:
            drop-shadow(0 0 calc(12px * var(--lp-glow-scale)) var(--lp-item1))
            brightness(1.06);
          box-shadow:
            0 0 calc(15px * var(--lp-glow-scale)) calc(2px * var(--lp-glow-scale))
            color-mix(in srgb, var(--lp-item1) calc(72% * var(--lp-glow-intensity)), transparent);
        }
        33.333% {
          filter:
            drop-shadow(0 0 calc(23px * var(--lp-glow-scale)) var(--lp-item2))
            brightness(1.16);
          box-shadow:
            0 0 calc(27px * var(--lp-glow-scale)) calc(4px * var(--lp-glow-scale))
            color-mix(in srgb, var(--lp-item2) calc(82% * var(--lp-glow-intensity)), transparent);
        }
        66.666% {
          filter:
            drop-shadow(0 0 calc(17px * var(--lp-glow-scale)) var(--lp-item3))
            brightness(1.11);
          box-shadow:
            0 0 calc(20px * var(--lp-glow-scale)) calc(3px * var(--lp-glow-scale))
            color-mix(in srgb, var(--lp-item3) calc(77% * var(--lp-glow-intensity)), transparent);
        }
      }

      @keyframes lp-item-slot-pulse {
        0%, 100% {
          box-shadow:
            0 0 calc(15px * var(--lp-glow-scale)) calc(2px * var(--lp-glow-scale))
            color-mix(in srgb, var(--lp-item1) calc(74% * var(--lp-glow-intensity)), transparent);
        }
        33.333% {
          box-shadow:
            0 0 calc(23px * var(--lp-glow-scale)) calc(4px * var(--lp-glow-scale))
            color-mix(in srgb, var(--lp-item2) calc(84% * var(--lp-glow-intensity)), transparent);
        }
        66.666% {
          box-shadow:
            0 0 calc(18px * var(--lp-glow-scale)) calc(3px * var(--lp-glow-scale))
            color-mix(in srgb, var(--lp-item3) calc(79% * var(--lp-glow-intensity)), transparent);
        }
      }

      @keyframes lp-screen-pulse {
        0%, 100% {
          opacity: calc(.42 * var(--lp-glow-intensity));
          border: 0;
          box-shadow:
            inset 0 0 calc(100px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-map1) calc(50% * var(--lp-glow-intensity)), transparent),
            inset 0 0 calc(235px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-map1) calc(29% * var(--lp-glow-intensity)), transparent),
            inset 0 0 calc(410px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-map1) calc(14% * var(--lp-glow-intensity)), transparent);
        }
        33.333% {
          opacity: calc(.94 * var(--lp-glow-intensity));
          border: 0;
          box-shadow:
            inset 0 0 calc(145px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-map2) calc(78% * var(--lp-glow-intensity)), transparent),
            inset 0 0 calc(340px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-map2) calc(48% * var(--lp-glow-intensity)), transparent),
            inset 0 0 calc(555px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-map2) calc(25% * var(--lp-glow-intensity)), transparent);
        }
        66.666% {
          opacity: calc(.70 * var(--lp-glow-intensity));
          border: 0;
          box-shadow:
            inset 0 0 calc(125px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-map3) calc(64% * var(--lp-glow-intensity)), transparent),
            inset 0 0 calc(290px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-map3) calc(38% * var(--lp-glow-intensity)), transparent),
            inset 0 0 calc(480px * var(--lp-glow-scale)) color-mix(in srgb, var(--lp-map3) calc(19% * var(--lp-glow-intensity)), transparent);
        }
      }

      #lp-legend-lightning {
        position: fixed;
        left: 0;
        top: 0;
        width: 0;
        height: 0;
        pointer-events: none;
        z-index: 2147483639;
        overflow: visible;
        opacity: 1;
      }

      #lp-legend-lightning svg {
        width: 100%;
        height: 100%;
        overflow: visible;
        filter:
          drop-shadow(0 0 2px rgba(255,255,255,.98))
          drop-shadow(0 0 7px var(--lp-map1))
          drop-shadow(0 0 15px var(--lp-map2));
      }

      #lp-legend-lightning .lp-bolt-shadow {
        fill: none;
        stroke: rgba(20,25,55,.92);
        stroke-width: 5;
        stroke-linecap: butt;
        stroke-linejoin: miter;
        vector-effect: non-scaling-stroke;
      }

      #lp-legend-lightning .lp-bolt-main {
        fill: none;
        stroke: rgba(245,252,255,.98);
        stroke-width: 1.45;
        stroke-linecap: butt;
        stroke-linejoin: miter;
        vector-effect: non-scaling-stroke;
      }

      #lp-legend-lightning .lp-bolt-color {
        fill: none;
        stroke: var(--lp-map1);
        stroke-width: 2.8;
        stroke-linecap: butt;
        stroke-linejoin: miter;
        vector-effect: non-scaling-stroke;
        opacity: .72;
      }

      #lp-legend-lightning .lp-bolt-branch {
        fill: none;
        stroke: color-mix(in srgb, var(--lp-map2) 65%, white);
        stroke-width: .85;
        stroke-linecap: butt;
        vector-effect: non-scaling-stroke;
        opacity: .9;
      }

      #lp-legend-lightning .lp-lightning-impact {
        position: absolute;
        width: 26px;
        height: 26px;
        margin: -13px 0 0 -13px;
        border-radius: 50%;
        background: radial-gradient(circle,
          rgba(255,255,255,.98) 0 8%,
          var(--lp-map1) 20%,
          color-mix(in srgb, var(--lp-map2) 60%, transparent) 48%,
          transparent 72%);
        filter: blur(.2px) drop-shadow(0 0 16px var(--lp-map1));
        animation: lp-lightning-impact 620ms ease-out forwards;
      }

      #lp-legend-lightning.active {
        animation: lp-lightning-layer 780ms ease-out forwards;
      }

      @keyframes lp-lightning-layer {
        0% { opacity: 0; }
        3% { opacity: 1; }
        8% { opacity: .12; }
        13% { opacity: .96; }
        20% { opacity: .28; }
        27% { opacity: 1; }
        36% { opacity: .18; }
        44% { opacity: .88; }
        58% { opacity: .34; }
        72% { opacity: .14; }
        100% { opacity: 0; }
      }

      @keyframes lp-lightning-impact {
        0% { transform: scale(.2); opacity: 0; }
        10% { transform: scale(1.55); opacity: 1; }
        38% { transform: scale(2.8); opacity: .82; }
        100% { transform: scale(4.2); opacity: 0; }
      }

      #lp-screen-crack {
        position: fixed;
        left: 0;
        top: 0;
        width: 0;
        height: 0;
        pointer-events: none;
        z-index: 2147483646;
        overflow: visible;
        opacity: 0;
      }

      #lp-screen-crack svg {
        width: 100%;
        height: 100%;
        overflow: visible;
        filter:
          drop-shadow(0 0 1px rgba(255,255,255,.95))
          drop-shadow(0 0 3px rgba(120,190,255,.45))
          drop-shadow(0 1px 1px rgba(0,0,0,.85));
      }

      #lp-screen-crack.active {
        animation: lp-screen-crack-fade 920ms cubic-bezier(.12,.7,.22,1) forwards;
      }

      #lp-screen-crack .lp-crack-main {
        fill: none;
        stroke: rgba(245,250,255,.96);
        stroke-width: 1.45;
        stroke-linecap: round;
        stroke-linejoin: round;
        vector-effect: non-scaling-stroke;
      }

      #lp-screen-crack .lp-crack-shadow {
        fill: none;
        stroke: rgba(5,8,16,.82);
        stroke-width: 3.6;
        stroke-linecap: round;
        stroke-linejoin: round;
        vector-effect: non-scaling-stroke;
        opacity: .72;
      }

      #lp-screen-crack .lp-crack-fine {
        fill: none;
        stroke: rgba(225,242,255,.78);
        stroke-width: .72;
        stroke-linecap: round;
        vector-effect: non-scaling-stroke;
      }

      #lp-screen-crack .lp-crack-impact {
        fill: rgba(255,255,255,.20);
        stroke: rgba(255,255,255,.90);
        stroke-width: 1;
        vector-effect: non-scaling-stroke;
      }

      @keyframes lp-screen-crack-fade {
        0%   { opacity: 0; transform: scale(.985); filter: brightness(1.9); }
        8%   { opacity: 1; transform: scale(1); filter: brightness(1.35); }
        48%  { opacity: .92; transform: scale(1.002); filter: brightness(1.05); }
        72%  { opacity: .52; }
        100% { opacity: 0; transform: scale(1.006); filter: brightness(.9); }
      }

    @keyframes lp-screen-shake {
      0%, 100% { transform: translate3d(0, 0, 0); }
      14% { transform: translate3d(calc(-1px * var(--lp-shake-strength)), calc(1px * var(--lp-shake-strength)), 0); }
      28% { transform: translate3d(calc(2px * var(--lp-shake-strength)), calc(-1px * var(--lp-shake-strength)), 0); }
      42% { transform: translate3d(calc(-2px * var(--lp-shake-strength)), 0, 0); }
      56% { transform: translate3d(calc(1px * var(--lp-shake-strength)), calc(1px * var(--lp-shake-strength)), 0); }
      70% { transform: translate3d(calc(-1px * var(--lp-shake-strength)), calc(-1px * var(--lp-shake-strength)), 0); }
      84% { transform: translate3d(calc(1px * var(--lp-shake-strength)), 0, 0); }
    }

    #lp-burst-layer {
        position: fixed;
        left: 0;
        top: 0;
        width: 0;
        height: 0;
        pointer-events: none;
        z-index: 2147483638;
        overflow: visible;
      }

      .lp-burst-core,
      .lp-burst-ring,
      .lp-burst-particle {
        position: absolute;
        left: 0;
        top: 0;
        pointer-events: none;
        will-change: transform, opacity, filter;
      }

      .lp-burst-core {
        width: 34px;
        height: 34px;
        margin: -17px 0 0 -17px;
        border-radius: 50%;
        background:
          radial-gradient(circle,
            rgba(255,255,255,.98) 0 12%,
            var(--lp-map1) 22%,
            color-mix(in srgb, var(--lp-map2) 72%, transparent) 48%,
            transparent 74%);
        filter: blur(.4px) drop-shadow(0 0 18px var(--lp-map1));
        animation: lp-burst-core 900ms cubic-bezier(.14,.72,.24,1) forwards;
      }

      .lp-burst-ring {
        width: 32px;
        height: 32px;
        margin: -16px 0 0 -16px;
        border: 3px solid var(--lp-map1);
        border-radius: 50%;
        box-shadow:
          0 0 16px var(--lp-map1),
          inset 0 0 12px color-mix(in srgb, var(--lp-map2) 72%, transparent);
        animation: lp-burst-ring 1050ms cubic-bezier(.12,.67,.2,1) forwards;
      }

      .lp-burst-particle {
        width: var(--lp-particle-size, 5px);
        height: var(--lp-particle-size, 5px);
        margin:
          calc(var(--lp-particle-size, 5px) / -2)
          0 0
          calc(var(--lp-particle-size, 5px) / -2);
        border-radius: 999px;
        background: var(--lp-particle-color, var(--lp-map1));
        box-shadow:
          0 0 8px var(--lp-particle-color, var(--lp-map1)),
          0 0 16px color-mix(in srgb, var(--lp-particle-color, var(--lp-map1)) 65%, transparent);
        animation: lp-burst-particle var(--lp-particle-duration, 1050ms)
          cubic-bezier(.12,.62,.22,1) forwards;
        animation-delay: var(--lp-particle-delay, 0ms);
      }

      @keyframes lp-burst-core {
        0% {
          transform: scale(.15);
          opacity: 0;
        }
        16% {
          transform: scale(1.55);
          opacity: 1;
        }
        48% {
          transform: scale(3.2);
          opacity: .76;
        }
        100% {
          transform: scale(5.1);
          opacity: 0;
        }
      }

      @keyframes lp-burst-ring {
        0% {
          transform: scale(.25);
          opacity: 0;
          border-color: var(--lp-map1);
        }
        18% {
          opacity: 1;
        }
        52% {
          border-color: var(--lp-map2);
        }
        100% {
          transform: scale(7.2);
          opacity: 0;
          border-color: var(--lp-map3);
        }
      }

      @keyframes lp-burst-particle {
        0% {
          transform:
            translate(0, 0)
            scale(.3);
          opacity: 0;
        }
        12% {
          opacity: 1;
        }
        55% {
          background: var(--lp-particle-color2, var(--lp-map2));
        }
        100% {
          transform:
            translate(var(--lp-particle-x), var(--lp-particle-y))
            scale(.05);
          opacity: 0;
        }
      }

      @keyframes lp-panel-in {
        from { opacity: 0; transform: translateY(-6px) scale(.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
    `;
    document.head.appendChild(style);
  }

  function createUi() {
    if (!document.getElementById("lp-screen-flash")) {
      const flash = document.createElement("div");
      flash.id = "lp-screen-flash";
      flash.className = "map-overlay";
      flash.style.setProperty("z-index", "11");
      flash.style.setProperty("display", "block");
      flash.style.setProperty("background", "transparent");
      flash.style.setProperty("pointer-events", "none");

      const appendFlash = () => {
        if (isOldInterface()) {
          document.body.appendChild(flash);
          positionFlashToGameArea();
          return;
        }
        const gameLayer = document.querySelector(".game-layer");
        if (gameLayer) {
          gameLayer.appendChild(flash);
          return;
        }
        setTimeout(appendFlash, 250);
      };

      appendFlash();
    }

    if (!document.getElementById("lp-mini-button")) {
      const button = document.createElement("button");
      button.id = "lp-mini-button";
      button.type = "button";
      button.title = "Legendary Pulse — ustawienia (Alt+L)";
      button.textContent = "✦";
      button.addEventListener("click", e => {
        if (button.dataset.lpJustDragged === "1") {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        togglePanel();
      });
      document.body.appendChild(button);
      restoreMiniWidgetPosition(button);
      makeMiniWidgetDraggable(button);
    }

    if (!document.getElementById("lp-settings")) {
      const panel = document.createElement("div");
      panel.id = "lp-settings";
      panel.innerHTML = `
        <div class="lp-panel-head">
          <div>
            <div class="lp-panel-title">✦ Legendary Pulse</div>
            <div class="lp-panel-subtitle">Notyfikator legend</div>
          </div>
          <button class="lp-close" type="button">×</button>
        </div>

        <div class="lp-panel-body">
          ${checkboxRow("enabled", "Dodatek aktywny")}
          ${checkboxRow("sound", "Dźwięk")}
          ${checkboxRow("burstAnimation", "Animacja wybuchu")}
          ${checkboxRow("screenShake", "Lekkie trzęsienie ekranu")}
          <div id="lp-screen-shake-strength-wrap" style="margin:4px 0 8px;">
            <div class="lp-row">
              <span>Siła trzęsienia</span>
              <strong id="lp-screen-shake-strength-value">${Math.round(state.settings.screenShakeStrength)}%</strong>
            </div>
            <input id="lp-screen-shake-strength" type="range" min="10" max="200" step="5" value="${state.settings.screenShakeStrength}" style="width:100%;">
          </div>
          ${checkboxRow("screenCrack", "Pęknięcie ekranu")}
          ${checkboxRow("legendaryLightning", "Błyskawice do legendy")}
          ${checkboxRow("screenFlash", "Obramowanie mapy")}
          ${checkboxRow("itemGlow", "Podświetlenie itemu")}
          ${checkboxRow("centerMessage", "Wiadomość ekranowa")}
          ${checkboxRow("clanMessage", "Wiadomość klanowa")}

          <label class="lp-setting">
            <span>Tekst klanowy</span>
            <input id="lp-clanText" type="text" value="${esc(state.settings.clanText)}">
          </label>

          <label class="lp-setting">
            <span>Animacja przechodzenia między kolorami</span>
            <input id="lp-animate-colors" type="checkbox" ${state.settings.animateColors ? "checked" : ""}>
          </label>

          <div class="lp-palette-section ${state.settings.animateColors ? "" : "disabled"}">
            <div class="lp-palette-title">Paleta animacji</div>
            <div class="lp-palette-grid">
              ${paletteButtons()}
            </div>

            <label class="lp-setting" style="margin-top:6px;">
              <span>Własne kolory przejścia</span>
              <input id="lp-use-custom-palette" type="checkbox" ${state.settings.useCustomPalette ? "checked" : ""}>
            </label>

            <div class="lp-custom-palette-grid ${state.settings.useCustomPalette ? "" : "disabled"}">
              <label class="lp-custom-palette-row">
                <span>Kolor 1</span>
                <input id="lp-custom-palette-1" type="color" value="${esc(state.settings.customPalette1)}">
              </label>
              <label class="lp-custom-palette-row">
                <span>Kolor 2</span>
                <input id="lp-custom-palette-2" type="color" value="${esc(state.settings.customPalette2)}">
              </label>
              <label class="lp-custom-palette-row">
                <span>Kolor 3</span>
                <input id="lp-custom-palette-3" type="color" value="${esc(state.settings.customPalette3)}">
              </label>
            </div>
          </div>

          <div class="lp-static-colors-section ${state.settings.staticColors ? "" : "disabled"}">
            <label class="lp-setting" style="margin-top:6px;">
              <span>Statyczne kolory podświetlenia</span>
              <input id="lp-static-colors" type="checkbox" ${state.settings.staticColors ? "checked" : ""}>
            </label>

            <div class="lp-color-mode-row">
              <span class="lp-setting-label">Obramowanie mapy</span>
              <input id="lp-map-color" class="lp-color-picker" type="color" value="${esc(state.settings.mapColor)}">
            </div>

            <div class="lp-color-mode-row">
              <span class="lp-setting-label">Obramowanie okna łupów</span>
              <input id="lp-loot-color" class="lp-color-picker" type="color" value="${esc(state.settings.lootColor)}">
            </div>

            <div class="lp-color-mode-row">
              <span class="lp-setting-label">Obramowanie itemu</span>
              <input id="lp-item-color" class="lp-color-picker" type="color" value="${esc(state.settings.itemColor)}">
            </div>
          </div>

          <div class="lp-palette-section">
            <div class="lp-palette-title">Wielkość podświetleń</div>
            <label class="lp-setting">
              <span>Rozmiar wszystkich efektów</span>
              <input
                id="lp-glow-size"
                type="range"
                min="40"
                max="200"
                step="5"
                value="${Number(state.settings.glowSize ?? 100)}"
              >
              <span id="lp-glow-size-value">${Number(state.settings.glowSize ?? 100)}%</span>
            </label>
          </div>

          <div class="lp-palette-section">
            <div class="lp-palette-title">Własny dźwięk powiadomienia</div>

            <label class="lp-setting" style="display:block;">
              <span style="display:block;margin-bottom:6px;">Link / ścieżka do MP3 lub MP4</span>
              <input
                id="lp-custom-sound"
                type="text"
                value="${esc(state.settings.customSound || "")}"
                placeholder="np. https://.../dzwiek.mp3"
                style="width:100%;box-sizing:border-box;"
              >
            </label>

            <label class="lp-setting">
              <span>Głośność własnego dźwięku</span>
              <input
                id="lp-custom-sound-volume"
                type="range"
                min="0"
                max="100"
                step="1"
                value="${Number(state.settings.customSoundVolume ?? 100)}"
              >
              <span id="lp-custom-sound-volume-value">${Number(state.settings.customSoundVolume ?? 100)}%</span>
            </label>

            <div class="lp-actions" style="margin-top:8px;">
              <button id="lp-test-sound" type="button">TEST DŹWIĘKU</button>
              <button id="lp-clear-sound" type="button">WYCZYŚĆ</button>
            </div>

            <div style="margin-top:7px;font-size:10px;line-height:1.35;color:rgba(255,255,255,.55);">
              Puste pole = domyślny dźwięk dodatku. Najpewniej działają bezpośrednie adresy HTTPS do plików MP3/MP4.
            </div>
          </div>

          <div class="lp-actions">
            <button class="lp-btn" id="lp-test" type="button">TEST LEGENDY</button>
            <button class="lp-btn secondary" id="lp-reset" type="button">RESET</button>
          </div>
        </div>
      `;
      document.body.appendChild(panel);

      const closeButton = panel.querySelector(".lp-close");
      closeButton.addEventListener("mousedown", e => {
        e.stopPropagation();
      });
      closeButton.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        setPanel(false);
      });
      panel.querySelector("#lp-test").addEventListener("click", () => {
        runLootWindowTest();
      });

      panel.querySelector("#lp-reset").addEventListener("click", () => {
        state.settings = { ...DEFAULTS };
        saveSettings();
        syncUiFromSettings();
        updateCssVars();
      });

      panel.querySelectorAll("[data-lp-setting]").forEach(input => {
        input.addEventListener("change", () => {
          const key = input.dataset.lpSetting;
          state.settings[key] = input.checked;
          saveSettings();

          if (key === "screenShake") {
            const wrap = panel.querySelector("#lp-screen-shake-strength-wrap");
            if (wrap) wrap.style.display = input.checked ? "block" : "none";
          }
        });
      });

      const shakeStrengthInput = panel.querySelector("#lp-screen-shake-strength");
      const shakeStrengthValue = panel.querySelector("#lp-screen-shake-strength-value");
      shakeStrengthInput?.addEventListener("input", e => {
        const value = Math.max(10, Math.min(200, Number(e.target.value) || 100));
        state.settings.screenShakeStrength = value;
        if (shakeStrengthValue) shakeStrengthValue.textContent = `${Math.round(value)}%`;
        saveSettings();
      });

      panel.querySelector("#lp-clanText").addEventListener("change", e => {
        state.settings.clanText = e.target.value || DEFAULTS.clanText;
        saveSettings();
      });

      panel.querySelectorAll(".lp-palette-card").forEach(button => {
        button.addEventListener("click", () => {
          const paletteId = button.dataset.palette;
          if (!COLOR_PALETTES[paletteId]) return;

          state.settings.palette = paletteId;
          state.settings.useCustomPalette = false;
          const colors = COLOR_PALETTES[paletteId].colors;
          state.settings.accent = colors[0];
          state.settings.accent2 = colors[1];

          saveSettings();
          updateCssVars();
          syncUiFromSettings();
        });
      });

      const useCustomPaletteInput = panel.querySelector("#lp-use-custom-palette");
      const customPaletteInputs = [
        panel.querySelector("#lp-custom-palette-1"),
        panel.querySelector("#lp-custom-palette-2"),
        panel.querySelector("#lp-custom-palette-3")
      ];

      useCustomPaletteInput.addEventListener("change", e => {
        if (state.settings.staticColors) {
          e.target.checked = !!state.settings.useCustomPalette;
          e.target.disabled = true;
          return;
        }
        state.settings.useCustomPalette = e.target.checked;
        state.settings.animateColors = true;
        state.settings.staticColors = false;
        saveSettings();
        updateCssVars();
        syncUiFromSettings();
      });

      customPaletteInputs.forEach((input, index) => {
        input.addEventListener("input", e => {
          state.settings[`customPalette${index + 1}`] = e.target.value;
          saveSettings();
          updateCssVars();
        });
      });

      const animateColorsInput = panel.querySelector("#lp-animate-colors");
      const staticColorsInput = panel.querySelector("#lp-static-colors");
      const mapColorInput = panel.querySelector("#lp-map-color");
      const lootColorInput = panel.querySelector("#lp-loot-color");
      const itemColorInput = panel.querySelector("#lp-item-color");

      animateColorsInput.addEventListener("change", e => {
        if (e.target.checked) {
          state.settings.animateColors = true;
          state.settings.staticColors = false;
        } else {
          e.target.checked = true;
          return;
        }
        saveSettings();
        updateCssVars();
        syncUiFromSettings();
      });

      staticColorsInput.addEventListener("change", e => {
        if (e.target.checked) {
          state.settings.staticColors = true;
          state.settings.animateColors = false;
        } else {
          e.target.checked = true;
          return;
        }
        saveSettings();
        updateCssVars();
        syncUiFromSettings();
      });

      mapColorInput.addEventListener("input", e => {
        state.settings.mapColor = e.target.value;
        saveSettings();
        updateCssVars();
      });

      lootColorInput.addEventListener("input", e => {
        state.settings.lootColor = e.target.value;
        saveSettings();
        updateCssVars();
      });

      itemColorInput.addEventListener("input", e => {
        state.settings.itemColor = e.target.value;
        saveSettings();
        updateCssVars();
      });

      const glowSizeControl = panel.querySelector("#lp-glow-size");
      const glowSizeLabel = panel.querySelector("#lp-glow-size-value");

      glowSizeControl.addEventListener("input", e => {
        const value = Math.max(40, Math.min(200, Number(e.target.value) || 100));
        state.settings.glowSize = value;
        glowSizeLabel.textContent = `${value}%`;
        saveSettings();
        updateGlowSize();
      });

      const customSoundInput = panel.querySelector("#lp-custom-sound");
      const customSoundVolume = panel.querySelector("#lp-custom-sound-volume");
      const customSoundVolumeValue = panel.querySelector("#lp-custom-sound-volume-value");

      customSoundInput.addEventListener("change", e => {
        state.settings.customSound = e.target.value.trim();
        saveSettings();
      });

      customSoundVolume.addEventListener("input", e => {
        const value = Math.max(0, Math.min(100, Number(e.target.value) || 0));
        state.settings.customSoundVolume = value;
        customSoundVolumeValue.textContent = `${value}%`;
        saveSettings();
      });

      panel.querySelector("#lp-test-sound").addEventListener("click", () => {
        playLegendSound(true);
      });

      panel.querySelector("#lp-clear-sound").addEventListener("click", () => {
        state.settings.customSound = "";
        customSoundInput.value = "";
        saveSettings();
      });

      const panelBody = panel.querySelector(".lp-panel-body");

      if (panelBody) {
        const handlePanelWheel = event => {
          event.stopPropagation();
          event.preventDefault();

          let delta = event.deltaY;

          if (!Number.isFinite(delta) || delta === 0) {
            delta = event.wheelDelta ? -event.wheelDelta : 0;
          }

          panelBody.scrollTop += delta;
        };

        panelBody.addEventListener("wheel", handlePanelWheel, {
          passive: false,
          capture: true
        });

        panelBody.addEventListener("mousewheel", handlePanelWheel, {
          passive: false,
          capture: true
        });
      }

      makeDraggable(panel, panel.querySelector(".lp-panel-head"));
    }
  }

  function checkboxRow(key, label) {
    return `
      <label class="lp-setting">
        <span>${esc(label)}</span>
        <input type="checkbox" data-lp-setting="${key}" ${state.settings[key] ? "checked" : ""}>
      </label>
    `;
  }

  function syncUiFromSettings() {
    const panel = document.getElementById("lp-settings");
    if (!panel) return;

    panel.querySelectorAll("[data-lp-setting]").forEach(input => {
      input.checked = !!state.settings[input.dataset.lpSetting];
    });

    const shakeStrengthWrap = panel.querySelector("#lp-screen-shake-strength-wrap");
    const shakeStrengthInput = panel.querySelector("#lp-screen-shake-strength");
    const shakeStrengthValue = panel.querySelector("#lp-screen-shake-strength-value");
    const shakeStrength = Math.max(10, Math.min(200, Number(state.settings.screenShakeStrength ?? 100)));
    if (shakeStrengthWrap) shakeStrengthWrap.style.display = state.settings.screenShake ? "block" : "none";
    if (shakeStrengthInput) shakeStrengthInput.value = String(shakeStrength);
    if (shakeStrengthValue) shakeStrengthValue.textContent = `${Math.round(shakeStrength)}%`;

    panel.querySelector("#lp-clanText").value = state.settings.clanText;

    panel.querySelectorAll(".lp-palette-card").forEach(button => {
      button.classList.toggle("active", button.dataset.palette === state.settings.palette);
    });

    const useCustomPaletteInput = panel.querySelector("#lp-use-custom-palette");
    const customPaletteInputs = [
      panel.querySelector("#lp-custom-palette-1"),
      panel.querySelector("#lp-custom-palette-2"),
      panel.querySelector("#lp-custom-palette-3"),
      panel.querySelector("#lp-custom-palette-4")
    ];
    const customPaletteGrid = panel.querySelector(".lp-custom-palette-grid");

    if (useCustomPaletteInput) {
      useCustomPaletteInput.checked = !!state.settings.useCustomPalette;
      useCustomPaletteInput.disabled = !!state.settings.staticColors;
    }
    customPaletteInputs.forEach((input, index) => {
      if (input) input.value = state.settings[`customPalette${index + 1}`];
    });
    customPaletteGrid?.classList.toggle("disabled", !state.settings.useCustomPalette);

    const animateColorsInput = panel.querySelector("#lp-animate-colors");
    const staticColorsInput = panel.querySelector("#lp-static-colors");
    const staticColorsSection = panel.querySelector(".lp-static-colors-section");
    const mapColorInput = panel.querySelector("#lp-map-color");
    const lootColorInput = panel.querySelector("#lp-loot-color");
    const itemColorInput = panel.querySelector("#lp-item-color");
    const paletteSection = panel.querySelector(".lp-palette-section");

    if (animateColorsInput) {
      animateColorsInput.checked = !!state.settings.animateColors;
      animateColorsInput.disabled = false;
    }
    if (staticColorsInput) {
      staticColorsInput.checked = !!state.settings.staticColors;
      staticColorsInput.disabled = false;
    }
    if (mapColorInput) mapColorInput.value = state.settings.mapColor;
    if (lootColorInput) lootColorInput.value = state.settings.lootColor;
    if (itemColorInput) itemColorInput.value = state.settings.itemColor;
    paletteSection?.classList.toggle("disabled", !state.settings.animateColors);
    staticColorsSection?.classList.toggle("disabled", !state.settings.staticColors);

    const glowSizeSync = panel.querySelector("#lp-glow-size");
    const glowSizeValueSync = panel.querySelector("#lp-glow-size-value");

    if (glowSizeSync) glowSizeSync.value = Number(state.settings.glowSize ?? 100);
    if (glowSizeValueSync) glowSizeValueSync.textContent = `${Number(state.settings.glowSize ?? 100)}%`;

    const customSoundInput = panel.querySelector("#lp-custom-sound");
    const customSoundVolume = panel.querySelector("#lp-custom-sound-volume");
    const customSoundVolumeValue = panel.querySelector("#lp-custom-sound-volume-value");

    if (customSoundInput) customSoundInput.value = state.settings.customSound || "";
    if (customSoundVolume) customSoundVolume.value = Number(state.settings.customSoundVolume ?? 100);
    if (customSoundVolumeValue) customSoundVolumeValue.textContent = `${Number(state.settings.customSoundVolume ?? 100)}%`;
  }

  function updateGlowSize() {
    const percent = Math.max(40, Math.min(200, Number(state.settings.glowSize ?? 100)));
    const glowScale = percent / 100;

    document.documentElement.style.setProperty("--lp-glow-scale", String(glowScale));

    const glowIntensity = 0.5 + (glowScale * 0.5);
    document.documentElement.style.setProperty("--lp-glow-intensity", String(glowIntensity));
  }

  function updateCssVars() {
    updateGlowSize();
    const palette = getActivePaletteColors();

    const uiAccent = state.settings.staticColors
      ? (state.settings.mapColor || "#ffd35a")
      : palette[0];
    const uiAccent2 = state.settings.staticColors
      ? (state.settings.lootColor || state.settings.mapColor || "#ff9f1c")
      : palette[1];

    state.settings.accent = uiAccent;
    state.settings.accent2 = uiAccent2;

    document.documentElement.style.setProperty("--lp-accent", uiAccent);
    document.documentElement.style.setProperty("--lp-accent2", uiAccent2);

    const setSeries = (prefix, colors) => {
      document.documentElement.style.setProperty(`--lp-${prefix}1`, colors[0]);
      document.documentElement.style.setProperty(`--lp-${prefix}2`, colors[1]);
      document.documentElement.style.setProperty(`--lp-${prefix}3`, colors[2]);
      document.documentElement.style.setProperty(`--lp-${prefix}4`, colors[3]);
    };

    if (!state.settings.staticColors && state.settings.animateColors) {
      setSeries("map", palette);
      setSeries("loot", palette);
      setSeries("item", palette);
    } else {
      setSeries("map", [state.settings.mapColor, state.settings.mapColor, state.settings.mapColor, state.settings.mapColor]);
      setSeries("loot", [state.settings.lootColor, state.settings.lootColor, state.settings.lootColor, state.settings.lootColor]);
      setSeries("item", [state.settings.itemColor, state.settings.itemColor, state.settings.itemColor, state.settings.itemColor]);
    }
  }

  function setPanel(visible) {
    state.panelVisible = visible;
    document.getElementById("lp-settings")?.classList.toggle("visible", visible);
  }

  function togglePanel() {
    setPanel(!state.panelVisible);
  }

  function restoreMiniWidgetPosition(button) {
    if (!button) return;

    const x = state.settings.widgetX;
    const y = state.settings.widgetY;

    const hasSavedPosition =
      typeof x === "number" &&
      Number.isFinite(x) &&
      typeof y === "number" &&
      Number.isFinite(y);

    if (!hasSavedPosition) return;

    const maxX = Math.max(0, window.innerWidth - button.offsetWidth);
    const maxY = Math.max(0, window.innerHeight - button.offsetHeight);

    const left = Math.max(0, Math.min(maxX, x));
    const top = Math.max(0, Math.min(maxY, y));

    button.style.left = `${Math.round(left)}px`;
    button.style.top = `${Math.round(top)}px`;
    button.style.right = "auto";
    button.style.bottom = "auto";
  }

  function makeMiniWidgetDraggable(button) {
    if (!button || button.dataset.lpMiniDragReady === "1") return;
    button.dataset.lpMiniDragReady = "1";

    let dragging = false;
    let moved = false;
    let startMouseX = 0;
    let startMouseY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onMouseMove = e => {
      if (!dragging) return;

      const dx = e.clientX - startMouseX;
      const dy = e.clientY - startMouseY;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        moved = true;
      }

      const maxX = Math.max(0, window.innerWidth - button.offsetWidth);
      const maxY = Math.max(0, window.innerHeight - button.offsetHeight);

      const left = Math.max(0, Math.min(maxX, startLeft + dx));
      const top = Math.max(0, Math.min(maxY, startTop + dy));

      button.style.left = `${Math.round(left)}px`;
      button.style.top = `${Math.round(top)}px`;
      button.style.right = "auto";
      button.style.bottom = "auto";
    };

    const onMouseUp = e => {
      if (!dragging) return;

      dragging = false;
      button.style.cursor = "grab";

      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("mouseup", onMouseUp, true);

      if (moved) {
        const rect = button.getBoundingClientRect();

        state.settings.widgetX = Math.round(rect.left);
        state.settings.widgetY = Math.round(rect.top);
        saveSettings();

        button.dataset.lpJustDragged = "1";

        setTimeout(() => {
          delete button.dataset.lpJustDragged;
        }, 100);
      }

      e.preventDefault();
      e.stopPropagation();
    };

    button.addEventListener("mousedown", e => {
      if (e.button !== 0) return;

      const rect = button.getBoundingClientRect();

      dragging = true;
      moved = false;
      startMouseX = e.clientX;
      startMouseY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;

      button.style.left = `${Math.round(rect.left)}px`;
      button.style.top = `${Math.round(rect.top)}px`;
      button.style.right = "auto";
      button.style.bottom = "auto";
      button.style.cursor = "grabbing";

      window.addEventListener("mousemove", onMouseMove, true);
      window.addEventListener("mouseup", onMouseUp, true);

      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  function makeDraggable(element, handle) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener("mousedown", e => {
      if (e.button !== 0) return;

      if (e.target.closest("button, input, select, textarea, a")) return;

      const rect = element.getBoundingClientRect();

      dragging = true;
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;

      element.style.left = `${Math.round(rect.left)}px`;
      element.style.top = `${Math.round(rect.top)}px`;
      element.style.right = "auto";

      e.preventDefault();
    });

    window.addEventListener("mousemove", e => {
      if (!dragging) return;
      const maxX = window.innerWidth - element.offsetWidth;
      const maxY = window.innerHeight - element.offsetHeight;
      element.style.left = `${Math.max(0, Math.min(maxX, e.clientX - offsetX))}px`;
      element.style.top = `${Math.max(0, Math.min(maxY, e.clientY - offsetY))}px`;
    });

    window.addEventListener("mouseup", () => {
      dragging = false;
    });
  }

  function isLegendary(item) {
    if (!item) return false;

    const stat = String(item.stat || "");
    if (stat.includes("rarity=legendary")) return true;

    return String(item._cachedStats?.rarity || "").toLowerCase() === "legendary";
  }

  function getItemKey(item) {
    return String(item.id ?? item.lootId ?? item.hid ?? `${item.name}-${item.stat}`);
  }

  function isSyntheticTestItem(item) {
    return String(item?.id ?? item?.lootId ?? "").startsWith("lp-test-");
  }

  function isNewInterface() {
    return !!pageWindow.Engine?.items?.fetchLocationItems;
  }

  function isOldInterface() {
    return !isNewInterface() && !!pageWindow.g?.item;
  }

  function getLootItems() {
    try {
      if (isNewInterface()) {
        const manager = pageWindow.Engine.items;
        const regularLoot = manager.fetchLocationItems("l") || [];
        const colossusLoot = manager.fetchLocationItems("k") || [];
        return [...regularLoot, ...colossusLoot];
      }

      if (isOldInterface()) {
        return Object.values(pageWindow.g.item || {}).filter(item =>
          item && (item.loc === "l" || item.loc === "k")
        );
      }

      return [];
    } catch (e) {
      console.warn("[Legendary Pulse] Nie udało się pobrać lootu:", e);
      return [];
    }
  }

  function scanLoot() {
    if (!state.settings.enabled) return;

    const items = getLootItems();
    const newLegendaries = [];

    for (const item of items) {
      const key = getItemKey(item);

      if (state.seen.has(key)) continue;
      state.seen.add(key);

      if (Date.now() - state.startedAt < 1200) continue;

      if (isLegendary(item)) {
        newLegendaries.push(item);
        notify(item, false, true);
      }
    }

    if (newLegendaries.length > 0 && state.settings.clanMessage) {
      void sendClanMessage(newLegendaries);
    }

    if (state.seen.size > 1500) {
      state.seen = new Set(Array.from(state.seen).slice(-700));
    }
  }

  function findExactLegendLootElement(item) {
    if (!item) return null;

    const ids = [item.lootId, item.id, item.itemId]
      .filter(v => v !== undefined && v !== null && String(v).length > 0)
      .map(v => String(v));

    if (!ids.length) return null;

    if (isOldInterface()) {
      for (const id of ids) {
        const found = document.getElementById(`loot${id}`);
        if (found && found.closest("#loots")) return found;
      }
      return null;
    }

    const lootWindows = [...document.querySelectorAll(".loot-window")];
    for (const lootWindow of lootWindows) {
      for (const id of ids) {
        const safe = window.CSS?.escape ? CSS.escape(id) : id.replace(/["\\]/g, "\\$&");
        const selectors = [
          `.loot-item-wrapper-${safe}`,
          `.loot-item[data-id="${safe}"]`,
          `.loot-item[data-item-id="${safe}"]`,
          `.loot-item[data-itemid="${safe}"]`,
          `[data-id="${safe}"].loot-item`,
          `[data-item-id="${safe}"].loot-item`,
          `[data-id="${safe}"].slot`,
          `[data-item-id="${safe}"].slot`
        ];

        for (const selector of selectors) {
          const found = lootWindow.querySelector(selector);
          if (!found) continue;
          return found.closest(`[class*="loot-item-wrapper-"]`) || found.closest(".loot-item") || found;
        }

        for (const wrapper of lootWindow.querySelectorAll('[class*="loot-item-wrapper-"]')) {
          const match = String(wrapper.className || "").match(/(?:^|\s)loot-item-wrapper-(\d+)(?:\s|$)/);
          if (match && match[1] === id) return wrapper;
        }
      }
    }

    return null;
  }
  function getLegendBurstTarget(item) {
    const wrapper = findExactLegendLootElement(item);
    if (!wrapper) return null;

    const visualElement =
      wrapper.querySelector(".slot .item img.icon") ||
      wrapper.querySelector(".slot .item img") ||
      wrapper.querySelector(".slot img") ||
      wrapper.querySelector(".item img") ||
      wrapper.querySelector("img") ||
      wrapper.querySelector(".item") ||
      wrapper.querySelector(".slot .item") ||
      wrapper.querySelector(".slot") ||
      wrapper;

    if (!visualElement) return null;

    const rect = visualElement.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;

    return {
      element: visualElement,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  function renderBurstAt(x, y) {
    document.querySelectorAll("#lp-burst-layer").forEach(el => el.remove());

    const layer = document.createElement("div");
    layer.id = "lp-burst-layer";
    layer.style.left = `${Math.round(x)}px`;
    layer.style.top = `${Math.round(y)}px`;

    const core = document.createElement("div");
    core.className = "lp-burst-core";

    const ring = document.createElement("div");
    ring.className = "lp-burst-ring";

    layer.append(core, ring);

    const colors = state.settings.animateColors
      ? getActivePaletteColors().slice(0, 3)
      : [
          state.settings.mapColor || "#ffd35a",
          state.settings.lootColor || "#ff9f1c",
          state.settings.itemColor || "#c544ff"
        ];

    const particleCount = 34;

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement("span");
      particle.className = "lp-burst-particle";

      const angle = (Math.PI * 2 * i / particleCount) + (Math.random() - .5) * .18;
      const distance = 95 + Math.random() * 165;
      const px = Math.cos(angle) * distance;
      const py = Math.sin(angle) * distance;
      const size = 3 + Math.random() * 6;
      const duration = 760 + Math.random() * 520;
      const delay = Math.random() * 90;
      const colorIndex = i % 3;
      const nextColorIndex = (colorIndex + 1) % 3;

      particle.style.setProperty("--lp-particle-x", `${px.toFixed(1)}px`);
      particle.style.setProperty("--lp-particle-y", `${py.toFixed(1)}px`);
      particle.style.setProperty("--lp-particle-size", `${size.toFixed(1)}px`);
      particle.style.setProperty("--lp-particle-duration", `${Math.round(duration)}ms`);
      particle.style.setProperty("--lp-particle-delay", `${Math.round(delay)}ms`);
      particle.style.setProperty("--lp-particle-color", colors[colorIndex]);
      particle.style.setProperty("--lp-particle-color2", colors[nextColorIndex]);

      layer.appendChild(particle);
    }

    document.body.appendChild(layer);

    window.setTimeout(() => {
      layer.remove();
    }, 1550);
  }

  function playBurstAnimation(item) {
    if (!state.settings.burstAnimation) return;

    const startedAt = performance.now();

    const tryPlaceBurst = () => {
      if (!state.settings.burstAnimation) return;

      const target = getLegendBurstTarget(item);

      if (target) {
        requestAnimationFrame(() => {
          const freshTarget = getLegendBurstTarget(item);
          if (!freshTarget) return;
          renderBurstAt(freshTarget.x, freshTarget.y);
        });
        return;
      }

      if (performance.now() - startedAt < 2000) {
        window.setTimeout(tryPlaceBurst, 40);
      } else {
        console.warn("[Legendary Pulse] Nie znaleziono pozycji legendy dla animacji:", item);
      }
    };

    tryPlaceBurst();
  }

  function playLegendLightning(item) {
    if (!state.settings.legendaryLightning) return;

    const startedAt = performance.now();

    const tryPlaceLightning = () => {
      if (!state.settings.legendaryLightning) return;

      const target = getLegendBurstTarget(item);

      if (target) {
        requestAnimationFrame(() => {
          const freshTarget = getLegendBurstTarget(item);
          if (!freshTarget) return;

          const rect = getGameAreaRect();
          if (!rect || rect.width < 80 || rect.height < 80) return;

          document.getElementById("lp-legend-lightning")?.remove();

          const layer = document.createElement("div");
          layer.id = "lp-legend-lightning";
          layer.style.left = `${Math.round(rect.left)}px`;
          layer.style.top = `${Math.round(rect.top)}px`;
          layer.style.width = `${Math.round(rect.width)}px`;
          layer.style.height = `${Math.round(rect.height)}px`;

          const w = Math.max(1, rect.width);
          const h = Math.max(1, rect.height);
          const tx = freshTarget.x - rect.left;
          const ty = freshTarget.y - rect.top;

          const bolts = [];
          const branches = [];

          const p = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;

          const starts = [
            [Math.max(8, tx - w * (.25 + Math.random() * .22)), 0],
            [Math.min(w - 8, tx + w * (.22 + Math.random() * .24)), 0],
            [0, Math.max(8, ty - h * (.10 + Math.random() * .24))],
            [w, Math.min(h - 8, ty + h * (.05 + Math.random() * .24))],

            [Math.max(8, tx - w * (.18 + Math.random() * .20)), h],
            [Math.min(w - 8, tx + w * (.18 + Math.random() * .20)), h]
          ];

          starts.forEach(([sx, sy], boltIndex) => {
            const distance = Math.hypot(tx - sx, ty - sy);
            const segments = Math.max(12, Math.min(22, Math.round(distance / 42)));
            const dirX = (tx - sx) / Math.max(1, distance);
            const dirY = (ty - sy) / Math.max(1, distance);
            const normalX = -dirY;
            const normalY = dirX;

            let d = `M ${p(sx, sy)}`;
            let prevX = sx;
            let prevY = sy;
            let zigSign = Math.random() < .5 ? -1 : 1;

            for (let i = 1; i <= segments; i++) {
              const t = i / segments;
              const baseX = sx + (tx - sx) * t;
              const baseY = sy + (ty - sy) * t;

              const envelope = Math.sin(Math.PI * t) * (1 - t * .28);
              const major = (11 + Math.random() * 21) * envelope * zigSign;
              const minor = (Math.random() - .5) * 8 * envelope;

              let x = baseX + normalX * (major + minor) + dirX * ((Math.random() - .5) * 7);
              let y = baseY + normalY * (major + minor) + dirY * ((Math.random() - .5) * 7);

              if (i === segments) {
                x = tx;
                y = ty;
              }

              d += ` L ${p(x, y)}`;

              if (i > 1 && i < segments - 2 && Math.random() < .42) {
                const localDx = x - prevX;
                const localDy = y - prevY;
                const localLen = Math.hypot(localDx, localDy) || 1;
                const lx = localDx / localLen;
                const ly = localDy / localLen;
                const lnx = -ly;
                const lny = lx;
                const side = Math.random() < .5 ? -1 : 1;
                const branchLen = 20 + Math.random() * 55;

                const midX = x + lx * branchLen * .38 + lnx * branchLen * side * (.22 + Math.random() * .28);
                const midY = y + ly * branchLen * .38 + lny * branchLen * side * (.22 + Math.random() * .28);
                const bx = x + lx * branchLen * .72 + lnx * branchLen * side * (.45 + Math.random() * .38);
                const by = y + ly * branchLen * .72 + lny * branchLen * side * (.45 + Math.random() * .38);

                branches.push(`M ${p(x, y)} L ${p(midX, midY)} L ${p(bx, by)}`);

                if (Math.random() < .38) {
                  const forkSide = -side;
                  const fx = midX + lx * branchLen * .32 + lnx * branchLen * forkSide * (.22 + Math.random() * .25);
                  const fy = midY + ly * branchLen * .32 + lny * branchLen * forkSide * (.22 + Math.random() * .25);
                  branches.push(`M ${p(midX, midY)} L ${p(fx, fy)}`);
                }
              }

              prevX = x;
              prevY = y;
              zigSign *= -1;
              if (Math.random() < .20) zigSign *= -1;
            }

            bolts.push(d);
          });

          const main = bolts.map(d => `<path d="${d}"/>`).join("");
          const branchMarkup = branches.map(d => `<path d="${d}"/>`).join("");

          layer.innerHTML = `
            <svg viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}" preserveAspectRatio="none" aria-hidden="true">
              <g class="lp-bolt-shadow">${main}</g>
              <g class="lp-bolt-color">${main}</g>
              <g class="lp-bolt-main">${main}</g>
              <g class="lp-bolt-branch">${branchMarkup}</g>
            </svg>
            <div class="lp-lightning-impact" style="left:${tx.toFixed(1)}px;top:${ty.toFixed(1)}px;"></div>
          `;

          document.body.appendChild(layer);
          void layer.offsetWidth;
          layer.classList.add("active");

          window.setTimeout(() => layer.remove(), 850);
        });
        return;
      }

      if (performance.now() - startedAt < 2000) {
        window.setTimeout(tryPlaceLightning, 40);
      } else {
        console.warn("[Legendary Pulse] Nie znaleziono pozycji legendy dla błyskawic:", item);
      }
    };

    tryPlaceLightning();
  }

  function playScreenCrack(item) {
    if (!state.settings.screenCrack) return;

    const startedAt = performance.now();

    const tryPlaceCrack = () => {
      if (!state.settings.screenCrack) return;

      const target = getLegendBurstTarget(item);

      if (target) {
        requestAnimationFrame(() => {
          const freshTarget = getLegendBurstTarget(item);
          if (!freshTarget) return;

          document.getElementById("lp-screen-crack")?.remove();

          const layer = document.createElement("div");
          layer.id = "lp-screen-crack";
          layer.style.left = "0px";
          layer.style.top = "0px";
          layer.style.width = `${Math.round(window.innerWidth)}px`;
          layer.style.height = `${Math.round(window.innerHeight)}px`;

          const w = Math.max(1, window.innerWidth);
          const h = Math.max(1, window.innerHeight);

          const cx = freshTarget.x;
          const cy = freshTarget.y;
          const maxRadius = Math.min(w, h) * 0.47;

          const paths = [];
          const finePaths = [];
          const branches = 11;
          const point = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;

          for (let i = 0; i < branches; i++) {
            const baseAngle = (Math.PI * 2 * i / branches) + (Math.random() - .5) * .28;
            const steps = 5 + Math.floor(Math.random() * 3);
            const reach = maxRadius * (0.62 + Math.random() * 0.48);

            let x = cx;
            let y = cy;
            let d = `M ${point(x, y)}`;

            for (let s = 1; s <= steps; s++) {
              const t = s / steps;
              const angle = baseAngle + (Math.random() - .5) * .25;
              const r = reach * t;
              x = cx + Math.cos(angle) * r + (Math.random() - .5) * 12;
              y = cy + Math.sin(angle) * r + (Math.random() - .5) * 12;
              d += ` L ${point(x, y)}`;

              if (s >= 2 && s < steps && Math.random() < .72) {
                const side = Math.random() < .5 ? -1 : 1;
                const sideAngle = angle + side * (.45 + Math.random() * .48);
                const sideLen = 20 + Math.random() * 58;
                const bx = x + Math.cos(sideAngle) * sideLen;
                const by = y + Math.sin(sideAngle) * sideLen;

                finePaths.push(
                  `M ${point(x, y)} L ${point(
                    x + Math.cos(sideAngle) * sideLen * .48 + (Math.random() - .5) * 5,
                    y + Math.sin(sideAngle) * sideLen * .48 + (Math.random() - .5) * 5
                  )} L ${point(bx, by)}`
                );
              }
            }

            paths.push(d);
          }

          for (let ring = 0; ring < 3; ring++) {
            const radius = 14 + ring * 15 + Math.random() * 5;
            let d = "";
            const segments = 12;

            for (let i = 0; i <= segments; i++) {
              const a = Math.PI * 2 * i / segments;
              const rr = radius * (.78 + Math.random() * .34);
              const x = cx + Math.cos(a) * rr;
              const y = cy + Math.sin(a) * rr;
              d += `${i === 0 ? "M" : " L"} ${point(x, y)}`;
            }

            finePaths.push(d);
          }

          const mainMarkup = paths.map(d => `<path d="${d}"/>`).join("");
          const fineMarkup = finePaths.map(d => `<path d="${d}"/>`).join("");

          layer.innerHTML = `
            <svg viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}" preserveAspectRatio="none" aria-hidden="true">
              <g class="lp-crack-shadow">${mainMarkup}</g>
              <g class="lp-crack-main">${mainMarkup}</g>
              <g class="lp-crack-fine">${fineMarkup}</g>
              <circle class="lp-crack-impact" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5"/>
            </svg>
          `;

          document.body.appendChild(layer);
          void layer.offsetWidth;
          layer.classList.add("active");

          window.setTimeout(() => layer.remove(), 1000);
        });

        return;
      }

      if (performance.now() - startedAt < 2000) {
        window.setTimeout(tryPlaceCrack, 40);
      } else {
        console.warn("[Legendary Pulse] Nie znaleziono pozycji legendy dla pęknięcia:", item);
      }
    };

    tryPlaceCrack();
  }

  function playScreenShake() {
    if (!state.settings.screenShake) return;

    const target =
      (isOldInterface() ? (document.getElementById("base") || document.getElementById("centerbox")) : null) ||
      document.querySelector(".game-window-positioner") ||
      document.querySelector("#GAME_CANVAS") ||
      document.querySelector("canvas");

    if (!target) return;

    const oldAnimation = target.style.animation;
    const oldWillChange = target.style.willChange;

    const shakeStrength = Math.max(10, Math.min(200, Number(state.settings.screenShakeStrength ?? 100))) / 100;
    target.style.setProperty("--lp-shake-strength", String(shakeStrength));

    target.style.animation = "none";
    void target.offsetWidth;
    target.style.willChange = "transform";
    target.style.animation = "lp-screen-shake 420ms ease-out 1";

    setTimeout(() => {
      target.style.animation = oldAnimation;
      target.style.willChange = oldWillChange;
    }, 450);
  }

  function notify(item, testMode, suppressClanMessage = false) {
    playScreenShake();
    playScreenCrack(item);
    playLegendLightning(item);
    state.lastDetectedAt = Date.now();

    if (testMode) {
      startLootTimedEffects(item);
    } else {
      startLootTimedEffects(item);
    }

    if (state.settings.burstAnimation) {
      playBurstAnimation(item);
    }

    if (state.settings.sound) {
      playLegendSound();
    }

    if (state.settings.centerMessage) {
      sendCenterMessage(item);
    }

    if (state.settings.clanMessage) {
      if (testMode) {
        sendClanTestMessage(item?.name || "Testowy przedmiot legendarny");
      } else if (!suppressClanMessage) {
        void sendClanMessage([item]);
      }
    }

    console.info("[Legendary Pulse] Wykryto legendę:", item);
  }

  function getGameAreaRect() {
    if (isOldInterface()) {
      const base = document.getElementById("base");
      if (base) {
        const rect = base.getBoundingClientRect();
        if (rect.width >= 300 && rect.height >= 250) return rect;
      }
    }

    let expected = null;

    try {
      if (typeof pageWindow.Engine?.getCanvasViewSize === "function") {
        expected = pageWindow.Engine.getCanvasViewSize();
      }
    } catch {}

    const canvases = [...document.querySelectorAll("canvas")]
      .map(canvas => ({ canvas, rect: canvas.getBoundingClientRect() }))
      .filter(({ rect }) =>
        rect.width >= 300 &&
        rect.height >= 250 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth
      );

    if (canvases.length) {
      let best = null;
      let bestScore = Infinity;

      for (const entry of canvases) {
        const { canvas, rect } = entry;

        let score = 0;

        if (expected?.width && expected?.height) {
          score += Math.abs(rect.width - expected.width);
          score += Math.abs(rect.height - expected.height);
        } else {
          score -= rect.width * rect.height / 10000;
        }

        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        score += Math.abs(cx - window.innerWidth / 2) * 0.08;
        score += Math.abs(cy - window.innerHeight / 2) * 0.08;

        if (canvas.width < 300 || canvas.height < 250) score += 10000;

        if (score < bestScore) {
          bestScore = score;
          best = rect;
        }
      }

      if (best) return best;
    }

    const positioner = document.querySelector(".game-window-positioner");
    if (positioner) {
      const rect = positioner.getBoundingClientRect();
      if (rect.width >= 300 && rect.height >= 250) return rect;
    }

    return null;
  }

  function positionFlashToGameArea() {
    const flash = document.getElementById("lp-screen-flash");
    if (!flash) return false;

    if (isOldInterface()) {
      const base = document.getElementById("base");
      if (!base) return false;
      const rect = base.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;

      if (flash.parentElement !== document.body) document.body.appendChild(flash);
      flash.classList.remove("map-overlay");
      flash.style.setProperty("position", "fixed", "important");
      flash.style.setProperty("left", `${Math.round(rect.left)}px`, "important");
      flash.style.setProperty("top", `${Math.round(rect.top)}px`, "important");
      flash.style.setProperty("width", `${Math.round(rect.width)}px`, "important");
      flash.style.setProperty("height", `${Math.round(rect.height)}px`, "important");
      flash.style.setProperty("right", "auto", "important");
      flash.style.setProperty("bottom", "auto", "important");
      flash.style.setProperty("z-index", "448", "important");
      flash.style.setProperty("display", "block");
      flash.style.setProperty("background", "transparent");
      flash.style.setProperty("pointer-events", "none");
      return true;
    }

    const gameLayer = document.querySelector(".game-layer");
    if (!gameLayer) return false;
    if (flash.parentElement !== gameLayer) gameLayer.appendChild(flash);
    flash.classList.add("map-overlay");
    flash.style.removeProperty("position");
    flash.style.removeProperty("left");
    flash.style.removeProperty("top");
    flash.style.removeProperty("right");
    flash.style.removeProperty("bottom");
    flash.style.removeProperty("width");
    flash.style.removeProperty("height");
    flash.style.setProperty("z-index", "11");
    flash.style.setProperty("display", "block");
    flash.style.setProperty("background", "transparent");
    flash.style.setProperty("pointer-events", "none");
    return true;
  }
  function findLootWindow(item = window.__lpCurrentLegendItem) {
    if (isOldInterface()) {
      const loots = document.getElementById("loots");
      if (!loots) return null;
      const rect = loots.getBoundingClientRect();
      const style = getComputedStyle(loots);
      if (rect.width <= 0 || rect.height <= 0 || style.display === "none" || style.visibility === "hidden") return null;
      if (item && !findExactLegendLootElement(item)) return null;
      return loots;
    }

    const exact = item ? findExactLegendLootElement(item) : null;
    if (exact) {
      const exactWindow = exact.closest(".loot-window");
      if (exactWindow) return exactWindow;
    }

    if (item) return null;

    for (const loot of document.querySelectorAll(".loot-window")) {
      const rect = loot.getBoundingClientRect();
      const style = getComputedStyle(loot);
      if (rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden") return loot;
    }
    return null;
  }
  function parseLootRemainingMs(lootWindow) {
    if (!lootWindow) return null;

    const text = String(lootWindow.innerText || lootWindow.textContent || "")
      .replace(/\s+/g, " ")
      .trim();

    const mmss = [...text.matchAll(/(?:^|\s)(\d{1,2}):(\d{2})(?:\s|$)/g)]
      .map(match => {
        const minutes = Number(match[1]);
        const seconds = Number(match[2]);
        return (minutes * 60 + seconds) * 1000;
      })
      .filter(ms => ms >= 0 && ms <= 5 * 60 * 1000);

    if (mmss.length) {
      return Math.min(...mmss);
    }

    const secondValues = [...text.matchAll(/(?:^|\s)(\d{1,3})\s*(?:s|sek\.?|sekund(?:y|a|ę)?)(?:\s|$)/gi)]
      .map(match => Number(match[1]) * 1000)
      .filter(ms => ms >= 0 && ms <= 5 * 60 * 1000);

    if (secondValues.length) {
      return Math.min(...secondValues);
    }

    const timedElements = [...lootWindow.querySelectorAll(
      "[data-time], [data-time-left], [data-seconds], [aria-valuenow]"
    )];

    for (const el of timedElements) {
      for (const value of [
        el.getAttribute("data-time-left"),
        el.getAttribute("data-seconds"),
        el.getAttribute("data-time"),
        el.getAttribute("aria-valuenow")
      ]) {
        if (value == null) continue;

        const number = Number(String(value).replace(",", "."));
        if (!Number.isFinite(number) || number <= 0) continue;

        if (number <= 300) return number * 1000;
        if (number <= 300000) return number;
      }
    }

    return null;
  }

  function getLootBorderWindow(lootWindow) {
    if (!lootWindow) return null;
    if (isOldInterface() && lootWindow.id === "loots") return lootWindow;
    return lootWindow.closest(".border-window") || lootWindow.parentElement;
  }

  function showLootWindowGlow(lootWindow) {
    const borderWindow = getLootBorderWindow(lootWindow);
    if (!borderWindow) return;

    if (isOldInterface() && lootWindow.id === "loots") {
      borderWindow.classList.remove("lp-loot-window-glow");
      borderWindow.style.removeProperty("animation");
      borderWindow.style.removeProperty("filter");
      borderWindow.style.removeProperty("box-shadow");

      let overlay = document.getElementById("lp-si-loot-glow-overlay");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "lp-si-loot-glow-overlay";
        document.body.appendChild(overlay);
      }

      const rect = lootWindow.getBoundingClientRect();
      overlay.style.left = `${rect.left}px`;
      overlay.style.top = `${rect.top}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      overlay.style.display = rect.width > 0 && rect.height > 0 ? "block" : "none";
      return;
    }

    borderWindow.style.setProperty("z-index", "2147483636", "important");
    borderWindow.classList.add("lp-loot-window-glow");
  }

  function hideLootWindowGlow() {
    document.getElementById("lp-si-loot-glow-overlay")?.remove();
    document.querySelectorAll(".lp-loot-window-glow").forEach(element => {
      element.classList.remove("lp-loot-window-glow");
      element.style.removeProperty("animation");
      element.style.removeProperty("animation-delay");
      element.style.removeProperty("filter");
      element.style.removeProperty("box-shadow");
    });
  }

  function stopLootTimedEffects() {
    if (state.lootEffectTimer) {
      clearInterval(state.lootEffectTimer);
      state.lootEffectTimer = null;
    }

    state.lootEffectDeadline = 0;
    state.__animationsSynced = false;
    window.__lpCurrentLegendItem = null;

    const flash = document.getElementById("lp-screen-flash");
    if (flash) {
      flash.classList.remove("active");
      flash.style.removeProperty("animation");
      flash.style.removeProperty("animation-delay");
    }

    document.getElementById("lp-si-loot-glow-overlay")?.remove();

    document.querySelectorAll(".lp-loot-window-glow").forEach(element => {
      element.classList.remove("lp-loot-window-glow");
      element.style.removeProperty("animation");
      element.style.removeProperty("animation-delay");
      element.style.removeProperty("filter");
      element.style.removeProperty("box-shadow");
    });

    for (const element of state.activeGlowElements) {
      if (!element) continue;

      element.classList.remove("lp-loot-glow");
      element.style.removeProperty("animation");
      element.style.removeProperty("animation-delay");
      element.style.removeProperty("filter");
      element.style.removeProperty("box-shadow");

      const slot = element.querySelector?.(".slot");
      if (slot) {
        slot.style.removeProperty("animation");
        slot.style.removeProperty("animation-delay");
        slot.style.removeProperty("filter");
        slot.style.removeProperty("box-shadow");
      }
    }

    state.activeGlowElements.clear();
  }

  function restartLegendAnimationsTogether() {
    const flash = document.getElementById("lp-screen-flash");
    const lootWindow = findLootWindow();
    const borderWindow = getLootBorderWindow(lootWindow);
    const itemElement = findLootItemElement(window.__lpCurrentLegendItem || {});
    const slot = itemElement?.querySelector?.(".slot");

    const animated = [flash, borderWindow, itemElement, slot].filter(Boolean);

    for (const element of animated) {
      element.style.animation = "none";
    }

    void document.body.offsetWidth;

    if (flash?.classList.contains("active")) {
      flash.style.animation = "lp-screen-pulse 3.0s linear infinite";
    }

    if (borderWindow?.classList.contains("lp-loot-window-glow") && !isOldInterface()) {
      borderWindow.style.animation = "lp-loot-window-pulse 3.0s linear infinite";
    }

    if (itemElement?.classList.contains("lp-loot-glow")) {
      itemElement.style.animation = "lp-item-pulse 3.0s linear infinite";
    }

    if (slot && itemElement?.classList.contains("lp-loot-glow")) {
      slot.style.animation = "lp-item-slot-pulse 3.0s linear infinite";
    }
  }

  function initLootWindowActionWatcher() {
    if (window.__lpLootActionWatcherInstalled) return;
    window.__lpLootActionWatcherInstalled = true;

    const handleLootAction = event => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const action = target.closest(".accept-button .button, .accept-button, .close-button, #loots_button, #loots .loot-decision button, #loots .loot-decision");
      if (!action) return;

      if (isOldInterface()) {
        if (!action.closest("#loots")) return;
        if (action.closest(".loot-decision") && !action.matches("#loots_button")) return;
        if (!action.matches("#loots_button")) return;
      } else {
        const borderWindow = action.closest(".border-window");
        if (!borderWindow || !borderWindow.querySelector(".loot-window")) return;
      }

      stopLootTimedEffects();
    };

    document.addEventListener("mousedown", handleLootAction, true);
    document.addEventListener("click", handleLootAction, true);
  }

  function startLootTimedEffects(item) {
    stopLootTimedEffects();
    window.__lpCurrentLegendItem = item;

    const startedAt = Date.now();
    let lootWasVisible = false;
    let missingTicks = 0;

    const update = () => {
      const testItem = String(item?.id ?? item?.lootId ?? "").startsWith("lp-test-");
      const itemIds = [item?.id, item?.lootId, item?.itemId].filter(v => v !== undefined && v !== null).map(String);
      const liveLegend = testItem ? item : getLootItems().find(candidate => {
        if (!isLegendary(candidate)) return false;
        const candidateIds = [candidate?.id, candidate?.lootId, candidate?.itemId].filter(v => v !== undefined && v !== null).map(String);
        return itemIds.some(id => candidateIds.includes(id));
      });

      if (!liveLegend) {
        stopLootTimedEffects();
        return;
      }

      const legendElement = findExactLegendLootElement(item);
      const lootWindow = isOldInterface()
        ? (legendElement?.closest?.("#loots") || null)
        : (legendElement?.closest?.(".loot-window") || null);

      if (lootWindow && legendElement) {
        lootWasVisible = true;
        missingTicks = 0;

        const acceptControl = isOldInterface()
          ? lootWindow.querySelector("#loots_button")
          : lootWindow.querySelector(".accept-button .button, .accept-button");
        if (lootWasVisible && !acceptControl) {
          stopLootTimedEffects();
          return;
        }

        if (state.settings.screenFlash) {
          const flash = document.getElementById("lp-screen-flash");

          if (flash && positionFlashToGameArea()) {
            flash.classList.add("active");
          }
        }

        showLootWindowGlow(lootWindow);

        if (state.settings.itemGlow) {
          glowLootItemPersistent(item);
        }

        if (!state.__animationsSynced) {
          state.__animationsSynced = true;
          requestAnimationFrame(() => restartLegendAnimationsTogether());
        }

        return;
      }

      missingTicks++;

      if (!lootWasVisible && Date.now() - startedAt < 2000) {
        return;
      }

      if (lootWasVisible ? missingTicks >= 2 : missingTicks >= 10) {
        stopLootTimedEffects();
      }
    };

    update();
    state.lootEffectTimer = setInterval(update, 100);
  }

  function flashScreenFor(durationMs) {
    const flash = document.getElementById("lp-screen-flash");
    if (!flash || !positionFlashToGameArea()) return;

    flash.classList.remove("active");
    void flash.offsetWidth;
    flash.classList.add("active");

    setTimeout(() => {
      flash.classList.remove("active");
    }, durationMs);
  }

  function findLootItemElement(item) {
    if (!item) return null;

    if (isOldInterface()) {
      return findExactLegendLootElement(item);
    }

    const possibleIds = [item.lootId, item.id].filter(v => v !== undefined && v !== null);
    let element = null;

    for (const id of possibleIds) {
      const safe = window.CSS?.escape ? CSS.escape(String(id)) : String(id);
      element =
        document.querySelector(`.loot-item-wrapper-${safe}`) ||
        document.querySelector(`.loot-window [loot-id="${safe}"]`) ||
        document.querySelector(`.loot-window [data-id="${safe}"]`) ||
        document.querySelector(`[data-id="${safe}"]`);
      if (element) break;
    }

    if (!element && item.name) {
      const candidates = document.querySelectorAll(".loot-window .loot-item-wrapper, .loot-window [title], .loot-window [data-name]");
      element = [...candidates].find(el => {
        const haystack = [el.getAttribute("title"), el.getAttribute("data-name"), el.textContent].filter(Boolean).join(" ");
        return haystack.includes(item.name);
      });
    }

    return element;
  }
  function glowLootItemPersistent(item) {
    const element = findLootItemElement(item);
    if (!element) return;

    element.classList.add("lp-loot-glow");
    state.activeGlowElements.add(element);
  }

  function glowLootItemFor(item, durationMs) {
    const element = findLootItemElement(item);
    if (!element) return;

    element.classList.add("lp-loot-glow");

    setTimeout(() => {
      element?.classList.remove("lp-loot-glow");
    }, durationMs);
  }

  function removeTestLootWindow() {
    if (state.testLootTimer) {
      clearInterval(state.testLootTimer);
      state.testLootTimer = null;
    }

    const testState = state.siNativeTestLoot;
    if (!testState) return;

    const loots = document.getElementById("loots");
    if (loots && testState.clickGuard) {
      loots.removeEventListener("click", testState.clickGuard, true);
    }

    if (loots) {
      loots.innerHTML = testState.html;
      loots.setAttribute("style", testState.style || "");
      if (!testState.style) loots.removeAttribute("style");
      if (testState.className !== null) loots.className = testState.className;
    }

    if (pageWindow.g) pageWindow.g.loots = testState.gameLoots;
    state.siNativeTestLoot = null;
  }

  function createMargonemLootWindowMock(item, durationSeconds) {
    removeTestLootWindow();

    if (!isOldInterface()) return null;

    const loots = document.getElementById("loots");
    const jq = pageWindow.jQuery || pageWindow.$;
    if (!loots || typeof jq !== "function" || typeof pageWindow.lootboxItem !== "function") {
      console.warn("[Legendary Pulse] Brak natywnego okna/funkcji łupów SI.");
      return null;
    }

    if (pageWindow.g?.loots) {
      console.warn("[Legendary Pulse] TEST LEGENDY pominięty: prawdziwe okno łupów jest aktywne.");
      try { pageWindow.message?.("[color=#f2b84b]Najpierw zamknij prawdziwe okno łupów.[/color]"); } catch {}
      return null;
    }

    const saved = {
      html: loots.innerHTML,
      style: loots.getAttribute("style") || "",
      className: loots.className,
      gameLoots: pageWindow.g.loots,
      clickGuard: null
    };
    state.siNativeTestLoot = saved;

    const $loots = jq(loots);
    $loots.find("tr").empty();
    $loots.removeClass("colorized video");

    try {
      const label = typeof pageWindow._t === "function" ? pageWindow._t("loots_header") : "Łupy";
      const formatted = typeof pageWindow.goldTxt === "function" ? pageWindow.goldTxt(label) : label;
      jq("#loots_header_label").html(formatted);
    } catch {
      jq("#loots_header_label").text("Łupy");
    }

    jq("#loots_counter").html(String(durationSeconds));

    pageWindow.g.loots = {
      init: 2,
      owners: null,
      source: "legendary-pulse-test",
      interval: null,
      want: [String(item.id)],
      must: [],
      not: []
    };

    pageWindow.lootboxItem(item);

    const nativeItem = document.getElementById(`item${item.id}`);
    if (nativeItem) {
      nativeItem.setAttribute("tip", item.tip || item.name);
      nativeItem.setAttribute("ctip", "t_item");
      if (!nativeItem.querySelector(".itemHighlighter")) {
        let rankClass = "";
        try {
          if (typeof pageWindow.getClassOfItemRank === "function") rankClass = pageWindow.getClassOfItemRank() || "";
        } catch {}
        const highlighter = document.createElement("div");
        highlighter.className = `itemHighlighter t_leg ${rankClass}`.trim();
        nativeItem.prepend(highlighter);
      }
      if (!nativeItem.querySelector("img")) {
        const img = document.createElement("img");
        img.src = "https://micc.garmory-cdn.cloud/obrazki/itemy//que/wladcy_krysz01.gif";
        img.setAttribute("dest", String(item.id));
        nativeItem.appendChild(img);
      }
    }

    const clickGuard = event => {
      if (!state.siNativeTestLoot) return;
      const decision = event.target.closest(".loot-decision b, #loots_button");
      if (!decision) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (decision.matches("#loots_button")) {
        removeTestLootWindow();
        stopLootTimedEffects();
      } else {
        const wrapper = decision.closest(".loot-wrapper");
        wrapper?.querySelectorAll(".loot-decision b").forEach(el => el.classList.remove("sel"));
        decision.classList.add("sel");
      }
    };
    saved.clickGuard = clickGuard;
    loots.addEventListener("click", clickGuard, true);

    $loots.stop(true, true);
    if (typeof $loots.absCenter === "function") $loots.absCenter();
    $loots.fadeIn("fast");

    return loots;
  }

  function runLootWindowTest() {
    const durationSeconds = 15;

    const item = {
      id: "lp-test-legendary-bag",
      lootId: "lp-test-legendary-bag",
      hid: 0,
      tpl: 0,
      name: "Testowy przedmiot legendarny",
      icon: "que/wladcy_krysz01.gif",
      cl: 0,
      pr: 0,
      prc: "zl",
      own: pageWindow.hero?.id || 0,
      stat: "lvl=300;rarity=legendary",
      _cachedStats: {lvl: "300", rarity: "legendary"},
      tip: "Testowy przedmiot legendarny",
      loc: "l"
    };

    const windowElement = createMargonemLootWindowMock(item, durationSeconds);
    if (!windowElement) return;

    const timeElement = document.getElementById("loots_counter");
    const endAt = Date.now() + durationSeconds * 1000;

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      if (timeElement) timeElement.textContent = String(remaining);
      if (remaining <= 0) {
        removeTestLootWindow();
        stopLootTimedEffects();
      }
    };

    updateCountdown();
    state.testLootTimer = setInterval(updateCountdown, 250);
    notify(item, true);
  }

  function normalizeCustomSoundSource(value) {
    const source = String(value || "").trim();
    if (!source) return "";

    if (/^(https?:|data:|blob:)/i.test(source)) {
      return source;
    }

    try {
      return new URL(source, window.location.href).href;
    } catch {
      return source;
    }
  }

  function stopCurrentLegendSound() {
    if (state.currentSoundAudio) {
      try {
        state.currentSoundAudio.pause();
        state.currentSoundAudio.currentTime = 0;
      } catch {}

      state.currentSoundAudio = null;
      state.currentSoundSource = "";
    }

    if (state.currentSoundContext) {
      try {
        state.currentSoundContext.close();
      } catch {}

      state.currentSoundContext = null;
    }
  }

  function playLegendSound(forceTest = false) {
    if (!forceTest && !state.settings.sound) return;

    stopCurrentLegendSound();

    const customSource = normalizeCustomSoundSource(state.settings.customSound);

    if (customSource) {
      try {
        const audio = new Audio(customSource);
        audio.preload = "auto";
        audio.volume = Math.max(
          0,
          Math.min(1, Number(state.settings.customSoundVolume ?? 100) / 100)
        );

        state.currentSoundAudio = audio;
        state.currentSoundSource = customSource;

        const cleanup = () => {
          if (state.currentSoundAudio === audio) {
            state.currentSoundAudio = null;
            state.currentSoundSource = "";
          }
        };

        audio.addEventListener("ended", cleanup, { once: true });
        audio.addEventListener("error", cleanup, { once: true });

        audio.currentTime = 0;
        const promise = audio.play();

        if (promise?.catch) {
          promise.catch(error => {
            cleanup();
            console.warn(
              "[Legendary Pulse] Nie udało się odtworzyć własnego dźwięku:",
              error
            );
          });
        }

        return;
      } catch (error) {
        console.warn(
          "[Legendary Pulse] Błąd własnego dźwięku, używam domyślnego:",
          error
        );
      }
    }

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      state.currentSoundContext = ctx;

      const now = ctx.currentTime;

      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(660, now);
      osc1.frequency.exponentialRampToValueAtTime(990, now + 0.45);
      osc1.connect(gain);

      const osc2 = ctx.createOscillator();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(880, now + 0.08);
      osc2.frequency.exponentialRampToValueAtTime(1320, now + 0.55);
      osc2.connect(gain);

      osc1.start(now);
      osc2.start(now + 0.08);
      osc1.stop(now + 0.9);
      osc2.stop(now + 0.9);

      setTimeout(() => {
        if (state.currentSoundContext === ctx) {
          try { ctx.close(); } catch {}
          state.currentSoundContext = null;
        }
      }, 1200);
    } catch (error) {
      state.currentSoundContext = null;
      console.warn("[Legendary Pulse] Nie udało się odtworzyć dźwięku:", error);
    }
  }

  function sendCenterMessage(item) {
    const name = item?.name || "Legenda";
    const text = `[color=#f2b84b]✦ LEGENDA![/color][br][color=#ffffff]${name}[/color]`;

    try {
      if (typeof pageWindow.message === "function") {
        pageWindow.message(text);
        return true;
      }

      if (typeof pageWindow.Engine?.message === "function") {
        pageWindow.Engine.message(text);
        return true;
      }

      console.warn("[Legendary Pulse] Brak funkcji wiadomości ekranowej Margonem.");
      return false;
    } catch (e) {
      console.warn("[Legendary Pulse] Nie udało się wyświetlić wiadomości:", e);
      return false;
    }
  }

  function findFreshLootItem(original) {
    const ids = [
      original?.id,
      original?.lootId,
      original?.itemId
    ]
      .filter(v => v !== undefined && v !== null)
      .map(v => String(v));

    if (typeof pageWindow.Engine?.items?.getItemById === "function") {
      for (const id of ids) {
        try {
          const found = pageWindow.Engine.items.getItemById(id) ||
                        pageWindow.Engine.items.getItemById(Number(id));
          if (found?.hid) return found;
        } catch {}
      }
    }

    const freshItems = getLootItems();

    for (const fresh of freshItems) {
      if (!fresh) continue;

      if (fresh.hid && original?.hid && String(fresh.hid) === String(original.hid)) {
        return fresh;
      }

      const freshIds = [fresh.id, fresh.lootId, fresh.itemId]
        .filter(v => v !== undefined && v !== null)
        .map(v => String(v));

      if (fresh.hid && ids.some(id => freshIds.includes(id))) {
        return fresh;
      }
    }

    if (original?.name) {
      const same = freshItems.filter(fresh =>
        fresh?.hid &&
        fresh?.name === original.name &&
        (!original?.stat || !fresh?.stat || fresh.stat === original.stat)
      );
      if (same.length === 1) return same[0];
    }

    return null;
  }

  function resolveLegendHid(item) {
    if (
      item?.hid !== undefined &&
      item?.hid !== null &&
      String(item.hid).length > 0 &&
      String(item.hid) !== "0"
    ) {
      return String(item.hid);
    }

    const fresh = findFreshLootItem(item);
    if (
      fresh?.hid !== undefined &&
      fresh?.hid !== null &&
      String(fresh.hid).length > 0 &&
      String(fresh.hid) !== "0"
    ) {
      return String(fresh.hid);
    }

    return null;
  }

  function sendClanTestMessage(itemName = "Testowy przedmiot legendarny") {
    if (typeof pageWindow._g !== "function") {
      console.warn("[Legendary Pulse] Brak funkcji _g — test czatu niemożliwy.");
      return false;
    }

    let template = String(state.settings.clanText || DEFAULTS.clanText).trim();
    if (!template) template = DEFAULTS.clanText;

    const text = template.includes("{item}")
      ? template.replaceAll("{item}", itemName)
      : `${template} ${itemName}`;

    const finalText = text;

    try {
      pageWindow._g("chat&channel=clan", false, { c: finalText });
      console.info("[Legendary Pulse] Wysłano TEST wiadomości klanowej:", finalText);
      return true;
    } catch (e) {
      console.warn("[Legendary Pulse] Test wiadomości klanowej nie powiódł się:", e);
      return false;
    }
  }

  async function sendClanMessage(items) {
    if (typeof pageWindow._g !== "function") {
      console.warn("[Legendary Pulse] Brak funkcji _g — nie można wysłać wiadomości klanowej.");
      return false;
    }

    const list = Array.isArray(items) ? items : [items];

    const deadline = Date.now() + 3000;
    let hids = [];

    while (Date.now() < deadline) {
      hids = list
        .map(resolveLegendHid)
        .filter(Boolean);

      if (hids.length === list.length) break;
      await new Promise(resolve => setTimeout(resolve, 60));
    }

    hids = [...new Set(hids)];

    if (!hids.length) {
      console.warn(
        "[Legendary Pulse] Nie udało się uzyskać HID legendy nawet po ponowieniu. Wiadomość nie została wysłana.",
        list
      );
      return false;
    }

    const itemRefs = hids.map(hid => `ITEM#${hid}`).join(" ");

    let template = String(state.settings.clanText || DEFAULTS.clanText).trim();

    if (!template) template = DEFAULTS.clanText;

    const text = template.includes("{item}")
      ? template.replaceAll("{item}", itemRefs)
      : `${template} ${itemRefs}`;

    const finalText = text;

    try {
      pageWindow._g(`chat&channel=clan`, false, { c: finalText });
      console.info("[Legendary Pulse] Wysłano wiadomość klanową:", finalText);
      return true;
    } catch (e) {
      console.warn("[Legendary Pulse] Nie udało się wysłać wiadomości klanowej:", e);
      return false;
    }
  }

  function bindKeys() {
    window.addEventListener("keydown", e => {
      if (e.altKey && e.code === "KeyL") {
        e.preventDefault();
        togglePanel();
      }
    });

    window.addEventListener("resize", () => {
      positionFlashToGameArea();
    });
  }

  function startScanner() {
    clearInterval(state.timer);
    state.timer = setInterval(scanLoot, Math.max(100, state.settings.pollInterval));
  }

  function destroy() {
    stopCurrentLegendSound();
    removeTestLootWindow();
    stopLootTimedEffects();
    clearInterval(state.timer);
    document.getElementById(`${ID}-styles`)?.remove();
    document.getElementById("lp-screen-flash")?.remove();
    document.getElementById("lp-settings")?.remove();
    document.getElementById("lp-mini-button")?.remove();
    delete pageWindow.LegendaryPulse;
    console.info("[Legendary Pulse] Wyłączono.");
  }

  function init() {
    if (!COLOR_PALETTES[state.settings.palette]) state.settings.palette = DEFAULTS.palette;
    if (
      !state.settings.clanText ||
      state.settings.clanText === "✨ Legenda! {item}"
    ) {
      state.settings.clanText = DEFAULTS.clanText;
    }
    if (typeof state.settings.burstAnimation !== "boolean") state.settings.burstAnimation = true;
    if (typeof state.settings.screenShake !== "boolean") state.settings.screenShake = true;
    if (typeof state.settings.screenCrack !== "boolean") state.settings.screenCrack = true;
    if (typeof state.settings.legendaryLightning !== "boolean") state.settings.legendaryLightning = true;
    state.settings.screenShakeStrength = Math.max(10, Math.min(200, Number(state.settings.screenShakeStrength ?? 100)));
    if (typeof state.settings.animateColors !== "boolean") state.settings.animateColors = true;
    if (typeof state.settings.useCustomPalette !== "boolean") state.settings.useCustomPalette = false;
    for (let i = 1; i <= 3; i++) {
      const key = `customPalette${i}`;
      if (!/^#[0-9a-f]{6}$/i.test(state.settings[key] || "")) {
        state.settings[key] = DEFAULTS[key];
      }
    }
    if (!/^#[0-9a-f]{6}$/i.test(state.settings.mapColor || "")) state.settings.mapColor = DEFAULTS.mapColor;
    if (!/^#[0-9a-f]{6}$/i.test(state.settings.lootColor || "")) state.settings.lootColor = DEFAULTS.lootColor;
    if (!/^#[0-9a-f]{6}$/i.test(state.settings.itemColor || "")) state.settings.itemColor = DEFAULTS.itemColor;
    if (typeof state.settings.customSound !== "string") state.settings.customSound = "";
    if (!Number.isFinite(Number(state.settings.customSoundVolume))) state.settings.customSoundVolume = 100;
    state.settings.customSoundVolume = Math.max(0, Math.min(100, Number(state.settings.customSoundVolume)));
    if (!Number.isFinite(Number(state.settings.glowSize))) state.settings.glowSize = 100;
    state.settings.glowSize = Math.max(40, Math.min(200, Number(state.settings.glowSize)));
    injectStyles();
    createUi();
    initLootWindowActionWatcher();
    updateCssVars();
    bindKeys();
    startScanner();

    pageWindow.LegendaryPulse = {
      version: "1.9.5",
      settings: state.settings,
      notifyTest: () => runLootWindowTest(),
      clanTest: () => {
        const inventory = (() => {
          try {
            if (isNewInterface()) return pageWindow.Engine?.items?.fetchLocationItems?.("g") || [];
            if (isOldInterface()) return Object.values(pageWindow.g?.item || {}).filter(item => item?.loc === "g");
            return [];
          } catch {
            return [];
          }
        })();

        const item = inventory.find(x => x?.hid);
        if (!item) {
          console.warn("[Legendary Pulse] Brak przedmiotu z HID w ekwipunku do testu.");
          return false;
        }

        void sendClanMessage([item]);
        return true;
      },
      chatTransportTest: () => sendClanTestMessage("Testowy przedmiot legendarny"),
      openSettings: () => setPanel(true),
      closeSettings: () => setPanel(false),
      debugGameArea: () => {
        const rect = getGameAreaRect();
        console.log("[Legendary Pulse] Wykryty obszar gry:", rect);
        return rect;
      },
      debugLootTime: () => {
        const lootWindow = findLootWindow();
        const ms = parseLootRemainingMs(lootWindow);
        console.log("[Legendary Pulse] Pozostały czas łupu [ms]:", ms, lootWindow);
        return ms;
      },
      destroy
    };

    console.info(
      `[Legendary Pulse] Uruchomiono (${isOldInterface() ? "SI" : "NI"}). Alt+L = ustawienia. Test: LegendaryPulse.notifyTest()`
    );
  }

  function waitForGame() {
    if (document.body && pageWindow.g?.item) {
      init();
      return;
    }
    setTimeout(waitForGame, 500);
  }

  waitForGame();
})();
      return true;
    }
    return false;
  };
  if (!boot()) {
    const timer = setInterval(() => {
      if (boot()) clearInterval(timer);
    }, 200);
  }
})();

})();
