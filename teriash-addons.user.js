// ==UserScript==
// @name         Teriash Addons
// @namespace    https://margonem.pl/
// @version      1.2.2
// @description  Panel i loader dodatków Teriash do Margonem
// @author       Teriash
// @updateURL    https://raw.githubusercontent.com/Teriash/teriash-addons/main/teriash-addons.user.js
// @downloadURL  https://raw.githubusercontent.com/Teriash/teriash-addons/main/teriash-addons.user.js
// @match        https://*.margonem.pl/*
// @match        https://*.margonem.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @run-at       document-body
// ==/UserScript==

;(async function () {
  "use strict";

  const page = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  const BASE = "https://raw.githubusercontent.com/Teriash/teriash-addons/main/";
  const CACHE = String(Date.now());
  const url = path => `${BASE}${path}?v=${CACHE}`;

  function getText(path) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: url(path),
        headers: { "Cache-Control": "no-cache" },
        onload: r => {
          if (r.status >= 200 && r.status < 300) resolve(r.responseText);
          else reject(new Error(`${path}: HTTP ${r.status}`));
        },
        onerror: () => reject(new Error(`${path}: błąd połączenia`))
      });
    });
  }

  page.TeriashAddonsBridge = {
    getValue: (key, fallback = null) => GM_getValue(key, fallback),
    setValue: (key, value) => GM_setValue(key, value),
    deleteValue: key => GM_deleteValue(key),
    getText
  };

  function isGameView() {
    return !!(
      page.Engine &&
      (document.querySelector("#GAME_CANVAS") ||
       document.querySelector(".game-layer") ||
       document.querySelector(".interface-layer"))
    );
  }

  async function waitForGameView(timeout = 30000) {
    if (isGameView()) return true;

    return await new Promise(resolve => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (isGameView()) {
          clearInterval(timer);
          resolve(true);
        } else if (Date.now() - started >= timeout) {
          clearInterval(timer);
          resolve(false);
        }
      }, 250);
    });
  }

  try {

    if (!(await waitForGameView())) {

      return;
    }

    const manifest = JSON.parse(await getText("manifest.json"));
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

    const css = await getText("core/panel.css");
    const style = document.createElement("style");
    style.id = "ta-core-style";
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);

    const js = await getText("core/panel.js");
    const script = document.createElement("script");
    script.id = "ta-core-script";
    script.textContent = `${js}\n//# sourceURL=teriash-addons/core/panel.js`;
    (document.head || document.documentElement).appendChild(script);

  } catch (error) {
    console.error("[Teriash Addons] Nie udało się uruchomić loadera:", error);
  }
})();
