(() => {
  "use strict";
  const page = window;
  if (page.TeriashClanOnline) return;

  const STORAGE = "teriashAddons.clanOnline.settings";
  const POS = "teriashAddons.clanOnline.position";
  const bridge = page.TeriashAddonsBridge || {};
  const getValue = bridge.getValue || ((k, d) => d);
  const setValue = bridge.setValue || (() => {});
  const defaults = { showOutfit: true, showLocation: true };
  let settings = { ...defaults, ...(getValue(STORAGE, {}) || {}) };
  let timer = null;

  const prof = {
    w: "Wojownik", p: "Paladyn", m: "Mag",
    h: "Łowca", t: "Tropiciel", b: "Tancerz Ostrzy"
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
#ta-clan-online .taco-row{display:grid;grid-template-columns:36px minmax(110px,1fr) 58px minmax(130px,1.2fr);
align-items:center;gap:7px;padding:6px 9px;border-bottom:1px solid #2d323b}
#ta-clan-online .taco-row:last-child{border-bottom:0}
#ta-clan-online .taco-outfit{width:32px;height:40px;object-fit:contain}
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
    <label><input type="checkbox" data-key="showLocation"> Pokazuj aktualną lokalizację (mapa i X,Y)</label>
    <div class="tacs-note">Dane pochodzą z listy klanowej udostępnionej przez klienta gry.</div>`;
  document.body.appendChild(settingsBox);

  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  let refreshBusy = false;
  let lastNativeRefresh = 0;

  function requestMembers(force = false) {
    const now = Date.now();
    if (refreshBusy || (!force && now - lastNativeRefresh < 15000)) return;
    if (typeof page._g !== "function") return;

    refreshBusy = true;
    lastNativeRefresh = now;
    try {
      const result = page._g("clan&a=members");
      Promise.resolve(result).catch(() => {}).finally(() => {
        setTimeout(() => { refreshBusy = false; render(); }, 350);
      });
    } catch (e) {
      refreshBusy = false;
      console.warn("[Klanowicze Online] Nie udało się pobrać członków klanu:", e);
    }
  }

  function members() {
    const clan = page.Engine?.clan;
    const list = clan && typeof clan.getMemberList === "function"
      ? clan.getMemberList()
      : null;
    if (!list) return [];
    return Object.values(list)
      .filter(x => Array.isArray(x) && Number(x[9]) === 0)
      .map(x => ({
        id:x[0], nick:x[1], lvl:x[2], prof:x[4],
        map:x[5], x:x[6], y:x[7], outfit:x[10]
      }))
      .sort((a,b) => String(a.nick).localeCompare(String(b.nick), "pl"));
  }

  function outfitSrc(path) {
    if (!path) return "";
    try {
      const resolved = page.Engine?.interface?.getUrl?.(path);
      if (typeof resolved === "string" && resolved) return resolved;
    } catch (e) {
      console.warn("[Klanowicze Online] Nie udało się rozwiązać outfitu:", path, e);
    }
    return "";
  }

  function render() {
    const arr = members();
    box.querySelector(".taco-count").textContent = String(arr.length);
    const list = box.querySelector(".taco-list");
    if (!arr.length) {
      list.innerHTML = `<div class="taco-empty">Brak klanowiczów online lub lista klanu nie została jeszcze pobrana.</div>`;
      return;
    }
    list.innerHTML = arr.map(m => `
      <div class="taco-row" data-id="${esc(m.id)}" style="grid-template-columns:${settings.showOutfit ? "36px " : ""}minmax(110px,1fr) 58px ${settings.showLocation ? "minmax(130px,1.2fr)" : ""}">
        ${settings.showOutfit ? (outfitSrc(m.outfit) ? `<img class="taco-outfit" src="${esc(outfitSrc(m.outfit))}" alt="">` : `<div class="taco-outfit"></div>`) : ""}
        <div class="taco-nick" title="${esc(m.nick)}">${esc(m.nick)}</div>
        <div class="taco-lvl" title="${esc(prof[m.prof] || m.prof)}">${esc(m.lvl)}${esc(m.prof || "")}</div>
        ${settings.showLocation ? `<div class="taco-loc"><div class="taco-map" title="${esc(m.map)}">${esc(m.map || "—")}</div><div>${esc(m.x)}, ${esc(m.y)}</div></div>` : ""}
      </div>`).join("");
  }

  function syncSettings() {
    settingsBox.querySelectorAll("input[data-key]").forEach(i => i.checked = !!settings[i.dataset.key]);
  }

  settingsBox.addEventListener("change", e => {
    const input = e.target.closest("input[data-key]");
    if (!input) return;
    settings[input.dataset.key] = input.checked;
    setValue(STORAGE, settings);
    render();
  });

  box.querySelector(".taco-gear").addEventListener("click", e => {
    e.stopPropagation();
    const open = settingsBox.style.display !== "none";
    if (open) {
      settingsBox.style.display = "none";
    } else {
      syncSettings();
      const r = box.getBoundingClientRect();
      settingsBox.style.left = `${Math.min(r.right + 8, innerWidth - 300)}px`;
      settingsBox.style.top = `${Math.min(r.top, innerHeight - 180)}px`;
      settingsBox.style.display = "block";
    }
  });

  box.querySelector(".taco-close").addEventListener("click", () => {
    box.style.display = "none";
    settingsBox.style.display = "none";
  });

  // Pointer-captured drag so the game does not steal movement.
  const handle = box.querySelector(".taco-head");
  let drag = null;
  handle.addEventListener("pointerdown", e => {
    if (e.button !== 0 || e.target.closest("button")) return;
    const r = box.getBoundingClientRect();
    drag = { id:e.pointerId, sx:e.clientX, sy:e.clientY, left:r.left, top:r.top };
    try { handle.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  handle.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    const left = Math.max(0, Math.min(drag.left + e.clientX-drag.sx, innerWidth-box.offsetWidth));
    const top = Math.max(0, Math.min(drag.top + e.clientY-drag.sy, innerHeight-box.offsetHeight));
    box.style.left = `${left}px`; box.style.top = `${top}px`;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.id) return;
    try { handle.releasePointerCapture(e.pointerId); } catch {}
    const r = box.getBoundingClientRect();
    setValue(POS, {left:r.left, top:r.top});
    drag = null;
    e.preventDefault(); e.stopImmediatePropagation();
  };
  handle.addEventListener("pointerup", endDrag, true);
  handle.addEventListener("pointercancel", endDrag, true);

  requestMembers(true);
  render();
  timer = setInterval(() => {
    requestMembers(false);
    render();
  }, 2000);

  page.TeriashClanOnline = {
    open() { box.style.display = ""; requestMembers(true); render(); },
    close() { box.style.display = "none"; settingsBox.style.display = "none"; },
    openSettings() {
      syncSettings();
      const r = box.getBoundingClientRect();
      settingsBox.style.left = `${Math.min(r.right + 8, innerWidth - 300)}px`;
      settingsBox.style.top = `${Math.min(r.top, innerHeight - 180)}px`;
      settingsBox.style.display = "";
    },
    closeSettings() { settingsBox.style.display = "none"; },
    destroy() {
      clearInterval(timer);
      settingsBox.remove(); box.remove(); style.remove();
      delete page.TeriashClanOnline;
    }
  };
})();