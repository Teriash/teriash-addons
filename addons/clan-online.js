(() => {
  "use strict";

  const page = window;
  if (page.TeriashClanOnline) return;

  const STORAGE = "teriashAddons.clanOnline.settings";
  const POS = "teriashAddons.clanOnline.position";
  const SIZE = "teriashAddons.clanOnline.size";
  const WIDGET_POS = "teriashAddons.clanOnline.widgetPosition";
  const bridge = page.TeriashAddonsBridge || {};
  const getValue = bridge.getValue || ((k, d) => d);
  const setValue = bridge.setValue || (() => {});
  const defaults = { showOutfit: true, showExactLocation: true, showMapOnly: false, sortBy: "nameAsc" };

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
  let requestPending = false;
  let requestPendingSince = 0;
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
#ta-clan-online{position:fixed;z-index:45;width:335px;height:180px;min-width:210px;min-height:75px;max-width:calc(100vw - 8px);max-height:calc(100vh - 8px);resize:both;left:24px;top:120px;
background:rgba(17,20,26,.96);border:1px solid #596171;border-radius:7px;color:#eee;
font:12px Arial,sans-serif;box-shadow:0 4px 18px #0008;overflow:hidden}
#ta-clan-online *{box-sizing:border-box}
#ta-clan-widget{position:fixed;z-index:44;left:16px;top:72px;width:42px;height:42px;
display:flex;align-items:center;justify-content:center;background:rgba(17,20,26,.96);
border:1px solid #596171;border-radius:10px;color:#eee;font:700 17px Arial,sans-serif;
box-shadow:0 3px 12px #0008;cursor:pointer;user-select:none;touch-action:none}
#ta-clan-widget:hover{background:#2b323d;border-color:#747e8d}
#ta-clan-widget.ta-open{border-color:#7d8796;background:#262c36}
#ta-clan-online .taco-head{height:32px;display:flex;align-items:center;gap:6px;padding:0 7px;
background:#262c36;border-bottom:1px solid #444;cursor:move;user-select:none;touch-action:none}
#ta-clan-online .taco-title{font-weight:700;flex:1}
#ta-clan-online .taco-count{opacity:.8}
#ta-clan-online button{border:1px solid #555;background:#303743;color:#eee;border-radius:4px;cursor:pointer}
#ta-clan-online .taco-gear,#ta-clan-online .taco-close{width:25px;height:23px}
#ta-clan-online .taco-list{height:calc(100% - 32px);overflow:auto;scrollbar-width:thin;scrollbar-color:#596171 #1b1f26}
#ta-clan-online .taco-list::-webkit-scrollbar{width:9px;height:9px}
#ta-clan-online .taco-list::-webkit-scrollbar-track{background:#1b1f26}
#ta-clan-online .taco-list::-webkit-scrollbar-thumb{background:#596171;border:2px solid #1b1f26;border-radius:6px}
#ta-clan-online .taco-list::-webkit-scrollbar-thumb:hover{background:#747e8d}
#ta-clan-online .taco-list::-webkit-scrollbar-corner{background:#1b1f26}
#ta-clan-online .taco-row{display:grid;align-items:center;gap:2px;padding:3px 5px;border-bottom:1px solid #2d323b}
#ta-clan-online .taco-row:last-child{border-bottom:0}
#ta-clan-online .taco-outfit{width:32px;height:24px;background-repeat:no-repeat;background-position:0 0;flex:none;overflow:hidden}
#ta-clan-online .taco-nick{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ta-clan-online .taco-lvl{opacity:.9;white-space:nowrap}
#ta-clan-online .taco-loc{font-size:11px;line-height:1.15;overflow:hidden}
#ta-clan-online .taco-map{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ta-clan-online .taco-empty{padding:18px;text-align:center;opacity:.7}
#ta-clan-settings{position:fixed;z-index:46;width:310px;max-height:calc(100vh - 16px);overflow-y:auto;background:#171a20;border:1px solid #596171;
border-radius:7px;color:#eee;font:12px Arial,sans-serif;box-shadow:0 4px 18px #0009;overflow:hidden}
#ta-clan-settings .tacs-head{padding:10px 12px;font-weight:700;background:#262c36;border-bottom:1px solid #444}
#ta-clan-settings label{display:flex;align-items:center;gap:9px;padding:10px 12px;border-bottom:1px solid #292e36;cursor:pointer}
#ta-clan-settings .tacs-sort{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #292e36}
#ta-clan-settings .tacs-sort span{flex:1}
#ta-clan-settings select{background:#262c36;color:#eee;border:1px solid #596171;border-radius:4px;padding:4px 6px;outline:none}
#ta-clan-settings{scrollbar-width:thin;scrollbar-color:#596171 #1b1f26}
#ta-clan-settings::-webkit-scrollbar{width:8px}
#ta-clan-settings::-webkit-scrollbar-track{background:#1b1f26}
#ta-clan-settings::-webkit-scrollbar-thumb{background:#596171;border:2px solid #1b1f26;border-radius:6px}
#ta-clan-settings .tacs-note{padding:9px 12px;opacity:.65;font-size:11px}
`;

  const style = document.createElement("style");
  style.id = "ta-clan-online-style";
  style.textContent = css;
  document.head.appendChild(style);

  const widget = document.createElement("div");
  widget.id = "ta-clan-widget";
  widget.title = "Klanowicze Online — otwórz/zamknij";
  widget.textContent = "♟";
  document.body.appendChild(widget);

  const savedWidgetPos = getValue(WIDGET_POS, null);
  if (savedWidgetPos && Number.isFinite(savedWidgetPos.left) && Number.isFinite(savedWidgetPos.top)) {
    widget.style.left = `${Math.max(0, Math.min(savedWidgetPos.left, innerWidth - 42))}px`;
    widget.style.top = `${Math.max(0, Math.min(savedWidgetPos.top, innerHeight - 42))}px`;
  }

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

  const savedSize = getValue(SIZE, null);
  if (savedSize && Number.isFinite(savedSize.width) && Number.isFinite(savedSize.height)) {
    box.style.width = `${Math.max(210, Math.min(savedSize.width, innerWidth - 8))}px`;
    box.style.height = `${Math.max(75, Math.min(savedSize.height, innerHeight - 8))}px`;
  }

  const settingsBox = document.createElement("div");
  settingsBox.id = "ta-clan-settings";
  settingsBox.style.display = "none";
  settingsBox.innerHTML = `
    <div class="tacs-head">Klanowicze Online — ustawienia</div>
    <label><input type="checkbox" data-key="showOutfit"> Pokazuj aktualny outfit</label>
    <label><input type="checkbox" data-key="showExactLocation"> Pokazuj dokładną pozycję (mapa i X,Y)</label>
    <label><input type="checkbox" data-key="showMapOnly"> Pokazuj tylko mapę</label>
    <div class="tacs-sort">
      <span>Sortowanie</span>
      <select data-key="sortBy">
        <option value="nameAsc">Nazwa A-Z</option>
        <option value="nameDesc">Nazwa Z-A</option>
        <option value="levelAsc">Level rosnąco</option>
        <option value="levelDesc">Level malejąco</option>
      </select>
    </div>`;
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
    requestPending = false;
    requestPendingSince = 0;
    clanData = parseMembers(raw);
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

    // Jeżeli jesteśmy już podpięci do TEJ instancji communication, niczego
    // ponownie nie opakowujemy. Inny addon może po nas opakować parseJSON;
    // ponowne hookowanie tutaj tworzyłoby łańcuch wrapperów przy każdym ticku.
    if (hookedCommunication === communication) return true;

    // Przy przelogowaniu Engine może utworzyć nową instancję communication.
    // Starą przywracamy tylko wtedy, gdy nadal bezpośrednio wskazuje na nasz wrapper.
    if (
      hookedCommunication &&
      hookedCommunication.parseJSON === hookedParseJSON &&
      typeof originalParseJSON === "function"
    ) {
      hookedCommunication.parseJSON = originalParseJSON;
    }

    hookedCommunication = communication;
    originalParseJSON = communication.parseJSON;
    communication.parseJSON = hookedParseJSON;
    return true;
  }

  function hookedParseJSON(data) {
    try {
      if (data && Object.prototype.hasOwnProperty.call(data, "members")) {
        receiveMembers(data.members);
      }
    } catch (e) {
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

  function gameReadyForClanRequest() {
    // Podczas przelogowania/zmiany postaci nie wysyłamy zapytań.
    // Czekamy aż istnieje bohater, komunikacja i funkcja _g.
    return !!(
      page.Engine?.hero?.d &&
      page.Engine?.communication &&
      typeof page.Engine.communication.parseJSON === "function" &&
      typeof page._g === "function"
    );
  }

  function requestMembers(force = false) {
    if (!gameReadyForClanRequest()) return;
    if (!installMembersHook()) return;

    const now = Date.now();

    // Maksymalnie jedno zapytanie "members" naraz. Jeżeli odpowiedź zaginęła
    // przy przelogowaniu, blokada sama wygasa po 15 s.
    if (requestPending && now - requestPendingSince < 15000) return;
    if (requestPending) {
      requestPending = false;
      requestPendingSince = 0;
    }

    // Twardy limit częstotliwości także dla wymuszonego odświeżenia.
    // Chroni przed lawiną requestów przy przełączaniu postaci / ponownym montowaniu UI.
    const minInterval = force ? 2500 : 10000;
    if (now - lastRequest < minInterval) return;

    if (!hasClan()) {
      clanData = [];
      render("Nie należysz do żadnego klanu.");
      return;
    }

    lastRequest = now;
    requestPending = true;
    requestPendingSince = now;

    try {
      page._g("clan&a=members");
    } catch (e) {
      requestPending = false;
      requestPendingSince = 0;
      // Błędy techniczne zostawiamy ciche dla zwykłego gracza.
    }
  }

  function onlineMembers() {
    const arr = clanData.filter(m => Number(m.offlineTime) <= 0);

    switch (settings.sortBy) {
      case "nameDesc":
        return arr.sort((a, b) => String(b.nick).localeCompare(String(a.nick), "pl", { sensitivity: "base" }));
      case "levelAsc":
        return arr.sort((a, b) =>
          Number(a.lvl) - Number(b.lvl) ||
          String(a.nick).localeCompare(String(b.nick), "pl", { sensitivity: "base" })
        );
      case "levelDesc":
        return arr.sort((a, b) =>
          Number(b.lvl) - Number(a.lvl) ||
          String(a.nick).localeCompare(String(b.nick), "pl", { sensitivity: "base" })
        );
      case "nameAsc":
      default:
        return arr.sort((a, b) => String(a.nick).localeCompare(String(b.nick), "pl", { sensitivity: "base" }));
    }
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
      `${settings.showOutfit ? "33px " : ""}` +
      `minmax(82px,.95fr) 42px` +
      `${(settings.showExactLocation || settings.showMapOnly) ? " minmax(92px,1fr)" : ""}`;

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
    const sortSelect = settingsBox.querySelector('select[data-key="sortBy"]');
    if (sortSelect) sortSelect.value = settings.sortBy || "nameAsc";
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
    settingsBox.style.left = `${Math.max(8, Math.min(r.right + 8, innerWidth - 318))}px`;
    settingsBox.style.top = `${Math.max(8, Math.min(r.top, innerHeight - 260))}px`;
    settingsBox.style.display = "block";
  }

  const clanList = box.querySelector(".taco-list");
  clanList.addEventListener("wheel", e => {
    if (!e.deltaY) return;
    clanList.scrollTop += e.deltaY;
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });

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

  settingsBox.querySelector('select[data-key="sortBy"]').addEventListener("change", e => {
    settings.sortBy = e.target.value;
    setValue(STORAGE, settings);
    render();
  });

  box.querySelector(".taco-gear").addEventListener("click", e => {
    e.stopPropagation();
    toggleSettings();
  });

  function setPanelVisible(visible) {
    box.style.display = visible ? "" : "none";
    if (!visible) settingsBox.style.display = "none";
    widget.classList.toggle("ta-open", visible);
    widget.title = visible
      ? "Klanowicze Online — zamknij"
      : "Klanowicze Online — otwórz";
    if (visible) {
      render();
      requestMembers(true);
    }
  }

  box.querySelector(".taco-close").addEventListener("click", () => {
    setPanelVisible(false);
  });

  let widgetDrag = null;
  let widgetMoved = false;

  widget.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    const r = widget.getBoundingClientRect();
    widgetDrag = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      left: r.left,
      top: r.top
    };
    widgetMoved = false;
    try { widget.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  widget.addEventListener("pointermove", e => {
    if (!widgetDrag || e.pointerId !== widgetDrag.id) return;
    const dx = e.clientX - widgetDrag.sx;
    const dy = e.clientY - widgetDrag.sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) widgetMoved = true;

    const left = Math.max(0, Math.min(widgetDrag.left + dx, innerWidth - widget.offsetWidth));
    const top = Math.max(0, Math.min(widgetDrag.top + dy, innerHeight - widget.offsetHeight));
    widget.style.left = `${left}px`;
    widget.style.top = `${top}px`;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  const endWidgetDrag = e => {
    if (!widgetDrag || e.pointerId !== widgetDrag.id) return;
    try { widget.releasePointerCapture(e.pointerId); } catch {}
    const r = widget.getBoundingClientRect();
    setValue(WIDGET_POS, { left: r.left, top: r.top });
    const shouldToggle = !widgetMoved;
    widgetDrag = null;
    e.preventDefault();
    e.stopImmediatePropagation();

    if (shouldToggle) {
      setPanelVisible(box.style.display === "none");
    }
  };

  widget.addEventListener("pointerup", endWidgetDrag, true);
  widget.addEventListener("pointercancel", e => {
    if (!widgetDrag || e.pointerId !== widgetDrag.id) return;
    try { widget.releasePointerCapture(e.pointerId); } catch {}
    widgetDrag = null;
  }, true);

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

  // Zapamiętuj rozmiar zmieniany przez uchwyt w prawym dolnym rogu.
  let resizeSaveTimer = null;
  const resizeObserver = new ResizeObserver(entries => {
    const entry = entries[0];
    if (!entry || box.style.display === "none") return;
    clearTimeout(resizeSaveTimer);
    resizeSaveTimer = setTimeout(() => {
      const r = box.getBoundingClientRect();
      setValue(SIZE, { width: Math.round(r.width), height: Math.round(r.height) });
    }, 120);
  });
  resizeObserver.observe(box);

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
  widget.classList.add("ta-open");

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
    if (!gameReadyForClanRequest()) {
      requestPending = false;
      requestPendingSince = 0;
      return;
    }
    installMembersHook();
    requestMembers(false);
  }, 2500);

  page.TeriashClanOnline = {
    open() {
      setPanelVisible(true);
    },
    close() {
      setPanelVisible(false);
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
      clearTimeout(resizeSaveTimer);
      resizeObserver.disconnect();
      restoreHook();
      settingsBox.remove();
      box.remove();
      widget.remove();
      style.remove();
      delete page.TeriashClanOnline;
    }
  };
})();