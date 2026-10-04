// ==UserScript==
// @name         Teriash Addons
// @namespace    https://margonem.pl/
// @version      1.0.3
// @description  Panel i loader dodatków Teriash do Margonem
// @author       Teriash
// @updateURL    https://github.com/Teriash/teriash-addons/raw/refs/heads/main/teriash-addons.user.js
// @downloadURL  https://github.com/Teriash/teriash-addons/raw/refs/heads/main/teriash-addons.user.js
// @match        https://*.margonem.pl/*
// @match        https://*.margonem.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @connect       cdn.jsdelivr.net
// @run-at       document-body
// ==/UserScript==

;(async function () {
  "use strict";

  const page = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  const BASE = "https://cdn.jsdelivr.net/gh/Teriash/teriash-addons@main/";
  const CACHE = String(Date.now());

  const url = path => `${BASE}${path}?v=${CACHE}`;

  page.TeriashAddonsBridge = {
    getValue: (key, fallback = null) => GM_getValue(key, fallback),
    setValue: (key, value) => GM_setValue(key, value),
    deleteValue: key => GM_deleteValue(key)
  };

  try {
    console.info("[Teriash Addons] Start loadera v1.0.3");
    const response = await fetch(url("manifest.json"));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();

    const saved = GM_getValue("teriashAddons.enabled", {});
    const enabled = {};

    for (const addon of manifest.addons) {
      enabled[addon.id] =
        typeof saved?.[addon.id] === "boolean"
          ? saved[addon.id]
          : !!addon.defaultEnabled;
    }

    page.TeriashAddons = {
      manifest,
      bridge: page.TeriashAddonsBridge,
      state: { enabled },
      loaded: new Set(),
      loading: new Set(),
      url
    };

    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = url("core/panel.css");
    (document.head || document.documentElement).appendChild(style);

    const script = document.createElement("script");
    script.src = url("core/panel.js");
    script.onload = () => console.info("[Teriash Addons] Panel załadowany");
    script.onerror = () => console.error("[Teriash Addons] Błąd ładowania core/panel.js", script.src);
    (document.head || document.documentElement).appendChild(script);
  } catch (error) {
    console.error("[Teriash Addons] Nie udało się uruchomić loadera:", error);
  }
})();
