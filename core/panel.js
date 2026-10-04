(() => {
  "use strict";

  const TA = window.TeriashAddons;
  if (!TA || TA.panelStarted) return;
  TA.panelStarted = true;

  const state = TA.state;
  const manifest = TA.manifest;
  const POS_KEY = "teriashAddons.positions";

  function save() { TA.bridge.setValue("teriashAddons.enabled", state.enabled); }
  function addonById(id) { return manifest.addons.find(a => a.id === id); }
  function getPositions() { return TA.bridge.getValue(POS_KEY, {}) || {}; }
  function savePosition(name, el) {
    const pos = getPositions();
    const r = el.getBoundingClientRect();
    pos[name] = { x: Math.round(r.left), y: Math.round(r.top) };
    TA.bridge.setValue(POS_KEY, pos);
  }
  function restorePosition(name, el) {
    const p = getPositions()[name];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const maxX = Math.max(0, innerWidth - el.offsetWidth);
    const maxY = Math.max(0, innerHeight - el.offsetHeight);
    el.style.left = `${Math.max(0, Math.min(p.x, maxX))}px`;
    el.style.top = `${Math.max(0, Math.min(p.y, maxY))}px`;
    el.style.right = "auto";
    el.style.bottom = "auto";
  }

  function makeDraggable(el, handle, name, suppressClick = false) {
    let drag = null;
    handle.addEventListener("pointerdown", e => {
      if (e.button !== 0 || e.target.closest("button") && handle !== el) return;
      const r = el.getBoundingClientRect();
      drag = { sx: e.clientX, sy: e.clientY, x: r.left, y: r.top, moved: false };
      handle.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener("pointermove", e => {
      if (!drag) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      const maxX = Math.max(0, innerWidth - el.offsetWidth);
      const maxY = Math.max(0, innerHeight - el.offsetHeight);
      el.style.left = `${Math.max(0, Math.min(drag.x + dx, maxX))}px`;
      el.style.top = `${Math.max(0, Math.min(drag.y + dy, maxY))}px`;
      el.style.right = "auto";
      el.style.bottom = "auto";
    });
    const finish = e => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      if (moved) {
        savePosition(name, el);
        if (suppressClick) {
          el.dataset.taDragged = "1";
          setTimeout(() => delete el.dataset.taDragged, 0);
        }
      }
      handle.releasePointerCapture?.(e.pointerId);
    };
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }

  function loadAddon(id) {
    const addon = addonById(id);
    if (!addon || TA.loaded.has(id) || TA.loading.has(id)) return;
    TA.loading.add(id);
    const script = document.createElement("script");
    script.src = TA.url(addon.file);
    script.async = true;
    script.dataset.teriashAddon = id;
    script.onload = () => { TA.loading.delete(id); TA.loaded.add(id); render(); };
    script.onerror = () => { TA.loading.delete(id); console.error(`[Teriash Addons] Nie udało się wczytać: ${addon.name}`); render(); };
    document.head.appendChild(script);
  }

  function setEnabled(id, enabled) {
    state.enabled[id] = enabled;
    save();
    if (enabled) loadAddon(id);
    else {
      const addon = addonById(id);
      const api = addon?.settingsGlobal ? window[addon.settingsGlobal] : null;
      if (typeof api?.destroy === "function") {
        try { api.destroy(); } catch (e) { console.error(e); }
        TA.loaded.delete(id);
        document.querySelector(`script[data-teriash-addon="${id}"]`)?.remove();
      }
    }
    render();
  }

  function toggleSettings(addon) {
    const api = addon.settingsGlobal ? window[addon.settingsGlobal] : null;
    if (!api) return;
    const panel = addon.id === "legendaryPulse" ? document.getElementById("lp-settings") : null;
    const visible = panel ? panel.classList.contains("visible") : TA.openSettingsId === addon.id;
    if (visible && typeof api.closeSettings === "function") {
      api.closeSettings();
      TA.openSettingsId = null;
    } else {
      const fn = addon.settingsMethod ? api[addon.settingsMethod] : null;
      if (typeof fn === "function") {
        fn.call(api);
        TA.openSettingsId = addon.id;
      }
    }
  }

  function createUi() {
    if (!document.getElementById("ta-launcher")) {
      const launcher = document.createElement("button");
      launcher.id = "ta-launcher";
      launcher.textContent = "TA";
      launcher.title = "Teriash Addons — przeciągnij, aby przenieść";
      launcher.addEventListener("click", () => {
        if (launcher.dataset.taDragged) return;
        document.getElementById("ta-panel")?.classList.toggle("ta-open");
      });
      document.body.appendChild(launcher);
      restorePosition("launcher", launcher);
      makeDraggable(launcher, launcher, "launcher", true);
    }

    if (!document.getElementById("ta-panel")) {
      const panel = document.createElement("div");
      panel.id = "ta-panel";
      panel.innerHTML = `
        <div class="ta-head" title="Przeciągnij, aby przenieść panel">
          <div><div class="ta-title">Teriash Addons</div><div class="ta-sub">Zestaw dodatków do Margonem</div></div>
          <button class="ta-close" type="button">×</button>
        </div>
        <div class="ta-body"></div>
        <div class="ta-note">Wyłączenie dodatku, który nie obsługuje zatrzymania na żywo, zacznie obowiązywać po odświeżeniu gry.</div>`;
      panel.querySelector(".ta-close").addEventListener("click", () => panel.classList.remove("ta-open"));
      document.body.appendChild(panel);
      restorePosition("panel", panel);
      makeDraggable(panel, panel.querySelector(".ta-head"), "panel");
    }
  }

  function render() {
    createUi();
    const body = document.querySelector("#ta-panel .ta-body");
    if (!body) return;
    body.innerHTML = "";
    for (const addon of manifest.addons) {
      const enabled = !!state.enabled[addon.id], loaded = TA.loaded.has(addon.id), loading = TA.loading.has(addon.id);
      const row = document.createElement("div");
      row.className = "ta-addon";
      row.innerHTML = `<div><div class="ta-name">${addon.name}<span class="ta-ver">v${addon.version}</span></div><div class="ta-desc">${addon.description}</div></div>
        <div class="ta-actions"><button class="ta-settings" type="button" title="Otwórz / zamknij ustawienia" ${addon.settingsGlobal && loaded ? "" : "disabled"}>⚙</button>
        <button class="ta-toggle ${enabled ? "on" : ""}" type="button">${loading ? "..." : enabled ? "ON" : "OFF"}</button></div>`;
      row.querySelector(".ta-toggle").addEventListener("click", () => setEnabled(addon.id, !enabled));
      row.querySelector(".ta-settings").addEventListener("click", () => toggleSettings(addon));
      body.appendChild(row);
    }
  }

  createUi();
  render();
  for (const addon of manifest.addons) if (state.enabled[addon.id]) loadAddon(addon.id);
})();
