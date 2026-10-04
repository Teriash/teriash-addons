(() => {
  "use strict";

  const TA = window.TeriashAddons;
  if (!TA || TA.panelStarted) return;
  TA.panelStarted = true;

  const state = TA.state;
  const manifest = TA.manifest;

  function save() {
    TA.bridge.setValue("teriashAddons.enabled", state.enabled);
  }

  function addonById(id) {
    return manifest.addons.find(a => a.id === id);
  }

  function loadAddon(id) {
    const addon = addonById(id);
    if (!addon || TA.loaded.has(id) || TA.loading.has(id)) return;

    TA.loading.add(id);
    const script = document.createElement("script");
    script.src = TA.url(addon.file);
    script.async = true;
    script.dataset.teriashAddon = id;

    script.onload = () => {
      TA.loading.delete(id);
      TA.loaded.add(id);
      render();
    };

    script.onerror = () => {
      TA.loading.delete(id);
      console.error(`[Teriash Addons] Nie udało się wczytać: ${addon.name}`);
      render();
    };

    document.head.appendChild(script);
  }

  function setEnabled(id, enabled) {
    state.enabled[id] = enabled;
    save();

    if (enabled) {
      loadAddon(id);
    } else {
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

  function openSettings(addon) {
    const api = addon.settingsGlobal ? window[addon.settingsGlobal] : null;
    const fn = addon.settingsMethod ? api?.[addon.settingsMethod] : null;
    if (typeof fn === "function") fn.call(api);
  }

  function createUi() {
    if (!document.getElementById("ta-launcher")) {
      const launcher = document.createElement("button");
      launcher.id = "ta-launcher";
      launcher.textContent = "TA";
      launcher.title = "Teriash Addons";
      launcher.addEventListener("click", () => {
        document.getElementById("ta-panel")?.classList.toggle("ta-open");
      });
      document.body.appendChild(launcher);
    }

    if (!document.getElementById("ta-panel")) {
      const panel = document.createElement("div");
      panel.id = "ta-panel";
      panel.innerHTML = `
        <div class="ta-head">
          <div>
            <div class="ta-title">Teriash Addons</div>
            <div class="ta-sub">Zestaw dodatków do Margonem</div>
          </div>
          <button class="ta-close" type="button">×</button>
        </div>
        <div class="ta-body"></div>
        <div class="ta-note">Wyłączenie dodatku, który nie obsługuje zatrzymania na żywo, zacznie obowiązywać po odświeżeniu gry.</div>
      `;
      panel.querySelector(".ta-close").addEventListener("click", () => panel.classList.remove("ta-open"));
      document.body.appendChild(panel);
    }
  }

  function render() {
    createUi();
    const body = document.querySelector("#ta-panel .ta-body");
    if (!body) return;

    body.innerHTML = "";

    for (const addon of manifest.addons) {
      const enabled = !!state.enabled[addon.id];
      const loaded = TA.loaded.has(addon.id);
      const loading = TA.loading.has(addon.id);

      const row = document.createElement("div");
      row.className = "ta-addon";
      row.innerHTML = `
        <div>
          <div class="ta-name">${addon.name}<span class="ta-ver">v${addon.version}</span></div>
          <div class="ta-desc">${addon.description}</div>
        </div>
        <div class="ta-actions">
          <button class="ta-settings" type="button" title="Ustawienia" ${addon.settingsGlobal && loaded ? "" : "disabled"}>⚙</button>
          <button class="ta-toggle ${enabled ? "on" : ""}" type="button">${loading ? "..." : enabled ? "ON" : "OFF"}</button>
        </div>
      `;

      row.querySelector(".ta-toggle").addEventListener("click", () => setEnabled(addon.id, !enabled));
      row.querySelector(".ta-settings").addEventListener("click", () => openSettings(addon));
      body.appendChild(row);
    }
  }

  createUi();
  render();

  for (const addon of manifest.addons) {
    if (state.enabled[addon.id]) loadAddon(addon.id);
  }
})();
