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
      if (e.button !== 0) return;
      if (handle !== el && e.target.closest("button")) return;

      const r = el.getBoundingClientRect();
      drag = {
        id: e.pointerId,
        sx: e.clientX,
        sy: e.clientY,
        x: r.left,
        y: r.top,
        moved: false
      };

      el.style.left = `${r.left}px`;
      el.style.top = `${r.top}px`;
      el.style.right = "auto";
      el.style.bottom = "auto";

      try { handle.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);

    handle.addEventListener("pointermove", e => {
      if (!drag || e.pointerId !== drag.id) return;

      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 3) return;
      drag.moved = true;

      const maxX = Math.max(0, innerWidth - el.offsetWidth);
      const maxY = Math.max(0, innerHeight - el.offsetHeight);
      el.style.left = `${Math.max(0, Math.min(drag.x + dx, maxX))}px`;
      el.style.top = `${Math.max(0, Math.min(drag.y + dy, maxY))}px`;

      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);

    const finish = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = drag.moved;
      try { handle.releasePointerCapture(e.pointerId); } catch {}
      drag = null;

      if (moved) {
        savePosition(name, el);
        if (suppressClick) {
          el.dataset.taDragged = "1";
          setTimeout(() => delete el.dataset.taDragged, 250);
        }
      }

      e.preventDefault();
      e.stopImmediatePropagation();
    };

    handle.addEventListener("pointerup", finish, true);
    handle.addEventListener("pointercancel", finish, true);
  }

  async function loadAddon(id) {
    const addon = addonById(id);
    if (!addon || TA.loaded.has(id) || TA.loading.has(id)) return;
    TA.loading.add(id);
    render();
    try {
      const code = await TA.bridge.getText(addon.file);
      const script = document.createElement("script");
      script.dataset.teriashAddon = id;
      script.textContent = `${code}\n//# sourceURL=teriash-addons/${addon.file}`;
      (document.head || document.documentElement).appendChild(script);
      TA.loaded.add(id);
      console.info(`[Teriash Addons] Załadowano ${addon.name} v${addon.version}`);
    } catch (e) {
      console.error(`[Teriash Addons] Nie udało się wczytać: ${addon.name}`, e);
    } finally {
      TA.loading.delete(id);
      render();
    }
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

    if (addon.id === "legendaryPulse") {
      const settings = document.getElementById("lp-settings");
      const isOpen = !!settings?.classList.contains("visible");
      console.info(`[Teriash Addons] Legendary Pulse settings: ${isOpen ? "zamykam" : "otwieram"}`);
      if (isOpen) {
        if (typeof api.closeSettings === "function") api.closeSettings();
        else settings?.classList.remove("visible");
      } else {
        if (typeof api.openSettings === "function") api.openSettings();
        else settings?.classList.add("visible");
      }
      return;
    }

    const isOpen = TA.openSettingsId === addon.id;
    if (isOpen && typeof api.closeSettings === "function") {
      api.closeSettings();
      TA.openSettingsId = null;
      return;
    }
    const open = addon.settingsMethod ? api[addon.settingsMethod] : api.openSettings;
    if (typeof open === "function") {
      open.call(api);
      TA.openSettingsId = addon.id;
    }
  }

  function createUi() {
    if (!document.getElementById("ta-launcher")) {
      const launcher = document.createElement("button");
      launcher.id = "ta-launcher";
      launcher.textContent = "TA";
      launcher.title = "Teriash Addons — przeciągnij, aby przenieść";
      launcher.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
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
      panel.querySelector(".ta-close").addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); panel.classList.remove("ta-open"); });
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
      row.querySelector(".ta-toggle").addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); setEnabled(addon.id, !enabled); });
      row.querySelector(".ta-settings").addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); toggleSettings(addon); });
      body.appendChild(row);
    }
  }

  createUi();
  render();
  for (const addon of manifest.addons) if (state.enabled[addon.id]) loadAddon(addon.id);
})();
