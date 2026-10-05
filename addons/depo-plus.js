(() => {
  "use strict";

  if (window.TeriashDepoPlus) return;

  const VERSION = "0.1.0";
  const PREFIX = "[Teriash Depozyt+]";
  let observer = null;
  let lastSnapshot = [];

  const isPrivateDepoItem = item => {
    try {
      const loc = window.Engine?.itemsFetchData?.NEW_PRIVATE_DEPO_ITEM?.loc;
      return !!item && item.loc === loc;
    } catch { return false; }
  };

  function readDepoItems() {
    const out = [];
    const seen = new Set();
    document.querySelectorAll(".depo-window .item, .depo .item, .window-depo .item").forEach(el => {
      try {
        const item = window.jQuery ? window.jQuery(el).data("item") : null;
        if (!isPrivateDepoItem(item) || seen.has(String(item.id))) return;
        seen.add(String(item.id));
        out.push({
          id: item.id,
          name: item.name,
          x: Number(item.x),
          y: Number(item.y),
          loc: item.loc,
          amount: item.getAmountStat?.() ?? null,
          cansplit: item.getCansplitStat?.() ?? null,
          capacity: item.getCapacityStat?.() ?? null,
          item
        });
      } catch {}
    });
    lastSnapshot = out;
    return out;
  }

  function printSnapshot() {
    const items = readDepoItems();
    console.group(`${PREFIX} prywatny depozyt (${items.length} przedmiotów)`);
    console.table(items.map(({ item, ...x }) => x));
    console.info("Na tym etapie dodatek niczego nie przenosi i nie wysyła eksperymentalnych requestów.");
    console.groupEnd();
    return items;
  }

  function installMarker() {
    document.querySelectorAll(".depo-window, .depo, .window-depo").forEach(root => {
      if (root.dataset.teriashDepoPlus === "1") return;
      root.dataset.teriashDepoPlus = "1";
      root.addEventListener("contextmenu", e => {
        const el = e.target.closest?.(".item");
        if (!el || !e.altKey || !window.jQuery) return;
        const item = window.jQuery(el).data("item");
        if (!isPrivateDepoItem(item)) return;
        console.info(`${PREFIX} przedmiot`, {
          id: item.id, name: item.name, x: item.x, y: item.y, loc: item.loc,
          amount: item.getAmountStat?.(), cansplit: item.getCansplitStat?.(), capacity: item.getCapacityStat?.(), item
        });
      }, true);
    });
  }

  function start() {
    installMarker();
    observer = new MutationObserver(() => installMarker());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    console.info(`${PREFIX} v${VERSION} uruchomiony. Otwórz prywatny depozyt i użyj TeriashDepoPlus.snapshot(). Alt+PPM na przedmiocie pokaże jego dane.`);
  }

  function destroy() {
    observer?.disconnect();
    observer = null;
  }

  window.TeriashDepoPlus = {
    version: VERSION,
    snapshot: printSnapshot,
    items: () => lastSnapshot.length ? lastSnapshot : readDepoItems(),
    destroy
  };

  start();
})();
