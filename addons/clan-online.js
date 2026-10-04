(() => {
  "use strict";

  const page = window;
  if (page.TeriashClanOnline) return;

  const STORAGE = "teriashAddons.clanOnline.settings";
  const POS = "teriashAddons.clanOnline.position";
  const bridge = page.TeriashAddonsBridge || {};
  const getValue = bridge.getValue || ((k, d) => d);
  const setValue = bridge.setValue || (() => {});
  const defaults = { showOutfit: true, showExactLocation: true, showMapOnly: false };

  const storedSettings = getValue(STORAGE, {}) || {};
  let settings = { ...defaults, ...storedSettings };
  if (!("showExactLocation" in storedSettings) && "showLocation" in storedSettings) {
    settings.showExactLocation = !!storedSettings.showLocation;
    settings.showMapOnly = false;
  }
  delete settings.showLocation;
  let timer = null;
  let clanData = [];
  let lastRequest = 0;
  let hookedCommunication = null;
  let originalParseJSON = null;

  const prof = {
    w: "Wojownik",
    p: "Paladyn",
    m: "Mag",
    h: "Łowca",
    t: "Tropiciel",
    b: "Tancerz Ostrzy"
  };

  const css = `
#ta-clan-online{position:fixed;z-index:45;width:390px;max-height:480px;left:24px;top:120px;
background:rgba(17,20,26,.96);border:1px solid #596171;border-radius:7px;color:#eee;
font:12px Arial,sans-serif;box-shadow:0 4px 18px #0008;overflow:hidden}
#ta-clan-online *{box-sizing:border-box}
#ta-clan-online .taco-head{height:36px;display:flex;align-items:center;gap:8px;padding:0 10px;
background:#262c36;border-bottom:1px solid #444;cursor:move;user-select:none;touch-action:none}
#ta-clan-online .taco-title{font-weight:700;flex:1}
#ta-clan-online .taco-count{opacity:.8}
#ta-clan-online button{border:1px solid #555;background:#303743;color:#eee;border-radius:4px;cursor:pointer}
#ta-clan-online .taco-gear,#ta-clan-online .taco-close{width:27px;height:25px}
#ta-clan-online .taco-list{max-height:400px;overflow:auto}
#ta-clan-online .taco-row{display:grid;align-items:center;gap:7px;padding:6px 9px;border-bottom:1px solid #2d323b}
#ta-clan-online .taco-row:last-child{border-bottom:0}
#ta-clan-online .taco-outfit{width:32px;height:24px;background-repeat:no-repeat;background-position:0 0;flex:none;overflow:hidden}
#ta-clan-online .taco-nick{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ta-clan-online .taco-lvl{opacity:.9;white-space:nowrap}
#ta-clan-online .taco-loc{font-size:11px;line-height:1.3;overflow:hidden}
#ta-clan-online .taco-map{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ta-clan-online .taco-empty{padding:18px;text-align:center;opacity:.7}
#ta-clan-settings{position:fixed;z-index:46;width:290px;background:#171a20;border:1px solid #596171;
border-radius:7px;color:#eee;font:12px Arial,sans-serif;box-shadow:0 4px 18px #0009;overflow:hidden}
#ta-clan-settings .tacs-head{padding:10px 12px;font-weight:700;background:#262c36;border-bottom:1px solid #444}
#ta-clan-settings label{display:flex;align-items:center;gap:9px;padding:10px 12px;border-bottom:1px solid #292e36;cursor:pointer}
#ta-clan-settings .tacs-note{padding:9px 12px;opacity:.65;font-size:11px}
`;

  const style = document.createElement("style");
  style.id = "ta-clan-online-style";
  style.textContent = css;
  document.head.appendChild(style);

  const box = document.createElement("div");
  box.id = "ta-clan-online";
  box.innerHTML = `
    <div class="taco-head">
      <div class="taco-title">Klanowicze Online</div>
      <div class="taco-count">0</div>
      <button class="taco-gear" title="Ustawienia">⚙</button>
      <button class="taco-close" title="Zamknij">×</button>
    </div>
    <div class="taco-list"></div>`;
  document.body.appendChild(box);

  const savedPos = getValue(POS, null);
  if (savedPos && Number.isFinite(savedPos.left) && Number.isFinite(savedPos.top)) {
    box.style.left = `${Math.max(0, Math.min(savedPos.left, innerWidth - 60))}px`;
    box.style.top = `${Math.max(0, Math.min(savedPos.top, innerHeight - 60))}px`;
  }

  const settingsBox = document.createElement("div");
  settingsBox.id = "ta-clan-settings";
  settingsBox.style.display = "none";
  settingsBox.innerHTML = `
    <div class="tacs-head">Klanowicze Online — ustawienia</div>
    <label><input type="checkbox" data-key="showOutfit"> Pokazuj aktualny outfit</label>
    <label><input type="checkbox" data-key="showExactLocation"> Pokazuj dokładną pozycję (mapa i X,Y)</label>
    <label><input type="checkbox" data-key="showMapOnly"> Pokazuj tylko mapę</label>`;
  document.body.appendChild(settingsBox);

  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  /*
   * Odpowiedź "members" jest płaską tablicą.
   * Każdy klanowicz zajmuje dokładnie 11 pól:
   * id, nick, lvl, oplvl, prof, mapa, x, y, rank, offlineTime, outfit/icon
   */
  function parseMembers(raw) {
    if (!Array.isArray(raw)) return [];

    // Awaryjna obsługa, gdyby klient zwrócił starszą tablicę tablic.
    if (raw.length && Array.isArray(raw[0])) {
      return raw
        .filter(x => Array.isArray(x) && x.length >= 11)
        .map(x => ({
          id: Number(x[0]),
          nick: String(x[1] ?? ""),
          lvl: Number(x[2]),
          oplvl: Number(x[3]),
          prof: String(x[4] ?? ""),
          map: String(x[5] ?? ""),
          x: Number(x[6]),
          y: Number(x[7]),
          rank: Number(x[8]),
          offlineTime: Number(x[9]),
          outfit: String(x[10] ?? "")
        }));
    }

    const out = [];
    for (let i = 0; i + 10 < raw.length; i += 11) {
      const x = raw.slice(i, i + 11);
      out.push({
        id: Number(x[0]),
        nick: String(x[1] ?? ""),
        lvl: Number(x[2]),
        oplvl: Number(x[3]),
        prof: String(x[4] ?? ""),
        map: String(x[5] ?? ""),
        x: Number(x[6]),
        y: Number(x[7]),
        rank: Number(x[8]),
        offlineTime: Number(x[9]),
        outfit: String(x[10] ?? "")
      });
    }
    return out;
  }

  function receiveMembers(raw) {
    clanData = parseMembers(raw);
    console.log("[Teriash Clan Online] Odebrano listę klanu:", clanData.length);
    render();
  }

  /*
   * Gargomem przechwytuje pole "members" przed oryginalnym parserem gry.
   * Robimy to samo, ale NIE usuwamy pola z odpowiedzi — Margonem nadal dostaje
   * swój normalny pakiet.
   */
  function installMembersHook() {
    const communication = page.Engine?.communication;
    if (!communication || typeof communication.parseJSON !== "function") return false;

    if (hookedCommunication === communication && communication.parseJSON === hookedParseJSON) {
      return true;
    }

    // Jeżeli Engine został przeładowany, podpinamy się do nowej instancji.
    hookedCommunication = communication;
    originalParseJSON = communication.parseJSON;

    communication.parseJSON = hookedParseJSON;
    console.log("[Teriash Clan Online] Hook Engine.communication.parseJSON aktywny.");
    return true;
  }

  function hookedParseJSON(data) {
    try {
      if (data && Object.prototype.hasOwnProperty.call(data, "members")) {
        receiveMembers(data.members);
      }
    } catch (e) {
      console.warn("[Teriash Clan Online] Błąd podczas odczytu members:", e);
    }

    return originalParseJSON.apply(this, arguments);
  }

  function hasClan() {
    const clan = page.Engine?.hero?.d?.clan;
    if (clan && typeof clan === "object") return Number(clan.id || 0) !== 0;
    if (typeof clan === "number") return clan !== 0;
    // Nie blokujemy zapytania, jeśli format hero.clan jest inny/jeszcze nieznany.
    return true;
  }

  function requestMembers(force = false) {
    if (!installMembersHook()) return;

    const now = Date.now();
    if (!force && now - lastRequest < 7000) return;
    if (!hasClan()) {
      clanData = [];
      render("Nie należysz do żadnego klanu.");
      return;
    }
    if (typeof page._g !== "function") return;

    lastRequest = now;
    try {
      page._g("clan&a=members");
    } catch (e) {
      console.warn("[Teriash Clan Online] Nie udało się wysłać clan&a=members:", e);
    }
  }

  function onlineMembers() {
    return clanData
      .filter(m => Number(m.offlineTime) <= 0)
      .sort((a, b) => String(a.nick).localeCompare(String(b.nick), "pl"));
  }

  function outfitSrc(path) {
    if (!path) return "";

    const raw = String(path).trim();

    // Outfit z pakietu "members" jest ścieżką sprite'a postaci, np.
    // /paid/bf25-uniwersalne-k.gif. Nie używamy <img>, bo przeglądarka
    // pomniejszyłaby cały arkusz klatek. Tło 32x24 wycina górną połowę
    // pierwszej klatki 32x48 (postać od pasa w górę).
    if (/^(?:\/)?(?:paid|kuf|eve|clan|premium|event|npc)\//i.test(raw)) {
      return `https://micc.garmory-cdn.cloud/obrazki/postacie/${raw.startsWith("/") ? raw : "/" + raw}`;
    }

    if (/^https?:\/\//i.test(raw)) return raw;

    // Awaryjnie korzystamy z resolvera klienta NI.
    const resolver = page.Engine?.interface?.getUrl;
    if (typeof resolver === "function") {
      try {
        const v = resolver.call(page.Engine.interface, raw);
        if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
      } catch {}
    }

    return `https://micc.garmory-cdn.cloud/obrazki/postacie/${raw.startsWith("/") ? raw : "/" + raw}`;
  }

  function render(message = "") {
    const arr = onlineMembers();
    box.querySelector(".taco-count").textContent = String(arr.length);
    const list = box.querySelector(".taco-list");

    if (message) {
      list.innerHTML = `<div class="taco-empty">${esc(message)}</div>`;
      return;
    }

    if (!clanData.length) {
      list.innerHTML = `<div class="taco-empty">Pobieranie listy klanowiczów…</div>`;
      return;
    }

    if (!arr.length) {
      list.innerHTML = `<div class="taco-empty">Brak klanowiczów online.</div>`;
      return;
    }

    const cols =
      `${settings.showOutfit ? "36px " : ""}` +
      `minmax(110px,1fr) 58px` +
      `${(settings.showExactLocation || settings.showMapOnly) ? " minmax(130px,1.2fr)" : ""}`;

    list.innerHTML = arr.map(m => {
      const src = settings.showOutfit ? outfitSrc(m.outfit) : "";
      return `
        <div class="taco-row" data-id="${esc(m.id)}" style="grid-template-columns:${cols}">
          ${settings.showOutfit
            ? (src
              ? `<div class="taco-outfit" style="background-image:url('${esc(src)}')" title="${esc(m.nick)}"></div>`
              : `<div class="taco-outfit"></div>`)
            : ""}
          <div class="taco-nick" title="${esc(m.nick)}">${esc(m.nick)}</div>
          <div class="taco-lvl" title="${esc(prof[m.prof] || m.prof)}">${esc(m.lvl)}${esc(m.prof || "")}</div>
          ${settings.showExactLocation
            ? `<div class="taco-loc">
                 <div class="taco-map" title="${esc(m.map)}">${esc(m.map || "—")}</div>
                 <div>${esc(m.x)}, ${esc(m.y)}</div>
               </div>`
            : settings.showMapOnly
              ? `<div class="taco-loc">
                   <div class="taco-map" title="${esc(m.map)}">${esc(m.map || "—")}</div>
                 </div>`
              : ""}
        </div>`;
    }).join("");
  }

  function syncSettings() {
    settingsBox.querySelectorAll("input[data-key]").forEach(i => {
      i.checked = !!settings[i.dataset.key];
    });
  }

  function toggleSettings(force) {
    const currentlyOpen = settingsBox.style.display !== "none";
    const open = typeof force === "boolean" ? force : !currentlyOpen;

    if (!open) {
      settingsBox.style.display = "none";
      return;
    }

    syncSettings();
    const r = box.getBoundingClientRect();
    settingsBox.style.left = `${Math.max(0, Math.min(r.right + 8, innerWidth - 300))}px`;
    settingsBox.style.top = `${Math.max(0, Math.min(r.top, innerHeight - 180))}px`;
    settingsBox.style.display = "block";
  }

  settingsBox.addEventListener("change", e => {
    const input = e.target.closest("input[data-key]");
    if (!input) return;
    const key = input.dataset.key;
    settings[key] = input.checked;

    if (input.checked && key === "showExactLocation") {
      settings.showMapOnly = false;
    } else if (input.checked && key === "showMapOnly") {
      settings.showExactLocation = false;
    }

    syncSettings();
    setValue(STORAGE, settings);
    render();
  });

  box.querySelector(".taco-gear").addEventListener("click", e => {
    e.stopPropagation();
    toggleSettings();
  });

  box.querySelector(".taco-close").addEventListener("click", () => {
    box.style.display = "none";
    settingsBox.style.display = "none";
  });

  const handle = box.querySelector(".taco-head");
  let drag = null;

  handle.addEventListener("pointerdown", e => {
    if (e.button !== 0 || e.target.closest("button")) return;
    const r = box.getBoundingClientRect();
    drag = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      left: r.left,
      top: r.top
    };
    try { handle.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  handle.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    const left = Math.max(0, Math.min(
      drag.left + e.clientX - drag.sx,
      innerWidth - box.offsetWidth
    ));
    const top = Math.max(0, Math.min(
      drag.top + e.clientY - drag.sy,
      innerHeight - box.offsetHeight
    ));
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  const endDrag = e => {
    if (!drag || e.pointerId !== drag.id) return;
    try { handle.releasePointerCapture(e.pointerId); } catch {}
    const r = box.getBoundingClientRect();
    setValue(POS, { left: r.left, top: r.top });
    drag = null;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  handle.addEventListener("pointerup", endDrag, true);
  handle.addEventListener("pointercancel", endDrag, true);

  function restoreHook() {
    if (
      hookedCommunication &&
      hookedCommunication.parseJSON === hookedParseJSON &&
      typeof originalParseJSON === "function"
    ) {
      hookedCommunication.parseJSON = originalParseJSON;
    }
    hookedCommunication = null;
    originalParseJSON = null;
  }

  render();

  // Engine może pojawić się chwilę po załadowaniu dodatku.
  let startupTries = 0;
  const startup = setInterval(() => {
    startupTries++;
    if (installMembersHook()) {
      clearInterval(startup);
      requestMembers(true);
    } else if (startupTries >= 120) {
      clearInterval(startup);
      render("Nie udało się podłączyć do komunikacji gry.");
    }
  }, 250);

  timer = setInterval(() => {
    installMembersHook();
    requestMembers(false);
  }, 2000);

  page.TeriashClanOnline = {
    open() {
      box.style.display = "";
      requestMembers(true);
      render();
    },
    close() {
      box.style.display = "none";
      settingsBox.style.display = "none";
    },
    openSettings() {
      toggleSettings(true);
    },
    closeSettings() {
      toggleSettings(false);
    },
    refresh() {
      requestMembers(true);
    },
    destroy() {
      clearInterval(startup);
      clearInterval(timer);
      restoreHook();
      settingsBox.remove();
      box.remove();
      style.remove();
      delete page.TeriashClanOnline;
    }
  };
})();